// QuickDesk - src/lib/tickets/core.ts
//
// Low-level ticket writes shared by the ticket service (user actions), the
// automation engine and the scheduled jobs. Nothing here checks permissions:
// callers do that first. Everything runs inside the caller's transaction.

import "server-only";
import { Prisma, TicketEventType, TicketPriority, TicketStatus } from "@prisma/client";
import { NotFoundError, ticketRefSelect } from "@/lib/permissions";
import { TicketError } from "@/lib/tickets/errors";

export type Tx = Prisma.TransactionClient;

export const MINUTE = 60_000;

export const workSelect = {
  ...ticketRefSelect,
  ticketNumber: true,
  subject: true,
  priority: true,
  categoryId: true,
  createdAt: true,
  firstResponseDueAt: true,
  resolutionDueAt: true,
  firstRespondedAt: true,
  slaPausedAt: true,
} satisfies Prisma.TicketSelect;

export type WorkTicket = Prisma.TicketGetPayload<{ select: typeof workSelect }>;

export async function loadTicket(tx: Tx, ticketId: string): Promise<WorkTicket> {
  const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: workSelect });
  if (!ticket) throw new NotFoundError();
  return ticket;
}

/**
 * Applies a status change that has already been authorised.
 * Handles SLA pause/resume, resolve, reopen and close bookkeeping, and
 * refuses to run if the ticket's status changed since it was loaded.
 * actorId null means the system (automation or a scheduled job).
 */
export async function applyStatus(
  tx: Tx,
  ticket: Pick<
    WorkTicket,
    "id" | "status" | "slaPausedAt" | "firstResponseDueAt" | "resolutionDueAt"
  >,
  to: TicketStatus,
  actorId: string | null,
): Promise<void> {
  const from = ticket.status;
  const now = new Date();
  const data: Prisma.TicketUncheckedUpdateManyInput = { status: to };

  // Leaving WAITING_ON_CUSTOMER: push the due dates forward by the paused time.
  if (from === TicketStatus.WAITING_ON_CUSTOMER && ticket.slaPausedAt) {
    const pausedFor = Math.max(0, now.getTime() - ticket.slaPausedAt.getTime());
    if (ticket.firstResponseDueAt) {
      data.firstResponseDueAt = new Date(ticket.firstResponseDueAt.getTime() + pausedFor);
    }
    if (ticket.resolutionDueAt) {
      data.resolutionDueAt = new Date(ticket.resolutionDueAt.getTime() + pausedFor);
    }
    data.slaPausedAt = null;
  }

  if (to === TicketStatus.WAITING_ON_CUSTOMER) data.slaPausedAt = now;
  if (to === TicketStatus.RESOLVED) data.resolvedAt = now;
  if (to === TicketStatus.CLOSED) data.closedAt = now;

  // Reopen
  if (from === TicketStatus.RESOLVED && to === TicketStatus.IN_PROGRESS) {
    data.resolvedAt = null;
    data.reopenCount = { increment: 1 };
  }

  const result = await tx.ticket.updateMany({
    where: { id: ticket.id, status: from, deletedAt: null },
    data,
  });
  if (result.count !== 1) {
    throw new TicketError(
      "This ticket was just changed by someone else. Reload the page and try again.",
    );
  }

  await tx.ticketEvent.create({
    data: {
      ticketId: ticket.id,
      actorId,
      type: TicketEventType.STATUS_CHANGED,
      fromValue: from,
      toValue: to,
    },
  });
}

/**
 * New SLA due dates when a ticket's priority changes. The targets are
 * re-based on the new priority's policy, keeping any time already added to
 * the due dates by SLA pauses. Warning flags are cleared so the new targets
 * get their own warning.
 */
export async function slaForPriority(
  tx: Tx,
  ticket: Pick<WorkTicket, "createdAt" | "priority" | "firstResponseDueAt" | "resolutionDueAt">,
  priority: TicketPriority,
): Promise<Prisma.TicketUncheckedUpdateInput> {
  const [oldPolicy, newPolicy] = await Promise.all([
    tx.slaPolicy.findUnique({ where: { priority: ticket.priority } }),
    tx.slaPolicy.findUnique({ where: { priority } }),
  ]);
  if (!newPolicy || !newPolicy.isActive) return {};

  const created = ticket.createdAt.getTime();
  const carried = (due: Date | null, oldMinutes: number | undefined) =>
    due && oldMinutes !== undefined
      ? Math.max(0, due.getTime() - (created + oldMinutes * MINUTE))
      : 0;

  return {
    firstResponseDueAt: new Date(
      created +
        newPolicy.firstResponseMinutes * MINUTE +
        carried(ticket.firstResponseDueAt, oldPolicy?.firstResponseMinutes),
    ),
    resolutionDueAt: new Date(
      created +
        newPolicy.resolutionMinutes * MINUTE +
        carried(ticket.resolutionDueAt, oldPolicy?.resolutionMinutes),
    ),
    firstResponseWarnedAt: null,
    resolutionWarnedAt: null,
  };
}
