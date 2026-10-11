// QuickDesk - src/lib/permissions.ts
//
// The single source of truth for authorization. Every server action, route
// handler and server component goes through this file. Nothing here touches
// the database: callers load the actor + resource, then ask this module.
//
// Two kinds of exports:
//   1. Scope builders  -> Prisma `where` fragments, so filtering happens in SQL.
//   2. Checks/asserts  -> boolean answers and throwing guards for mutations.

import "server-only";
import { MessageType, Prisma, Role, TicketStatus } from "@prisma/client";

// ───────────────────────── Types ─────────────────────────

/** The authenticated user, loaded fresh from the session on every request. */
export type Actor = {
  id: string;
  role: Role;
  /** Teams the user is a member of. Always [] for requesters. */
  teamIds: string[];
};

/** Minimal ticket shape needed to make any ticket decision. */
export type TicketRef = {
  id: string;
  requesterId: string;
  assigneeId: string | null;
  teamId: string | null;
  status: TicketStatus;
  deletedAt: Date | null;
};

/** Use as the Prisma `select` when loading a ticket for a permission check. */
export const ticketRefSelect = {
  id: true,
  requesterId: true,
  assigneeId: true,
  teamId: true,
  status: true,
  deletedAt: true,
} satisfies Prisma.TicketSelect;

/**
 * How the actor relates to one ticket.
 *  - "staff":     may work it and see internal notes
 *  - "requester": owns it, public content only
 *  - "none":      must be treated as if the ticket does not exist
 */
export type TicketAccess = "staff" | "requester" | "none";

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Thrown instead of Forbidden when existence itself must not leak. */
export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

// ───────────────────────── Role helpers ─────────────────────────

export function isStaff(actor: Actor): boolean {
  return (
    actor.role === Role.AGENT ||
    actor.role === Role.TEAM_LEAD ||
    actor.role === Role.ADMIN
  );
}

export function isAdmin(actor: Actor): boolean {
  return actor.role === Role.ADMIN;
}

// ───────────────────────── Global capabilities ─────────────────────────

const CAPABILITIES = {
  "ticket.create": [Role.REQUESTER, Role.AGENT, Role.TEAM_LEAD, Role.ADMIN],
  "queue.view": [Role.AGENT, Role.TEAM_LEAD, Role.ADMIN],
  "ticket.bulk": [Role.TEAM_LEAD, Role.ADMIN],
  "canned.use": [Role.AGENT, Role.TEAM_LEAD, Role.ADMIN],
  "reports.view": [Role.AGENT, Role.TEAM_LEAD, Role.ADMIN],
  "kb.read": [Role.REQUESTER, Role.AGENT, Role.TEAM_LEAD, Role.ADMIN],
  "kb.manage": [Role.ADMIN],
  "admin.users": [Role.ADMIN],
  "admin.teams": [Role.ADMIN],
  "admin.categories": [Role.ADMIN],
  "admin.tags": [Role.ADMIN],
  "admin.sla": [Role.ADMIN],
  "admin.automation": [Role.ADMIN],
  "admin.canned": [Role.ADMIN],
  "audit.view": [Role.ADMIN],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(actor: Actor, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly Role[]).includes(actor.role);
}

export function assertCan(actor: Actor, capability: Capability): void {
  if (!can(actor, capability)) throw new ForbiddenError();
}

// ───────────────────────── Ticket access ─────────────────────────

export function ticketAccess(actor: Actor, ticket: TicketRef): TicketAccess {
  // Soft-deleted tickets exist only for admins.
  if (ticket.deletedAt) return isAdmin(actor) ? "staff" : "none";

  if (actor.role === Role.ADMIN) return "staff";

  if (actor.role === Role.AGENT || actor.role === Role.TEAM_LEAD) {
    if (ticket.assigneeId === actor.id) return "staff";
    if (ticket.teamId && actor.teamIds.includes(ticket.teamId)) return "staff";
  }

  // Anyone (including staff who filed a ticket to another team) gets the
  // requester view of their own ticket: public content only.
  if (ticket.requesterId === actor.id) return "requester";

  return "none";
}

/**
 * Guard for every ticket read/write. Throws NotFound (never Forbidden) so a
 * guessed ID is indistinguishable from a ticket that does not exist.
 */
export function assertTicketAccess(
  actor: Actor,
  ticket: TicketRef | null | undefined,
): Exclude<TicketAccess, "none"> {
  if (!ticket) throw new NotFoundError();
  const access = ticketAccess(actor, ticket);
  if (access === "none") throw new NotFoundError();
  return access;
}

// ───────────────────────── Query scopes (filter in SQL) ─────────────────────────

/** AND this into every ticket list/count/search query. */
export function ticketScope(actor: Actor): Prisma.TicketWhereInput {
  switch (actor.role) {
    case Role.ADMIN:
      return { deletedAt: null };
    case Role.AGENT:
    case Role.TEAM_LEAD:
      return {
        deletedAt: null,
        OR: [
          { assigneeId: actor.id },
          { teamId: { in: actor.teamIds } },
          { requesterId: actor.id },
        ],
      };
    case Role.REQUESTER:
      return { deletedAt: null, requesterId: actor.id };
    default:
      // Unknown role: fail closed.
      return { id: { in: [] } };
  }
}

/**
 * AND this into every TicketMessage query. For anything other than staff
 * access, internal notes are excluded by the database, not by the UI.
 */
export function messageScope(
  access: TicketAccess,
): Prisma.TicketMessageWhereInput {
  if (access === "staff") return {};
  if (access === "requester") return { type: MessageType.PUBLIC_REPLY };
  return { id: { in: [] } };
}

/** AND this into every Attachment query. Hides files attached to internal notes. */
export function attachmentScope(
  access: TicketAccess,
): Prisma.AttachmentWhereInput {
  if (access === "staff") return {};
  if (access === "requester") {
    return {
      OR: [{ messageId: null }, { message: { type: MessageType.PUBLIC_REPLY } }],
    };
  }
  return { id: { in: [] } };
}

/** Single-attachment check for the authorized download route. */
export function canViewAttachment(
  access: TicketAccess,
  attachment: { message: { type: MessageType } | null },
): boolean {
  if (access === "staff") return true;
  if (access === "requester") {
    return (
      attachment.message === null ||
      attachment.message.type === MessageType.PUBLIC_REPLY
    );
  }
  return false;
}

// ───────────────────────── Ticket actions ─────────────────────────

const FINAL: readonly TicketStatus[] = [
  TicketStatus.CLOSED,
  TicketStatus.CANCELLED,
];

function isFinal(status: TicketStatus): boolean {
  return FINAL.includes(status);
}

export type TicketAction =
  | "view"
  | "reply" // public reply
  | "note" // internal note + reading internal notes
  | "edit" // subject, description, category, tags
  | "setPriority"
  | "delete"; // soft delete

export function canOnTicket(
  actor: Actor,
  ticket: TicketRef,
  action: TicketAction,
): boolean {
  const access = ticketAccess(actor, ticket);
  if (access === "none") return false;
  // Soft-deleted tickets are read-only, even for admins.
  if (ticket.deletedAt) return action === "view";

  switch (action) {
    case "view":
      return true;
    case "reply":
      // CLOSED and CANCELLED are frozen for everyone.
      return !isFinal(ticket.status);
    case "note":
    case "edit":
    case "setPriority":
      return access === "staff" && !isFinal(ticket.status);
    case "delete":
      return isAdmin(actor);
    default:
      return false;
  }
}

/** Access check + action check in one call. Returns the access level. */
export function assertOnTicket(
  actor: Actor,
  ticket: TicketRef | null | undefined,
  action: TicketAction,
): Exclude<TicketAccess, "none"> {
  const access = assertTicketAccess(actor, ticket);
  if (!canOnTicket(actor, ticket as TicketRef, action)) {
    throw new ForbiddenError();
  }
  return access;
}

// ───────────────────────── Status transitions ─────────────────────────

export const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  [TicketStatus.OPEN]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_ON_CUSTOMER,
    TicketStatus.RESOLVED,
    TicketStatus.CANCELLED,
  ],
  [TicketStatus.IN_PROGRESS]: [
    TicketStatus.WAITING_ON_CUSTOMER,
    TicketStatus.RESOLVED,
    TicketStatus.OPEN,
    TicketStatus.CANCELLED,
  ],
  [TicketStatus.WAITING_ON_CUSTOMER]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.RESOLVED,
    TicketStatus.CANCELLED,
  ],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS],
  [TicketStatus.CLOSED]: [],
  [TicketStatus.CANCELLED]: [],
};

/** Pass SYSTEM for the scheduled job and automation engine. */
export const SYSTEM = "system" as const;
export type ActorOrSystem = Actor | typeof SYSTEM;

export function canTransition(
  actor: ActorOrSystem,
  ticket: TicketRef,
  to: TicketStatus,
): boolean {
  const from = ticket.status;
  if (ticket.deletedAt) return false;
  if (!TRANSITIONS[from].includes(to)) return false;

  if (actor === SYSTEM) return true;

  const access = ticketAccess(actor, ticket);
  if (access === "none") return false;

  if (access === "staff") {
    // RESOLVED -> CLOSED only happens via the 7-day auto-close job.
    if (from === TicketStatus.RESOLVED && to === TicketStatus.CLOSED) {
      return false;
    }
    return true;
  }

  // Requester view of own ticket:
  // cancel only while OPEN and unassigned
  if (from === TicketStatus.OPEN && to === TicketStatus.CANCELLED) {
    return ticket.assigneeId === null;
  }
  // reopen (button or reply)
  if (from === TicketStatus.RESOLVED && to === TicketStatus.IN_PROGRESS) {
    return true;
  }
  // automatic flip when the requester replies
  if (
    from === TicketStatus.WAITING_ON_CUSTOMER &&
    to === TicketStatus.IN_PROGRESS
  ) {
    return true;
  }
  return false;
}

export function assertTransition(
  actor: ActorOrSystem,
  ticket: TicketRef,
  to: TicketStatus,
): void {
  if (actor !== SYSTEM) assertTicketAccess(actor, ticket);
  if (!canTransition(actor, ticket, to)) {
    throw new ForbiddenError(
      `Cannot move this ticket from ${ticket.status} to ${to}.`,
    );
  }
}

/** Statuses to offer in the status dropdown for this actor. */
export function allowedTransitions(
  actor: Actor,
  ticket: TicketRef,
): TicketStatus[] {
  return TRANSITIONS[ticket.status].filter((to) =>
    canTransition(actor, ticket, to),
  );
}

// ───────────────────────── Assignment ─────────────────────────

/** The desired state after the assignment. */
export type AssignmentTarget = {
  teamId: string | null;
  /** null = unassign */
  assignee: { id: string; role: Role; teamIds: string[] } | null;
};

export function canAssign(
  actor: Actor,
  ticket: TicketRef,
  target: AssignmentTarget,
): boolean {
  if (ticket.deletedAt) return false;
  if (ticketAccess(actor, ticket) !== "staff") return false;
  if (isFinal(ticket.status) || ticket.status === TicketStatus.RESOLVED) {
    return false;
  }

  const { assignee, teamId } = target;

  // Tickets are only ever assigned to staff.
  if (assignee && assignee.role === Role.REQUESTER) return false;
  // If a team is set, the assignee must belong to it.
  if (assignee && teamId && !assignee.teamIds.includes(teamId)) return false;

  switch (actor.role) {
    case Role.ADMIN:
      return true;

    case Role.TEAM_LEAD:
      // Within their own team only: the ticket is in one of their teams and
      // stays in one of their teams.
      return (
        ticket.teamId !== null &&
        actor.teamIds.includes(ticket.teamId) &&
        teamId !== null &&
        actor.teamIds.includes(teamId)
      );

    case Role.AGENT:
      // Agents may only take an unassigned ticket from their own team queue.
      return (
        ticket.assigneeId === null &&
        ticket.teamId !== null &&
        actor.teamIds.includes(ticket.teamId) &&
        teamId === ticket.teamId &&
        assignee?.id === actor.id
      );

    default:
      return false;
  }
}

export function assertAssign(
  actor: Actor,
  ticket: TicketRef,
  target: AssignmentTarget,
): void {
  assertTicketAccess(actor, ticket);
  if (!canAssign(actor, ticket, target)) throw new ForbiddenError();
}

// ───────────────────────── Merge ─────────────────────────

export function canMerge(
  actor: Actor,
  primary: TicketRef,
  duplicate: TicketRef,
): boolean {
  if (primary.id === duplicate.id) return false;
  if (primary.deletedAt || duplicate.deletedAt) return false;
  if (ticketAccess(actor, primary) !== "staff") return false;
  if (ticketAccess(actor, duplicate) !== "staff") return false;
  if (isFinal(primary.status) || isFinal(duplicate.status)) return false;
  return primary.requesterId === duplicate.requesterId;
}

// ───────────────────────── Reports ─────────────────────────

export type ReportScope =
  | { kind: "all" }
  | { kind: "teams"; teamIds: string[] }
  | { kind: "self"; agentId: string };

export function reportScope(actor: Actor): ReportScope {
  assertCan(actor, "reports.view");
  switch (actor.role) {
    case Role.ADMIN:
      return { kind: "all" };
    case Role.TEAM_LEAD:
      return { kind: "teams", teamIds: actor.teamIds };
    default:
      return { kind: "self", agentId: actor.id };
  }
}

/** Ticket filter matching the actor's report scope. */
export function reportTicketScope(actor: Actor): Prisma.TicketWhereInput {
  const scope = reportScope(actor);
  switch (scope.kind) {
    case "all":
      return { deletedAt: null };
    case "teams":
      return { deletedAt: null, teamId: { in: scope.teamIds } };
    case "self":
      return { deletedAt: null, assigneeId: scope.agentId };
  }
}
