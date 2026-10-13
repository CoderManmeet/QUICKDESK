// QuickDesk - src/lib/jobs/scheduled.ts
//
// The scheduled job, run every few minutes by /api/cron/run:
//   1. SLA warnings    - a target is under 25 percent of its time left
//   2. Escalation      - first breach: team leads; second breach: admins
//   3. Auto-close      - resolved tickets with no reply for 7 days
//   4. Time rules      - TIME_ELAPSED automation rules
//
// Every step "claims" a ticket with a conditional update before notifying,
// so running the job twice never sends the same warning twice.
// Warning and escalation bookkeeping keeps the ticket's updatedAt as it was:
// it is not activity, so it must not reset "time elapsed" rules or show up
// in "Recently updated".

import "server-only";
import { TicketEventType, TicketStatus } from "@prisma/client";
import { runTimeElapsedRules } from "@/lib/automation/engine";
import { db } from "@/lib/db";
import { notifyEscalation, notifySlaWarning } from "@/lib/notifications/notify";

const WARNING_FRACTION = 0.25;
const AUTO_CLOSE_DAYS = 7;
const RUNNING: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS];

export type JobSummary = {
  warnings: number;
  escalations: number;
  autoClosed: number;
  automationRuns: number;
};

function nearlyDue(createdAt: Date, dueAt: Date, now: Date): boolean {
  const total = dueAt.getTime() - createdAt.getTime();
  const left = dueAt.getTime() - now.getTime();
  return total > 0 && left > 0 && left / total < WARNING_FRACTION;
}

/** Warns before a target is missed. Paused (waiting on customer) tickets are skipped. */
async function sendSlaWarnings(now: Date): Promise<number> {
  const tickets = await db.ticket.findMany({
    where: {
      deletedAt: null,
      status: { in: RUNNING },
      slaPausedAt: null,
      OR: [
        { firstRespondedAt: null, firstResponseWarnedAt: null, firstResponseDueAt: { gt: now } },
        { resolutionWarnedAt: null, resolutionDueAt: { gt: now } },
      ],
    },
    take: 1000,
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      firstRespondedAt: true,
      firstResponseDueAt: true,
      firstResponseWarnedAt: true,
      resolutionDueAt: true,
      resolutionWarnedAt: true,
    },
  });

  let sent = 0;
  for (const ticket of tickets) {
    if (
      !ticket.firstRespondedAt &&
      !ticket.firstResponseWarnedAt &&
      ticket.firstResponseDueAt &&
      nearlyDue(ticket.createdAt, ticket.firstResponseDueAt, now)
    ) {
      const claim = await db.ticket.updateMany({
        where: { id: ticket.id, firstResponseWarnedAt: null },
        data: { firstResponseWarnedAt: now, updatedAt: ticket.updatedAt },
      });
      if (claim.count === 1) {
        await notifySlaWarning(ticket.id, "first response", ticket.firstResponseDueAt);
        sent += 1;
      }
    }
    if (
      !ticket.resolutionWarnedAt &&
      ticket.resolutionDueAt &&
      nearlyDue(ticket.createdAt, ticket.resolutionDueAt, now)
    ) {
      const claim = await db.ticket.updateMany({
        where: { id: ticket.id, resolutionWarnedAt: null },
        data: { resolutionWarnedAt: now, updatedAt: ticket.updatedAt },
      });
      if (claim.count === 1) {
        await notifySlaWarning(ticket.id, "resolution", ticket.resolutionDueAt);
        sent += 1;
      }
    }
  }
  return sent;
}

/**
 * A ticket has two SLA targets. The first one missed escalates to the team
 * leads (level 1); a second one missed escalates to the admins (level 2).
 * Paused tickets are skipped; escalation never goes back down.
 */
async function escalateBreaches(now: Date): Promise<number> {
  const tickets = await db.ticket.findMany({
    where: {
      deletedAt: null,
      status: { in: RUNNING },
      slaPausedAt: null,
      escalationLevel: { lt: 2 },
      OR: [{ firstResponseDueAt: { lt: now } }, { resolutionDueAt: { lt: now } }],
    },
    take: 1000,
    select: {
      id: true,
      updatedAt: true,
      escalationLevel: true,
      firstRespondedAt: true,
      firstResponseDueAt: true,
      resolutionDueAt: true,
    },
  });

  let escalated = 0;
  for (const ticket of tickets) {
    const firstBreached = ticket.firstResponseDueAt
      ? ticket.firstRespondedAt
        ? ticket.firstRespondedAt > ticket.firstResponseDueAt
        : ticket.firstResponseDueAt < now
      : false;
    const resolutionBreached = ticket.resolutionDueAt ? ticket.resolutionDueAt < now : false;
    const level = Math.min(2, Number(firstBreached) + Number(resolutionBreached));
    if (level <= ticket.escalationLevel) continue;

    const claim = await db.ticket.updateMany({
      where: { id: ticket.id, escalationLevel: ticket.escalationLevel },
      data: { escalationLevel: level, escalatedAt: now, updatedAt: ticket.updatedAt },
    });
    if (claim.count !== 1) continue;

    await db.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        actorId: null,
        type: TicketEventType.ESCALATED,
        fromValue: String(ticket.escalationLevel),
        toValue: String(level),
      },
    });
    await notifyEscalation(ticket.id, level as 1 | 2);
    escalated += 1;
  }
  return escalated;
}

/** Resolved tickets close after 7 days. A requester reply would have reopened them. */
async function autoCloseResolved(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - AUTO_CLOSE_DAYS * 24 * 60 * 60 * 1000);
  const tickets = await db.ticket.findMany({
    where: { deletedAt: null, status: TicketStatus.RESOLVED, resolvedAt: { lte: cutoff } },
    take: 1000,
    select: { id: true },
  });

  let closed = 0;
  for (const ticket of tickets) {
    const done = await db.$transaction(async (tx) => {
      const claim = await tx.ticket.updateMany({
        where: { id: ticket.id, status: TicketStatus.RESOLVED, resolvedAt: { lte: cutoff } },
        data: { status: TicketStatus.CLOSED, closedAt: now },
      });
      if (claim.count !== 1) return false;
      await tx.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: null,
          type: TicketEventType.STATUS_CHANGED,
          fromValue: TicketStatus.RESOLVED,
          toValue: TicketStatus.CLOSED,
        },
      });
      return true;
    });
    if (done) closed += 1;
  }
  return closed;
}

export async function runScheduledJobs(now: Date = new Date()): Promise<JobSummary> {
  const warnings = await sendSlaWarnings(now);
  const escalations = await escalateBreaches(now);
  const autoClosed = await autoCloseResolved(now);
  const automationRuns = await runTimeElapsedRules(now);
  return { warnings, escalations, autoClosed, automationRuns };
}
