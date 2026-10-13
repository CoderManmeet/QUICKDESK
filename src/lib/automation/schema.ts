// Shape of an automation rule. Shared by the admin form (browser) and the
// server, which validates on save and again every time a rule runs.

import { z } from "zod";

export const TRIGGERS = ["TICKET_CREATED", "TICKET_UPDATED", "TIME_ELAPSED"] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
] as const;
export const RECIPIENTS = ["assignee", "team", "team_leads", "admins"] as const;

const id = z.string().regex(/^[a-z0-9]{1,40}$/i, "Choose a value.");

export const conditionSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("category"), value: id }),
  z.object({ field: z.literal("priority"), value: z.enum(PRIORITIES) }),
  z.object({ field: z.literal("status"), value: z.enum(STATUSES) }),
  z.object({
    field: z.literal("subject_contains"),
    value: z.string().trim().min(1, "Enter a keyword.").max(100),
  }),
]);
export type Condition = z.infer<typeof conditionSchema>;

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assign_team"), teamId: id }),
  z.object({ type: z.literal("assign_agent"), teamId: id, userId: id }),
  z.object({ type: z.literal("round_robin"), teamId: id }),
  z.object({ type: z.literal("set_priority"), priority: z.enum(PRIORITIES) }),
  z.object({ type: z.literal("add_tag"), tagId: id }),
  z.object({
    type: z.literal("notify"),
    recipient: z.enum(RECIPIENTS),
    message: z.string().trim().min(1, "Enter a message.").max(300),
  }),
]);
export type Action = z.infer<typeof actionSchema>;

export const ruleInputSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100),
    trigger: z.enum(TRIGGERS),
    elapsedMinutes: z.number().int().min(5).max(43200).nullable(),
    isEnabled: z.boolean(),
    conditions: z.array(conditionSchema).max(10, "Use at most 10 conditions."),
    actions: z.array(actionSchema).min(1, "Add at least one action.").max(10),
  })
  .superRefine((rule, ctx) => {
    if (rule.trigger === "TIME_ELAPSED" && rule.elapsedMinutes === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["elapsedMinutes"],
        message: "Set how many minutes without activity before the rule runs (5 or more).",
      });
    }
  })
  .transform((rule) => ({
    ...rule,
    elapsedMinutes: rule.trigger === "TIME_ELAPSED" ? rule.elapsedMinutes : null,
  }));
export type RuleInput = z.infer<typeof ruleInputSchema>;

export const storedConditionsSchema = z.array(conditionSchema);
export const storedActionsSchema = z.array(actionSchema);

export const TRIGGER_LABEL: Record<Trigger, string> = {
  TICKET_CREATED: "Ticket created",
  TICKET_UPDATED: "Ticket updated",
  TIME_ELAPSED: "Time elapsed",
};

export const RECIPIENT_LABEL: Record<(typeof RECIPIENTS)[number], string> = {
  assignee: "The assignee",
  team: "Everyone in the ticket's team",
  team_leads: "Team leads of the ticket's team",
  admins: "All admins",
};
