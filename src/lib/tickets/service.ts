// QuickDesk - src/lib/tickets/service.ts
//
// Every ticket mutation lives here. Each function:
//   1. reloads the ticket inside a transaction,
//   2. asks the permission helper (never trusts the caller or the UI),
//   3. writes the change and its activity timeline events together.
//
// Server actions only validate input and call these functions.

import "server-only";
import {
  MessageType,
  Prisma,
  TicketEventType,
  TicketPriority,
  TicketStatus,
} from "@prisma/client";
import type { PreparedFile } from "@/lib/attachments";
import { db } from "@/lib/db";
import {
  notifyAssigned,
  notifyPublicReply,
  notifyResolved,
  notifyTicketCreated,
} from "@/lib/notifications/notify";
import {
  assertAssign,
  assertCan,
  assertOnTicket,
  assertTransition,
  NotFoundError,
  ticketRefSelect,
  type Actor,
} from "@/lib/permissions";
import { deleteObject, newStorageKey, putObject } from "@/lib/storage";
import { runAutomation } from "@/lib/automation/engine";
import { applyStatus, loadTicket, MINUTE, slaForPriority } from "@/lib/tickets/core";
import { TicketError } from "@/lib/tickets/errors";
import { formatTicketNumber } from "@/lib/tickets/format";

// ───────────────────────── Attachments ─────────────────────────

type StoredFile = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
};

/** Uploads to storage before the database transaction starts. */
async function storeFiles(files: PreparedFile[]): Promise<StoredFile[]> {
  const stored: StoredFile[] = [];
  try {
    for (const file of files) {
      const storageKey = newStorageKey();
      await putObject(storageKey, file.buffer, file.mimeType);
      stored.push({
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storageKey,
      });
    }
  } catch (error) {
    await discardFiles(stored);
    throw error;
  }
  return stored;
}

/** Removes uploaded objects when the database write did not happen. */
async function discardFiles(stored: StoredFile[]): Promise<void> {
  await Promise.allSettled(stored.map((file) => deleteObject(file.storageKey)));
}

// ───────────────────────── Status ─────────────────────────

export async function changeStatus(
  actor: Actor,
  ticketId: string,
  to: TicketStatus,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const ticket = await loadTicket(tx, ticketId);
    assertTransition(actor, ticket, to);
    await applyStatus(tx, ticket, to, actor.id);
  });

  if (to === TicketStatus.RESOLVED) await notifyResolved(ticketId, actor.id);
  await runAutomation("TICKET_UPDATED", ticketId);
}

// ───────────────────────── Create ─────────────────────────

export async function createTicket(
  actor: Actor,
  input: {
    subject: string;
    description: string;
    categoryId: string;
    followUpOfId: string | null;
  },
  files: PreparedFile[],
): Promise<{ id: string; ticketNumber: string }> {
  assertCan(actor, "ticket.create");

  const category = await db.category.findFirst({
    where: { id: input.categoryId, isActive: true, deletedAt: null },
    select: {
      id: true,
      defaultTeam: { select: { id: true, deletedAt: true } },
    },
  });
  if (!category) throw new TicketError("Choose a valid category.");

  if (input.followUpOfId) {
    // A follow-up can only point at the requester's own closed ticket.
    const original = await db.ticket.findFirst({
      where: {
        id: input.followUpOfId,
        requesterId: actor.id,
        status: TicketStatus.CLOSED,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!original) {
      throw new TicketError("The original ticket could not be found or is not closed.");
    }
  }

  const teamId =
    category.defaultTeam && !category.defaultTeam.deletedAt
      ? category.defaultTeam.id
      : null;

  const stored = await storeFiles(files);
  try {
    const created = await db.$transaction(async (tx) => {
      // Row-locked increment: two tickets can never get the same number.
      const counter = await tx.counter.upsert({
        where: { name: "ticket" },
        update: { value: { increment: 1 } },
        create: { name: "ticket", value: 1 },
        select: { value: true },
      });

      // Requesters never set priority. Every new ticket starts at MEDIUM.
      const priority = TicketPriority.MEDIUM;
      const policy = await tx.slaPolicy.findUnique({ where: { priority } });
      const now = new Date();
      const sla = policy && policy.isActive ? policy : null;

      return tx.ticket.create({
        data: {
          ticketNumber: formatTicketNumber(counter.value),
          subject: input.subject,
          description: input.description,
          priority,
          categoryId: category.id,
          requesterId: actor.id,
          teamId,
          followUpOfId: input.followUpOfId,
          firstResponseDueAt: sla
            ? new Date(now.getTime() + sla.firstResponseMinutes * MINUTE)
            : null,
          resolutionDueAt: sla
            ? new Date(now.getTime() + sla.resolutionMinutes * MINUTE)
            : null,
          createdAt: now,
          events: {
            create: [{ actorId: actor.id, type: TicketEventType.CREATED, createdAt: now }],
          },
          attachments: {
            create: stored.map((file) => ({ ...file, uploaderId: actor.id })),
          },
        },
        select: { id: true, ticketNumber: true },
      });
    });
    // Rules run first so the team alert goes to the team the rules picked.
    await runAutomation("TICKET_CREATED", created.id);
    await notifyTicketCreated(created.id, actor.id);
    return created;
  } catch (error) {
    await discardFiles(stored);
    throw error;
  }
}

// ───────────────────────── Conversation ─────────────────────────

export async function addMessage(
  actor: Actor,
  ticketId: string,
  input: { type: MessageType; body: string },
  files: PreparedFile[],
): Promise<void> {
  const action = input.type === MessageType.INTERNAL_NOTE ? "note" : "reply";

  // Check permission before accepting any upload.
  const preview = await db.ticket.findUnique({
    where: { id: ticketId },
    select: ticketRefSelect,
  });
  assertOnTicket(actor, preview, action);

  const stored = await storeFiles(files);
  try {
    const outcome = await db.$transaction(async (tx) => {
      const ticket = await loadTicket(tx, ticketId);
      const access = assertOnTicket(actor, ticket, action);
      const now = new Date();

      const message = await tx.ticketMessage.create({
        data: {
          ticketId,
          authorId: actor.id,
          type: input.type,
          body: input.body,
          createdAt: now,
          attachments: {
            create: stored.map((file) => ({ ...file, ticketId, uploaderId: actor.id })),
          },
        },
      });

      const data: Prisma.TicketUncheckedUpdateInput = { updatedAt: now };

      if (input.type === MessageType.PUBLIC_REPLY) {
        if (access === "requester") {
          // A requester reply wakes the ticket up.
          if (
            ticket.status === TicketStatus.WAITING_ON_CUSTOMER ||
            ticket.status === TicketStatus.RESOLVED
          ) {
            assertTransition(actor, ticket, TicketStatus.IN_PROGRESS);
            await applyStatus(tx, ticket, TicketStatus.IN_PROGRESS, actor.id);
          }
        } else if (!ticket.firstRespondedAt && ticket.requesterId !== actor.id) {
          // First public reply from staff stops the first-response clock.
          data.firstRespondedAt = now;
        }
      }

      await tx.ticket.update({ where: { id: ticketId }, data });
      return { access, messageId: message.id };
    });

    // Internal notes never notify anyone.
    if (input.type === MessageType.PUBLIC_REPLY) {
      await notifyPublicReply(ticketId, outcome.messageId, actor.id, outcome.access);
    }
    await runAutomation("TICKET_UPDATED", ticketId);
  } catch (error) {
    await discardFiles(stored);
    throw error;
  }
}

// ───────────────────────── Priority ─────────────────────────

export async function changePriority(
  actor: Actor,
  ticketId: string,
  priority: TicketPriority,
): Promise<void> {
  const changed = await db.$transaction(async (tx) => {
    const ticket = await loadTicket(tx, ticketId);
    assertOnTicket(actor, ticket, "setPriority");
    if (ticket.priority === priority) return false;

    const data: Prisma.TicketUncheckedUpdateInput = {
      priority,
      ...(await slaForPriority(tx, ticket, priority)),
    };

    await tx.ticket.update({ where: { id: ticketId }, data });
    await tx.ticketEvent.create({
      data: {
        ticketId,
        actorId: actor.id,
        type: TicketEventType.PRIORITY_CHANGED,
        fromValue: ticket.priority,
        toValue: priority,
      },
    });
    return true;
  });

  if (changed) await runAutomation("TICKET_UPDATED", ticketId);
}

// ───────────────────────── Assignment ─────────────────────────

export async function assignTicket(
  actor: Actor,
  ticketId: string,
  target: { teamId: string | null; assigneeId: string | null },
): Promise<void> {
  const outcome = await db.$transaction(async (tx) => {
    const ticket = await loadTicket(tx, ticketId);

    let assignee: { id: string; role: Actor["role"]; teamIds: string[] } | null = null;
    if (target.assigneeId) {
      const user = await tx.user.findFirst({
        where: { id: target.assigneeId, isActive: true, deletedAt: null },
        select: {
          id: true,
          role: true,
          teamMemberships: {
            where: { team: { deletedAt: null } },
            select: { teamId: true },
          },
        },
      });
      if (!user) throw new TicketError("That user cannot be assigned tickets.");
      assignee = {
        id: user.id,
        role: user.role,
        teamIds: user.teamMemberships.map((membership) => membership.teamId),
      };
    }

    if (target.teamId) {
      const team = await tx.team.findFirst({
        where: { id: target.teamId, deletedAt: null },
        select: { id: true },
      });
      if (!team) throw new TicketError("That team no longer exists.");
    }

    assertAssign(actor, ticket, { teamId: target.teamId, assignee });

    const assigneeChanged = ticket.assigneeId !== target.assigneeId;
    const teamChanged = ticket.teamId !== target.teamId;
    if (!assigneeChanged && !teamChanged) return { changed: false, newAssigneeId: null };

    await tx.ticket.update({
      where: { id: ticketId },
      data: { assigneeId: target.assigneeId, teamId: target.teamId },
    });

    const events: Prisma.TicketEventCreateManyInput[] = [];
    if (teamChanged) {
      events.push({
        ticketId,
        actorId: actor.id,
        type: TicketEventType.TEAM_CHANGED,
        fromValue: ticket.teamId,
        toValue: target.teamId,
      });
    }
    if (assigneeChanged) {
      events.push({
        ticketId,
        actorId: actor.id,
        type: TicketEventType.ASSIGNEE_CHANGED,
        fromValue: ticket.assigneeId,
        toValue: target.assigneeId,
      });
    }
    await tx.ticketEvent.createMany({ data: events });

    // Rule: assigning an OPEN ticket moves it to IN_PROGRESS.
    if (target.assigneeId && ticket.status === TicketStatus.OPEN) {
      await applyStatus(tx, ticket, TicketStatus.IN_PROGRESS, actor.id);
    }
    return { changed: true, newAssigneeId: assigneeChanged ? target.assigneeId : null };
  });

  if (outcome.newAssigneeId) await notifyAssigned(ticketId, outcome.newAssigneeId, actor.id);
  if (outcome.changed) await runAutomation("TICKET_UPDATED", ticketId);
}

// ───────────────────────── Edit ─────────────────────────

export async function updateTicket(
  actor: Actor,
  ticketId: string,
  input: {
    subject: string;
    description: string;
    categoryId: string;
    tagIds: string[];
  },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const ticket = await loadTicket(tx, ticketId);
    assertOnTicket(actor, ticket, "edit");

    const categoryChanged = ticket.categoryId !== input.categoryId;
    if (categoryChanged) {
      const category = await tx.category.findFirst({
        where: { id: input.categoryId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!category) throw new TicketError("Choose a valid category.");
    }

    const wantedIds = [...new Set(input.tagIds)];
    const [wantedTags, currentTags] = await Promise.all([
      tx.tag.findMany({
        where: { id: { in: wantedIds } },
        select: { id: true, name: true },
      }),
      tx.ticketTag.findMany({
        where: { ticketId },
        select: { tagId: true, tag: { select: { name: true } } },
      }),
    ]);
    if (wantedTags.length !== wantedIds.length) {
      throw new TicketError("One of the selected tags no longer exists.");
    }

    const currentIds = new Set(currentTags.map((row) => row.tagId));
    const wantedSet = new Set(wantedIds);
    const added = wantedTags.filter((tag) => !currentIds.has(tag.id));
    const removed = currentTags.filter((row) => !wantedSet.has(row.tagId));

    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        subject: input.subject,
        description: input.description,
        categoryId: input.categoryId,
      },
    });

    if (removed.length > 0) {
      await tx.ticketTag.deleteMany({
        where: { ticketId, tagId: { in: removed.map((row) => row.tagId) } },
      });
    }
    if (added.length > 0) {
      await tx.ticketTag.createMany({
        data: added.map((tag) => ({ ticketId, tagId: tag.id })),
      });
    }

    const events: Prisma.TicketEventCreateManyInput[] = [];
    if (categoryChanged) {
      events.push({
        ticketId,
        actorId: actor.id,
        type: TicketEventType.CATEGORY_CHANGED,
        fromValue: ticket.categoryId,
        toValue: input.categoryId,
      });
    }
    for (const tag of added) {
      events.push({
        ticketId,
        actorId: actor.id,
        type: TicketEventType.TAG_ADDED,
        fromValue: null,
        toValue: tag.name,
      });
    }
    for (const row of removed) {
      events.push({
        ticketId,
        actorId: actor.id,
        type: TicketEventType.TAG_REMOVED,
        fromValue: row.tag.name,
        toValue: null,
      });
    }
    if (events.length > 0) await tx.ticketEvent.createMany({ data: events });
  });

  await runAutomation("TICKET_UPDATED", ticketId);
}

/** "Assign to me": take an unassigned ticket from the actor's own team queue. */
export async function claimTicket(actor: Actor, ticketId: string): Promise<void> {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { teamId: true },
  });
  if (!ticket) throw new NotFoundError();
  // assignTicket reloads the ticket and runs the full permission check.
  await assignTicket(actor, ticketId, { teamId: ticket.teamId, assigneeId: actor.id });
}

/** Adds one tag. Used by bulk actions. Adding a tag that is already there is a no-op. */
export async function addTag(actor: Actor, ticketId: string, tagId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const ticket = await loadTicket(tx, ticketId);
    assertOnTicket(actor, ticket, "edit");

    const tag = await tx.tag.findUnique({
      where: { id: tagId },
      select: { id: true, name: true },
    });
    if (!tag) throw new TicketError("That tag no longer exists.");

    const existing = await tx.ticketTag.findUnique({
      where: { ticketId_tagId: { ticketId, tagId } },
      select: { ticketId: true },
    });
    if (existing) return;

    await tx.ticketTag.create({ data: { ticketId, tagId } });
    await tx.ticketEvent.create({
      data: {
        ticketId,
        actorId: actor.id,
        type: TicketEventType.TAG_ADDED,
        fromValue: null,
        toValue: tag.name,
      },
    });
    await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
  });

  await runAutomation("TICKET_UPDATED", ticketId);
}
