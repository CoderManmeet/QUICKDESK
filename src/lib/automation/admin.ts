import "server-only";
import { Role, type AutomationRule } from "@prisma/client";
import { db } from "@/lib/db";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/labels";
import {
  RECIPIENT_LABEL,
  storedActionsSchema,
  storedConditionsSchema,
  type Action,
  type Condition,
  type RuleInput,
} from "@/lib/automation/schema";

/** Everything the rule form can pick from. */
export async function getRuleFormOptions() {
  const [categories, teams, tags] = await Promise.all([
    db.category.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.team.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        members: {
          where: { user: { isActive: true, deletedAt: null, role: { not: Role.REQUESTER } } },
          orderBy: { user: { name: "asc" } },
          select: { user: { select: { id: true, name: true } } },
        },
      },
    }),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return {
    categories,
    tags,
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      members: team.members.map((member) => member.user),
    })),
  };
}

export type RuleFormOptions = Awaited<ReturnType<typeof getRuleFormOptions>>;

/** Checks that every id in a rule points at something that exists. */
export async function validateReferences(rule: RuleInput): Promise<string | null> {
  for (const condition of rule.conditions) {
    if (condition.field === "category") {
      const found = await db.category.findFirst({ where: { id: condition.value, deletedAt: null } });
      if (!found) return "A condition uses a category that no longer exists.";
    }
  }

  for (const action of rule.actions) {
    if ("teamId" in action) {
      const team = await db.team.findFirst({ where: { id: action.teamId, deletedAt: null } });
      if (!team) return "An action uses a team that no longer exists.";
    }
    if (action.type === "assign_agent") {
      const member = await db.teamMember.findFirst({
        where: {
          teamId: action.teamId,
          userId: action.userId,
          user: { isActive: true, deletedAt: null, role: { not: Role.REQUESTER } },
        },
      });
      if (!member) return "The agent in an \"Assign to agent\" action must be an active member of the chosen team.";
    }
    if (action.type === "add_tag") {
      const tag = await db.tag.findUnique({ where: { id: action.tagId } });
      if (!tag) return "An action uses a tag that no longer exists.";
    }
  }
  return null;
}

type Names = {
  categories: Map<string, string>;
  teams: Map<string, string>;
  users: Map<string, string>;
  tags: Map<string, string>;
};

export async function loadNames(): Promise<Names> {
  const [categories, teams, users, tags] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true } }),
    db.team.findMany({ select: { id: true, name: true } }),
    db.user.findMany({ where: { role: { not: Role.REQUESTER } }, select: { id: true, name: true } }),
    db.tag.findMany({ select: { id: true, name: true } }),
  ]);
  const map = (rows: { id: string; name: string }[]) => new Map(rows.map((r) => [r.id, r.name]));
  return { categories: map(categories), teams: map(teams), users: map(users), tags: map(tags) };
}

function describeCondition(condition: Condition, names: Names): string {
  switch (condition.field) {
    case "category":
      return `Category is ${names.categories.get(condition.value) ?? "(deleted)"}`;
    case "priority":
      return `Priority is ${PRIORITY_LABEL[condition.value]}`;
    case "status":
      return `Status is ${STATUS_LABEL[condition.value]}`;
    case "subject_contains":
      return `Subject contains "${condition.value}"`;
  }
}

function describeAction(action: Action, names: Names): string {
  const team = (id: string) => names.teams.get(id) ?? "(deleted team)";
  switch (action.type) {
    case "assign_team":
      return `Move to team ${team(action.teamId)}`;
    case "assign_agent":
      return `Assign to ${names.users.get(action.userId) ?? "(removed user)"} in ${team(action.teamId)}`;
    case "round_robin":
      return `Round-robin assign in ${team(action.teamId)}`;
    case "set_priority":
      return `Set priority to ${PRIORITY_LABEL[action.priority]}`;
    case "add_tag":
      return `Add tag ${names.tags.get(action.tagId) ?? "(deleted tag)"}`;
    case "notify":
      return `Notify ${RECIPIENT_LABEL[action.recipient].toLowerCase()}: "${action.message}"`;
  }
}

export function describeRule(rule: AutomationRule, names: Names) {
  const conditions = storedConditionsSchema.safeParse(rule.conditions);
  const actions = storedActionsSchema.safeParse(rule.actions);
  const when =
    rule.trigger === "TICKET_CREATED"
      ? "When a ticket is created"
      : rule.trigger === "TICKET_UPDATED"
        ? "When a ticket is updated"
        : `After ${rule.elapsedMinutes} minutes without activity`;

  return {
    when,
    valid: conditions.success && actions.success,
    conditions: conditions.success
      ? conditions.data.length > 0
        ? conditions.data.map((c) => describeCondition(c, names))
        : ["Every ticket"]
      : [],
    actions: actions.success ? actions.data.map((a) => describeAction(a, names)) : [],
  };
}
