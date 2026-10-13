// Form rows for the automation rule editor. Plain module (not a client
// component) so server pages can build the initial value.

import type { Trigger } from "@/lib/automation/schema";

export type ConditionRow = { field: string; value: string };
export type ActionRow = {
  type: string;
  teamId: string;
  userId: string;
  priority: string;
  tagId: string;
  recipient: string;
  message: string;
};

export type RuleFormValue = {
  id?: string;
  name: string;
  trigger: Trigger;
  elapsedMinutes: number | null;
  isEnabled: boolean;
  conditions: ConditionRow[];
  actions: ActionRow[];
};

export const EMPTY_ACTION: ActionRow = {
  type: "assign_team",
  teamId: "",
  userId: "",
  priority: "HIGH",
  tagId: "",
  recipient: "team_leads",
  message: "",
};

export function emptyRule(): RuleFormValue {
  return {
    name: "",
    trigger: "TICKET_CREATED",
    elapsedMinutes: 60,
    isEnabled: true,
    conditions: [],
    actions: [{ ...EMPTY_ACTION }],
  };
}

/** Converts a stored rule back into form rows. */
export function ruleToFormValue(rule: {
  id: string;
  name: string;
  trigger: Trigger;
  elapsedMinutes: number | null;
  isEnabled: boolean;
  conditions: { field: string; value: string }[];
  actions: Record<string, string>[];
}): RuleFormValue {
  return {
    id: rule.id,
    name: rule.name,
    trigger: rule.trigger,
    elapsedMinutes: rule.elapsedMinutes ?? 60,
    isEnabled: rule.isEnabled,
    conditions: rule.conditions.map((c) => ({ field: c.field, value: c.value })),
    actions: rule.actions.map((a) => ({ ...EMPTY_ACTION, ...a }) as ActionRow),
  };
}
