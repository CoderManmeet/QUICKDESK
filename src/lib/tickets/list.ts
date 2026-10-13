// QuickDesk - src/lib/tickets/list.ts
//
// Ticket queue: saved views, search, filters, sorting and pagination.
// Everything is read from the URL, validated here, and turned into a single
// Prisma query. ticketScope(actor) is always part of that query, so no
// combination of URL parameters can reach a ticket the user may not see.

import "server-only";
import { MessageType, Prisma, Role, TicketPriority, TicketStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { can, isStaff, ticketScope, type Actor } from "@/lib/permissions";

export const PAGE_SIZE = 20;

// ───────────────────────── Views ─────────────────────────

export const VIEW_KEYS = [
  "all",
  "mine",
  "unassigned",
  "team",
  "high",
  "overdue",
  "recent",
] as const;
export type ViewKey = (typeof VIEW_KEYS)[number];

const VIEW_LABEL: Record<ViewKey, string> = {
  all: "All",
  mine: "My tickets",
  unassigned: "Unassigned",
  team: "My team",
  high: "High priority",
  overdue: "Overdue",
  recent: "Recently updated",
};

const NOT_ENDED: Prisma.TicketWhereInput = {
  status: { notIn: [TicketStatus.CLOSED, TicketStatus.CANCELLED] },
};

const WORKABLE: TicketStatus[] = [
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.WAITING_ON_CUSTOMER,
];

/**
 * A ticket is overdue when it is still being worked (the SLA clock is
 * running, so not waiting on the customer) and a target has passed.
 */
export function overdueWhere(now: Date = new Date()): Prisma.TicketWhereInput {
  return {
    status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
    OR: [
      { resolutionDueAt: { lt: now } },
      { firstRespondedAt: null, firstResponseDueAt: { lt: now } },
    ],
  };
}

/** Same rule as overdueWhere, for a row that is already loaded. */
export function isOverdue(
  ticket: {
    status: TicketStatus;
    resolutionDueAt: Date | null;
    firstResponseDueAt: Date | null;
    firstRespondedAt: Date | null;
  },
  now: Date = new Date(),
): boolean {
  if (ticket.status !== TicketStatus.OPEN && ticket.status !== TicketStatus.IN_PROGRESS) {
    return false;
  }
  if (ticket.resolutionDueAt && ticket.resolutionDueAt < now) return true;
  return Boolean(
    !ticket.firstRespondedAt && ticket.firstResponseDueAt && ticket.firstResponseDueAt < now,
  );
}

export function viewWhere(actor: Actor, view: ViewKey): Prisma.TicketWhereInput {
  switch (view) {
    case "mine":
      return { assigneeId: actor.id, ...NOT_ENDED };
    case "unassigned":
      return { assigneeId: null, status: { in: WORKABLE } };
    case "team":
      return { teamId: { in: actor.teamIds }, ...NOT_ENDED };
    case "high":
      return {
        priority: { in: [TicketPriority.HIGH, TicketPriority.URGENT] },
        ...NOT_ENDED,
      };
    case "overdue":
      return overdueWhere();
    case "recent":
      return { updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } };
    case "all":
    default:
      return {};
  }
}

/** Saved views offered to this user. Requesters get the plain list only. */
export function availableViews(actor: Actor): { key: ViewKey; label: string }[] {
  if (!can(actor, "queue.view")) return [];
  return VIEW_KEYS.filter((key) => key !== "team" || actor.teamIds.length > 0).map(
    (key) => ({ key, label: VIEW_LABEL[key] }),
  );
}

// ───────────────────────── URL parameters ─────────────────────────

export const SORT_KEYS = ["updated", "created", "number", "priority", "status", "due"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  updated: "desc",
  created: "desc",
  number: "desc",
  priority: "desc",
  status: "asc",
  due: "asc",
};

const optional = <T extends z.ZodTypeAny>(schema: T) => schema.optional().catch(undefined);
const idParam = z.string().regex(/^[a-z0-9]{1,40}$/i);
const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

// Anything invalid is dropped instead of causing an error page.
const paramsSchema = z.object({
  view: z.enum(VIEW_KEYS).catch("all"),
  q: optional(z.string().trim().min(1).max(100)),
  status: optional(z.nativeEnum(TicketStatus)),
  priority: optional(z.nativeEnum(TicketPriority)),
  category: optional(idParam),
  assignee: optional(z.union([z.literal("me"), z.literal("none"), idParam])),
  team: optional(idParam),
  tag: optional(idParam),
  from: optional(dateParam),
  to: optional(dateParam),
  sort: z.enum(SORT_KEYS).catch("updated"),
  dir: optional(z.enum(["asc", "desc"])),
  page: z.coerce.number().int().min(1).max(100000).catch(1),
});

export type ListParams = Omit<z.infer<typeof paramsSchema>, "dir"> & {
  dir: "asc" | "desc";
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseListParams(raw: RawSearchParams, actor: Actor): ListParams {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  // Empty selects submit "", which means "no filter".
  for (const key of Object.keys(flat)) {
    if (flat[key] === "") flat[key] = undefined;
  }

  const parsed = paramsSchema.parse(flat);
  const params: ListParams = { ...parsed, dir: parsed.dir ?? DEFAULT_DIR[parsed.sort] };

  const views = availableViews(actor).map((view) => view.key);
  if (!views.includes(params.view)) params.view = "all";

  // Staff-only filters are ignored for requesters.
  if (!isStaff(actor)) {
    params.assignee = undefined;
    params.team = undefined;
    params.tag = undefined;
  }
  return params;
}

/** Query string for a link, leaving out anything that is at its default. */
export function listHref(
  params: ListParams,
  overrides: Partial<Record<keyof ListParams, string | number | undefined>> = {},
): string {
  const merged: Record<string, string | number | undefined> = { ...params, ...overrides };
  const search = new URLSearchParams();

  const sort = (merged.sort as SortKey | undefined) ?? "updated";
  for (const key of [
    "view",
    "q",
    "status",
    "priority",
    "category",
    "assignee",
    "team",
    "tag",
    "from",
    "to",
    "sort",
    "dir",
    "page",
  ]) {
    const value = merged[key];
    if (value === undefined || value === "") continue;
    if (key === "view" && value === "all") continue;
    if (key === "sort" && value === "updated") continue;
    if (key === "dir" && value === DEFAULT_DIR[sort]) continue;
    if (key === "page" && Number(value) === 1) continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `/tickets?${query}` : "/tickets";
}

export function hasActiveFilters(params: ListParams): boolean {
  return Boolean(
    params.q ||
      params.status ||
      params.priority ||
      params.category ||
      params.assignee ||
      params.team ||
      params.tag ||
      params.from ||
      params.to,
  );
}

// ───────────────────────── Query ─────────────────────────

function searchWhere(actor: Actor, q: string): Prisma.TicketWhereInput {
  // Prisma does not escape LIKE wildcards, so "%" or "_" typed by a user
  // would otherwise match everything. Escape them to search literally.
  const literal = q.replace(/[\\%_]/g, "\\$&");
  const contains = { contains: literal, mode: "insensitive" as const };
  const or: Prisma.TicketWhereInput[] = [
    { ticketNumber: contains },
    { subject: contains },
    { description: contains },
    // Search never looks inside internal notes, for anyone. That keeps note
    // contents from leaking through "does this search match" side channels.
    { messages: { some: { type: MessageType.PUBLIC_REPLY, body: contains } } },
  ];
  if (isStaff(actor)) {
    or.push({ requester: { OR: [{ name: contains }, { email: contains }] } });
  }
  return { OR: or };
}

export function buildListWhere(actor: Actor, params: ListParams): Prisma.TicketWhereInput {
  const and: Prisma.TicketWhereInput[] = [
    // Always first: limits every list, count and search to visible tickets.
    ticketScope(actor),
    viewWhere(actor, params.view),
  ];

  if (params.q) and.push(searchWhere(actor, params.q));
  if (params.status) and.push({ status: params.status });
  if (params.priority) and.push({ priority: params.priority });
  if (params.category) and.push({ categoryId: params.category });
  if (params.team) and.push({ teamId: params.team });
  if (params.tag) and.push({ tags: { some: { tagId: params.tag } } });

  if (params.assignee === "me") and.push({ assigneeId: actor.id });
  else if (params.assignee === "none") and.push({ assigneeId: null });
  else if (params.assignee) and.push({ assigneeId: params.assignee });

  if (params.from) and.push({ createdAt: { gte: new Date(`${params.from}T00:00:00Z`) } });
  if (params.to) {
    const end = new Date(`${params.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    and.push({ createdAt: { lt: end } });
  }

  return { AND: and };
}

export function buildOrderBy(params: ListParams): Prisma.TicketOrderByWithRelationInput[] {
  const dir = params.dir;
  const primary: Prisma.TicketOrderByWithRelationInput =
    params.sort === "created"
      ? { createdAt: dir }
      : params.sort === "number"
        ? { ticketNumber: dir }
        : params.sort === "priority"
          ? { priority: dir }
          : params.sort === "status"
            ? { status: dir }
            : params.sort === "due"
              ? { resolutionDueAt: { sort: dir, nulls: "last" } }
              : { updatedAt: dir };
  // Stable tie-breakers so pages never overlap.
  return [primary, { updatedAt: "desc" }, { id: "desc" }];
}

export async function getTicketList(actor: Actor, params: ListParams) {
  const where = buildListWhere(actor, params);

  const [total, tickets] = await Promise.all([
    db.ticket.count({ where }),
    db.ticket.findMany({
      where,
      orderBy: buildOrderBy(params),
      skip: (params.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        status: true,
        priority: true,
        updatedAt: true,
        resolutionDueAt: true,
        firstResponseDueAt: true,
        firstRespondedAt: true,
        escalationLevel: true,
        category: { select: { name: true } },
        requester: { select: { name: true } },
        assignee: { select: { name: true } },
      },
    }),
  ]);

  return { total, tickets, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

// ───────────────────────── Filter and bulk options ─────────────────────────

type Option = { id: string; name: string };

export type AssignGroup = {
  teamId: string;
  teamName: string;
  options: { value: string; label: string }[];
};

/** Choices for the filter bar. Staff-only lists are empty for requesters. */
export async function getFilterOptions(actor: Actor): Promise<{
  categories: Option[];
  tags: Option[];
  teams: Option[];
  assignees: Option[];
}> {
  const categories = await db.category.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  if (!isStaff(actor)) return { categories, tags: [], teams: [], assignees: [] };

  const teamWhere: Prisma.TeamWhereInput =
    actor.role === Role.ADMIN
      ? { deletedAt: null }
      : { deletedAt: null, id: { in: actor.teamIds } };

  const [tags, teams, assignees] = await Promise.all([
    db.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.team.findMany({
      where: teamWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.user.findMany({
      where: {
        deletedAt: null,
        role: { not: Role.REQUESTER },
        ...(actor.role === Role.ADMIN
          ? {}
          : { teamMemberships: { some: { teamId: { in: actor.teamIds } } } }),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return { categories, tags, teams, assignees };
}

/** Teams and members a bulk "assign" may target. Empty without the bulk permission. */
export async function getBulkAssignGroups(actor: Actor): Promise<AssignGroup[]> {
  if (!can(actor, "ticket.bulk")) return [];

  const teams = await db.team.findMany({
    where:
      actor.role === Role.ADMIN
        ? { deletedAt: null }
        : { deletedAt: null, id: { in: actor.teamIds } },
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

// ───────────────────────── Dashboard ─────────────────────────

export type DashboardCard = { key: string; label: string; count: number; href: string };

/**
 * Dashboard numbers. Each card uses the same where-clause as the list it
 * links to, so the number on the card always matches the list behind it.
 */
export async function getDashboardCards(actor: Actor): Promise<DashboardCard[]> {
  const staff = can(actor, "queue.view");

  const definitions: { key: string; label: string; query: string }[] = staff
    ? [
        { key: "total", label: "Total", query: "" },
        { key: "open", label: "Open", query: "status=OPEN" },
        { key: "waiting", label: "Waiting on customer", query: "status=WAITING_ON_CUSTOMER" },
        { key: "resolved", label: "Resolved", query: "status=RESOLVED" },
        { key: "overdue", label: "Overdue", query: "view=overdue" },
        { key: "unassigned", label: "Unassigned", query: "view=unassigned" },
        { key: "mine", label: "Assigned to me", query: "view=mine" },
      ]
    : [
        { key: "total", label: "All my tickets", query: "" },
        { key: "open", label: "Open", query: "status=OPEN" },
        { key: "progress", label: "In progress", query: "status=IN_PROGRESS" },
        { key: "waiting", label: "Waiting for your reply", query: "status=WAITING_ON_CUSTOMER" },
        { key: "resolved", label: "Resolved", query: "status=RESOLVED" },
      ];

  return Promise.all(
    definitions.map(async (definition) => {
      const raw = Object.fromEntries(new URLSearchParams(definition.query));
      const params = parseListParams(raw, actor);
      return {
        key: definition.key,
        label: definition.label,
        count: await db.ticket.count({ where: buildListWhere(actor, params) }),
        href: definition.query ? `/tickets?${definition.query}` : "/tickets",
      };
    }),
  );
}
