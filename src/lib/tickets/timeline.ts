import type { TicketEventType, TicketPriority, TicketStatus } from "@prisma/client";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/labels";

export type TimelineEvent = {
  type: TicketEventType;
  fromValue: string | null;
  toValue: string | null;
};

export type TimelineNames = {
  users: Map<string, string>;
  teams: Map<string, string>;
  categories: Map<string, string>;
};

const status = (value: string | null) =>
  value ? (STATUS_LABEL[value as TicketStatus] ?? value) : "none";
const priority = (value: string | null) =>
  value ? (PRIORITY_LABEL[value as TicketPriority] ?? value) : "none";

/** Sentence fragment that follows the actor's name in the activity timeline. */
export function describeEvent(event: TimelineEvent, names: TimelineNames): string {
  const name = (map: Map<string, string>, value: string | null, fallback: string) =>
    value ? (map.get(value) ?? fallback) : null;

  switch (event.type) {
    case "CREATED":
      return "created the ticket";
    case "STATUS_CHANGED":
      return `changed status from ${status(event.fromValue)} to ${status(event.toValue)}`;
    case "PRIORITY_CHANGED":
      return `changed priority from ${priority(event.fromValue)} to ${priority(event.toValue)}`;
    case "ASSIGNEE_CHANGED": {
      const to = name(names.users, event.toValue, "a former user");
      const from = name(names.users, event.fromValue, "a former user");
      if (to && from) return `reassigned the ticket from ${from} to ${to}`;
      if (to) return `assigned the ticket to ${to}`;
      return `unassigned the ticket from ${from ?? "its assignee"}`;
    }
    case "TEAM_CHANGED": {
      const to = name(names.teams, event.toValue, "a former team");
      const from = name(names.teams, event.fromValue, "a former team");
      if (to && from) return `moved the ticket from ${from} to ${to}`;
      if (to) return `moved the ticket to ${to}`;
      return `removed the ticket from ${from ?? "its team"}`;
    }
    case "CATEGORY_CHANGED": {
      const to = name(names.categories, event.toValue, "a former category");
      const from = name(names.categories, event.fromValue, "a former category");
      return `changed category from ${from ?? "none"} to ${to ?? "none"}`;
    }
    case "TAG_ADDED":
      return `added the tag ${event.toValue ?? ""}`.trim();
    case "TAG_REMOVED":
      return `removed the tag ${event.fromValue ?? ""}`.trim();
    case "MERGED":
      return "merged this ticket";
    case "ESCALATED":
      return event.toValue === "2"
        ? "escalated the ticket to admins after a second SLA breach"
        : "escalated the ticket to team leads after an SLA breach";
    default:
      return "updated the ticket";
  }
}
