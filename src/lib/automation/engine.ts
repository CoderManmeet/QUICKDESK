// QuickDesk - src/lib/automation/engine.ts
//
// Runs automation rules. Rules run in admin-defined order; each rule reads the
// ticket fresh, so later rules see what earlier rules changed. Every rule runs
// in its own transaction and acts as "System" in the activity timeline.
//
// Changes made by rules never trigger TICKET_UPDATED rules again, so rules
// cannot loop. Closed and cancelled tickets are never touched.

import "server-only";
import {
  AutomationTrigger,
  Prisma,
  Role,
  TicketEventType,
  TicketStatus,
  type AutomationRule,
} from "@prisma/client";
import { db } from "@/lib/db";
import { notifyAssigned, notifyAutomation, type AutomationRecipient } from "@/lib/notifications/notify";
import {
  storedActionsSchema,
  storedConditionsSchema,
  type Action,
  type Condition,
} from "@/lib/automation/schema";
import { applyStatus, slaForPriority, workSelect, type Tx, type WorkTicket } from "@/lib/tickets/core";

const ENDED: TicketStatus[] = [TicketStatus.CLOSED, TicketStatus.CANCELLED];

type ParsedRule = {
  id: string;
  name: string;
  conditions: Condition[];
  actions: Action[];
};

type AfterCommit = () => Promise<void>;

function parseRule(rule: AutomationRule): ParsedRule | null {
  const conditions = storedConditionsSchema.safeParse(rule.conditions);
  const actions = storedActionsSchema.safeParse(rule.actions);
  if (!conditions.success || !actions.success) {
    console.error(`Automation rule "${rule.name}" (${rule.id}) is invalid and was skipped.`);
    return null;
  }
  return { id: rule.id, name: rule.name, conditions: conditions.data, actions: actions.data };
}

export function matches(conditions: Condition[], ticket: WorkTicket): boolean {
  return conditions.every((condition) => {
    switch (condition.field) {
      case "category":
        return ticket.categoryId === condition.value;
      case "priority":
        return ticket.priority === condition.value;
      case "status":
        return ticket.status === condition.value;
      case "subject_contains":
        return ticket.subject.toLowerCase().includes(condition.value.toLowerCase());
      default:
        return false;
    }
  });
}

/** Active agents in a team, falling back to team leads if there are no agents. */
async function roundRobinPool(tx: Tx, teamId: string): Promise<string[]> {
  const members = await tx.teamMember.findMany({
    where: {
      teamId,
      user: { isActive: true, deletedAt: null, role: { in: [Role.AGENT, Role.TEAM_LEAD] } },
    },
    orderBy: { userId: "asc" },
    select: { userId: true, user: { select: { role: true } } },
  });
  const agents = members.filter((m) => m.user.role === Role.AGENT).map((m) => m.userId);
  return agents.length > 0 ? agents : members.map((m) => m.userId);
}

/** Next agent after the team's cursor. The team row is locked so two tickets never race. */
async function nextRoundRobin(tx: Tx, teamId: string): Promise<string | null> {
  await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
  const team = await tx.team.findFirst({
    where: { id: teamId, deletedAt: null },
    select: { lastAssignedUserId: true },
  });
  if (!team) return null;

  const pool = await roundRobinPool(tx, teamId);
  if (pool.length === 0) return null;

  const last = team.lastAssignedUserId ? pool.indexOf(team.lastAssignedUserId) : -1;
  const next = pool[(last + 1) % pool.length];
  await tx.team.update({ where: { id: teamId }, data: { lastAssignedUserId: next } });
  return next;
}

async function assign(
  tx: Tx,
  ticket: WorkTicket,
  teamId: string,
  assigneeId: string | null,
  after: AfterCommit[],
): Promise<void> {
  // Same rule as for people: resolved tickets are not reassigned.
  if (ticket.status === TicketStatus.RESOLVED) return;

  const team = await tx.team.findFirst({ where: { id: teamId, deletedAt: null }, select: { id: true } });
  if (!team) return;

  if (assigneeId) {
    const member = await tx.teamMember.findFirst({
      where: {
        teamId,
        userId: assigneeId,
        user: { isActive: true, deletedAt: null, role: { not: Role.REQUESTER } },
      },
      select: { userId: true },
    });
    if (!member) return;
  } else if (ticket.assigneeId) {
    // Moving to another team: keep the assignee only if they belong to it.
    const stays = await tx.teamMember.findFirst({
      where: { teamId, userId: ticket.assigneeId },
      select: { userId: true },
    });
    assigneeId = stays ? ticket.assigneeId : null;
  }

  const teamChanged = ticket.teamId !== teamId;
  const assigneeChanged = ticket.assigneeId !== assigneeId;
  if (!teamChanged && !assigneeChanged) return;

  await tx.ticket.update({ where: { id: ticket.id }, data: { teamId, assigneeId } });
  const events: Prisma.TicketEventCreateManyInput[] = [];
  if (teamChanged) {
    events.push({ ticketId: ticket.id, actorId: null, type: TicketEventType.TEAM_CHANGED, fromValue: ticket.teamId, toValue: teamId });
  }
  if (assigneeChanged) {
    events.push({ ticketId: ticket.id, actorId: null, type: TicketEventType.ASSIGNEE_CHANGED, fromValue: ticket.assigneeId, toValue: assigneeId });
  }
  await tx.ticketEvent.createMany({ data: events });

  ticket.teamId = teamId;
  ticket.assigneeId = assigneeId;

  if (assigneeId && ticket.status === TicketStatus.OPEN) {
    await applyStatus(tx, ticket, TicketStatus.IN_PROGRESS, null);
    ticket.status = TicketStatus.IN_PROGRESS;
  }
  if (assigneeChanged && assigneeId) {
    const ticketId = ticket.id;
    const newAssignee = assigneeId;
    after.push(() => notifyAssigned(ticketId, newAssignee, null));
  }
}

async function applyAction(
  tx: Tx,
  rule: ParsedRule,
  ticket: WorkTicket,
  action: Action,
  after: AfterCommit[],
): Promise<void> {
  switch (action.type) {
    case "assign_team":
      await assign(tx, ticket, action.teamId, null, after);
      return;

    case "assign_agent":
      await assign(tx, ticket, action.teamId, action.userId, after);
      return;

    case "round_robin": {
      if (ticket.status === TicketStatus.RESOLVED) return;
      const next = await nextRoundRobin(tx, action.teamId);
      if (next) await assign(tx, ticket, action.teamId, next, after);
      return;
    }

    case "set_priority": {
      if (ticket.priority === action.priority) return;
      const sla = await slaForPriority(tx, ticket, action.priority);
      await tx.ticket.update({ where: { id: ticket.id }, data: { priority: action.priority, ...sla } });
      await tx.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: null,
          type: TicketEventType.PRIORITY_CHANGED,
          fromValue: ticket.priority,
          toValue: action.priority,
        },
      });
      ticket.priority = action.priority;
      if (sla.firstResponseDueAt instanceof Date) ticket.firstResponseDueAt = sla.firstResponseDueAt;
      if (sla.resolutionDueAt instanceof Date) ticket.resolutionDueAt = sla.resolutionDueAt;
      return;
    }

    case "add_tag": {
      const tag = await tx.tag.findUnique({ where: { id: action.tagId }, select: { id: true, name: true } });
      if (!tag) return;
      const created = await tx.ticketTag.createMany({
        data: [{ ticketId: ticket.id, tagId: tag.id }],
        skipDuplicates: true,
      });
      if (created.count === 1) {
        await tx.ticketEvent.create({
          data: { ticketId: ticket.id, actorId: null, type: TicketEventType.TAG_ADDED, toValue: tag.name },
        });
      }
      return;
    }

    case "notify": {
      const ticketId = ticket.id;
      const recipient: AutomationRecipient = action.recipient;
      const message = action.message;
      after.push(() => notifyAutomation(ticketId, recipient, rule.name, message));
      return;
    }
  }
}

/** Runs one rule against one ticket. Returns true when the rule matched and ran. */
async function applyRule(rule: ParsedRule, ticketId: string): Promise<boolean> {
  const after: AfterCommit[] = [];

  const fired = await db.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: workSelect });
    if (!ticket || ticket.deletedAt || ENDED.includes(ticket.status)) return false;
    if (!matches(rule.conditions, ticket)) return false;

    for (const action of rule.actions) {
      await applyAction(tx, rule, ticket, action, after);
    }
    // Recorded after the actions, so firedAt is never earlier than the
    // ticket's updatedAt from this run.
    await tx.automationRun.create({ data: { ruleId: rule.id, ticketId, firedAt: new Date() } });
    return true;
  });

  for (const task of after) await task();
  return fired;
}

/**
 * Runs every enabled rule for an event on one ticket. Never throws: a broken
 * rule is logged and skipped so it can never block the user's own change.
 */
export async function runAutomation(
  trigger: "TICKET_CREATED" | "TICKET_UPDATED",
  ticketId: string,
): Promise<void> {
  try {
    const rules = await db.automationRule.findMany({
      where: { trigger: AutomationTrigger[trigger], isEnabled: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    for (const raw of rules) {
      const rule = parseRule(raw);
      if (!rule) continue;
      try {
        await applyRule(rule, ticketId);
      } catch (error) {
        console.error(`Automation rule "${rule.name}" failed on ticket ${ticketId}:`, error);
      }
    }
  } catch (error) {
    console.error("Automation failed:", error);
  }
}

/**
 * TIME_ELAPSED rules, called by the scheduled job. A rule fires on a ticket
 * once it has had no activity for the rule's number of minutes, and then not
 * again until there has been new activity on the ticket.
 */
export async function runTimeElapsedRules(now: Date = new Date()): Promise<number> {
  const rules = await db.automationRule.findMany({
    where: { trigger: AutomationTrigger.TIME_ELAPSED, isEnabled: true, elapsedMinutes: { not: null } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  let fired = 0;
  for (const raw of rules) {
    const rule = parseRule(raw);
    if (!rule || !raw.elapsedMinutes) continue;

    const quietSince = new Date(now.getTime() - raw.elapsedMinutes * 60_000);
    const candidates = await db.ticket.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ENDED },
        updatedAt: { lte: quietSince },
      },
      orderBy: { updatedAt: "asc" },
      take: 500,
      select: {
        id: true,
        updatedAt: true,
        automationRuns: {
          where: { ruleId: rule.id },
          orderBy: { firedAt: "desc" },
          take: 1,
          select: { firedAt: true },
        },
      },
    });

    for (const candidate of candidates) {
      const lastRun = candidate.automationRuns[0];
      if (lastRun && lastRun.firedAt >= candidate.updatedAt) continue;
      try {
        if (await applyRule(rule, candidate.id)) fired += 1;
      } catch (error) {
        console.error(`Automation rule "${rule.name}" failed on ticket ${candidate.id}:`, error);
      }
    }
  }
  return fired;
}

