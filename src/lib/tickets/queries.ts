// QuickDesk - src/lib/tickets/queries.ts
//
// Read side of tickets. Access is decided by the permission helper and the
// internal-note / attachment filters are applied in the SQL query itself.

import "server-only";
import { Role, TicketEventType, TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  assertTicketAccess,
  attachmentScope,
  can,
  messageScope,
  NotFoundError,
  ticketRefSelect,
  type Actor,
} from "@/lib/permissions";
import type { TimelineNames } from "@/lib/tickets/timeline";

const attachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
} as const;

/**
 * Everything the ticket page needs. Throws NotFoundError when the ticket does
 * not exist or the actor may not see it (the two are indistinguishable).
 */
export async function getTicketDetail(actor: Actor, ticketId: string) {
  if (!/^[a-z0-9]{1,40}$/i.test(ticketId)) throw new NotFoundError();

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: {
      ...ticketRefSelect,
      ticketNumber: true,
      subject: true,
      description: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      firstResponseDueAt: true,
      resolutionDueAt: true,
      firstRespondedAt: true,
      resolvedAt: true,
      slaPausedAt: true,
      reopenCount: true,
      escalationLevel: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true, email: true, company: true } },
      assignee: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      tags: {
        orderBy: { tag: { name: "asc" } },
        select: { tag: { select: { id: true, name: true } } },
      },
      followUpOf: { select: { id: true, ticketNumber: true } },
      followUps: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, ticketNumber: true },
      },
    },
  });
  if (!ticket) throw new NotFoundError();

  const access = assertTicketAccess(actor, ticket);
  const isStaffView = access === "staff";

  const [messages, descriptionAttachments, events] = await Promise.all([
    db.ticketMessage.findMany({
      // messageScope removes internal notes in SQL for non-staff access.
      where: { AND: [{ ticketId }, messageScope(access)] },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        type: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true, role: true } },
        attachments: { orderBy: { createdAt: "asc" }, select: attachmentSelect },
      },
    }),
    db.attachment.findMany({
      where: { AND: [{ ticketId, messageId: null }, attachmentScope(access)] },
      orderBy: { createdAt: "asc" },
      select: attachmentSelect,
    }),
    db.ticketEvent.findMany({
      where: {
        ticketId,
        // Requesters see the ticket's creation and status history only.
        ...(isStaffView
          ? {}
          : { type: { in: [TicketEventType.CREATED, TicketEventType.STATUS_CHANGED] } }),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        type: true,
        fromValue: true,
        toValue: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),
  ]);

  // Resolve the ids stored on events into display names.
  const userIds = new Set<string>();
  const teamIds = new Set<string>();
  const categoryIds = new Set<string>();
  for (const event of events) {
    const bucket =
      event.type === TicketEventType.ASSIGNEE_CHANGED
        ? userIds
        : event.type === TicketEventType.TEAM_CHANGED
          ? teamIds
          : event.type === TicketEventType.CATEGORY_CHANGED
            ? categoryIds
            : null;
    if (!bucket) continue;
    if (event.fromValue) bucket.add(event.fromValue);
    if (event.toValue) bucket.add(event.toValue);
  }

  const [users, teams, categories] = await Promise.all([
    userIds.size
      ? db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
      : [],
    teamIds.size
      ? db.team.findMany({ where: { id: { in: [...teamIds] } }, select: { id: true, name: true } })
      : [],
    categoryIds.size
      ? db.category.findMany({
          where: { id: { in: [...categoryIds] } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const names: TimelineNames = {
    users: new Map(users.map((row) => [row.id, row.name])),
    teams: new Map(teams.map((row) => [row.id, row.name])),
    categories: new Map(categories.map((row) => [row.id, row.name])),
  };

  return { ticket, access, messages, descriptionAttachments, events, names };
}

export type TicketDetail = Awaited<ReturnType<typeof getTicketDetail>>;

export function getActiveCategories() {
  return db.category.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });
}

export function getTags() {
  return db.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}

/** Canned responses for the reply box. Empty for anyone who may not use them. */
export async function getCannedResponses(actor: Actor) {
  if (!can(actor, "canned.use")) return [];
  return db.cannedResponse.findMany({
    where: { isActive: true },
    orderBy: { title: "asc" },
    select: { id: true, title: true, body: true },
  });
}

export type AssignOption = { value: string; label: string };
export type AssignGroup = { teamId: string; teamName: string; options: AssignOption[] };

/**
 * Choices for the assignment select: admins get every team, team leads get
 * their own teams. The server re-checks whatever is submitted with canAssign.
 */
export async function getAssignGroups(
  actor: Actor,
  ticket: { teamId: string | null; status: TicketStatus },
): Promise<AssignGroup[]> {
  const closedForAssignment =
    ticket.status === TicketStatus.RESOLVED ||
    ticket.status === TicketStatus.CLOSED ||
    ticket.status === TicketStatus.CANCELLED;
  if (closedForAssignment) return [];

  let teamFilter: { id?: { in: string[] } };
  if (actor.role === Role.ADMIN) {
    teamFilter = {};
  } else if (
    actor.role === Role.TEAM_LEAD &&
    ticket.teamId !== null &&
    actor.teamIds.includes(ticket.teamId)
  ) {
    teamFilter = { id: { in: actor.teamIds } };
  } else {
    return [];
  }

  const teams = await db.team.findMany({
    where: { deletedAt: null, ...teamFilter },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      members: {
        where: {
          user: { isActive: true, deletedAt: null, role: { not: Role.REQUESTER } },
        },
        orderBy: { user: { name: "asc" } },
        select: { user: { select: { id: true, name: true } } },
      },
    },
  });

  return teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    options: [
      { value: `${team.id}:`, label: "Unassigned" },
      ...team.members.map((member) => ({
        value: `${team.id}:${member.user.id}`,
        label: member.user.name,
      })),
    ],
  }));
}
