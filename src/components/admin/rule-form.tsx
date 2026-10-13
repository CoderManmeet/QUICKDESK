"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { saveRuleAction } from "@/app/(app)/admin/automation/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  PRIORITIES,
  RECIPIENTS,
  RECIPIENT_LABEL,
  STATUSES,
  TRIGGER_LABEL,
  TRIGGERS,
  type Trigger,
} from "@/lib/automation/schema";
import {
  EMPTY_ACTION,
  type ActionRow,
  type ConditionRow,
  type RuleFormValue,
} from "@/lib/automation/form-value";
import { initialFormState } from "@/lib/form-state";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };
type TeamOption = Option & { members: Option[] };

const CONDITION_FIELDS: [string, string][] = [
  ["category", "Category is"],
  ["priority", "Priority is"],
  ["status", "Status is"],
  ["subject_contains", "Subject contains"],
];

const ACTION_TYPES: [string, string][] = [
  ["assign_team", "Move to team"],
  ["assign_agent", "Assign to agent"],
  ["round_robin", "Round-robin assign in team"],
  ["set_priority", "Set priority"],
  ["add_tag", "Add tag"],
  ["notify", "Send notification"],
];

/** Turns the form rows into the exact JSON shape the server validates. */
function toPayload(value: RuleFormValue) {
  return {
    name: value.name,
    trigger: value.trigger,
    elapsedMinutes: value.trigger === "TIME_ELAPSED" ? value.elapsedMinutes : null,
    isEnabled: value.isEnabled,
    conditions: value.conditions.map((c) => ({ field: c.field, value: c.value })),
    actions: value.actions.map((a) => {
      switch (a.type) {
        case "assign_team":
        case "round_robin":
          return { type: a.type, teamId: a.teamId };
        case "assign_agent":
          return { type: a.type, teamId: a.teamId, userId: a.userId };
        case "set_priority":
          return { type: a.type, priority: a.priority };
        case "add_tag":
          return { type: a.type, tagId: a.tagId };
        default:
          return { type: a.type, recipient: a.recipient, message: a.message };
      }
    }),
  };
}

export function RuleForm({
  initial,
  options,
}: {
  initial: RuleFormValue;
  options: { categories: Option[]; teams: TeamOption[]; tags: Option[] };
}) {
  const [state, action] = useActionState(saveRuleAction, initialFormState);
  const [rule, setRule] = useState<RuleFormValue>(initial);
  const payload = useMemo(() => JSON.stringify(toPayload(rule)), [rule]);

  const setCondition = (index: number, patch: Partial<ConditionRow>) =>
    setRule((r) => ({
      ...r,
      conditions: r.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  const setAction = (index: number, patch: Partial<ActionRow>) =>
    setRule((r) => ({
      ...r,
      actions: r.actions.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="payload" value={payload} />
      {rule.id ? <input type="hidden" name="ruleId" value={rule.id} /> : null}
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="rule-name">Rule name</Label>
          <Input
            id="rule-name"
            value={rule.name}
            maxLength={100}
            onChange={(e) => setRule((r) => ({ ...r, name: e.target.value }))}
            placeholder="For example: Refund requests go to Billing"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rule-trigger">When</Label>
          <Select
            id="rule-trigger"
            value={rule.trigger}
            onChange={(e) => setRule((r) => ({ ...r, trigger: e.target.value as Trigger }))}
          >
            {TRIGGERS.map((trigger) => (
              <option key={trigger} value={trigger}>
                {TRIGGER_LABEL[trigger]}
              </option>
            ))}
          </Select>
        </div>

        {rule.trigger === "TIME_ELAPSED" ? (
          <div className="space-y-1.5">
            <Label htmlFor="rule-minutes">Minutes without activity</Label>
            <Input
              id="rule-minutes"
              type="number"
              min={5}
              max={43200}
              value={rule.elapsedMinutes ?? ""}
              onChange={(e) =>
                setRule((r) => ({
                  ...r,
                  elapsedMinutes: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Checked by the scheduled job. Fires once, then again only after new activity.
            </p>
          </div>
        ) : (
          <p className="self-end text-xs text-muted-foreground sm:pb-2">
            {rule.trigger === "TICKET_CREATED"
              ? "Runs right after a ticket is created."
              : "Runs after any change by a person: reply, status, priority, assignment or edit."}
          </p>
        )}

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={rule.isEnabled}
            onChange={(e) => setRule((r) => ({ ...r, isEnabled: e.target.checked }))}
            className="h-4 w-4 rounded border-input"
          />
          Enabled
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">If all of these are true</legend>
        {rule.conditions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No conditions: the rule applies to every ticket.</p>
        ) : null}
        {rule.conditions.map((condition, index) => (
          <div key={index} data-condition={index} className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={`Condition ${index + 1} field`}
              value={condition.field}
              onChange={(e) =>
                setCondition(index, {
                  field: e.target.value,
                  value:
                    e.target.value === "priority"
                      ? "HIGH"
                      : e.target.value === "status"
                        ? "OPEN"
                        : "",
                })
              }
              className="w-auto"
            >
              {CONDITION_FIELDS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>

            {condition.field === "category" ? (
              <Select
                aria-label={`Condition ${index + 1} value`}
                value={condition.value}
                onChange={(e) => setCondition(index, { value: e.target.value })}
                className="w-auto min-w-[10rem]"
              >
                <option value="">Choose a category</option>
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            ) : condition.field === "priority" ? (
              <Select
                aria-label={`Condition ${index + 1} value`}
                value={condition.value}
                onChange={(e) => setCondition(index, { value: e.target.value })}
                className="w-auto"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            ) : condition.field === "status" ? (
              <Select
                aria-label={`Condition ${index + 1} value`}
                value={condition.value}
                onChange={(e) => setCondition(index, { value: e.target.value })}
                className="w-auto"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                aria-label={`Condition ${index + 1} value`}
                value={condition.value}
                maxLength={100}
                placeholder="keyword"
                onChange={(e) => setCondition(index, { value: e.target.value })}
                className="w-48"
              />
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove condition ${index + 1}`}
              onClick={() =>
                setRule((r) => ({ ...r, conditions: r.conditions.filter((_, i) => i !== index) }))
              }
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rule.conditions.length >= 10}
          onClick={() =>
            setRule((r) => ({ ...r, conditions: [...r.conditions, { field: "category", value: "" }] }))
          }
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add condition
        </Button>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Then do this, in order</legend>
        {rule.actions.map((item, index) => {
          const team = options.teams.find((t) => t.id === item.teamId);
          return (
            <div key={index} data-action={index} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
              <Select
                aria-label={`Action ${index + 1} type`}
                value={item.type}
                onChange={(e) => setAction(index, { ...EMPTY_ACTION, type: e.target.value })}
                className="w-auto"
              >
                {ACTION_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>

              {["assign_team", "assign_agent", "round_robin"].includes(item.type) ? (
                <Select
                  aria-label={`Action ${index + 1} team`}
                  value={item.teamId}
                  onChange={(e) => setAction(index, { teamId: e.target.value, userId: "" })}
                  className="w-auto min-w-[10rem]"
                >
                  <option value="">Choose a team</option>
                  {options.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              ) : null}

              {item.type === "assign_agent" ? (
                <Select
                  aria-label={`Action ${index + 1} agent`}
                  value={item.userId}
                  disabled={!team}
                  onChange={(e) => setAction(index, { userId: e.target.value })}
                  className="w-auto min-w-[10rem]"
                >
                  <option value="">{team ? "Choose an agent" : "Choose a team first"}</option>
                  {(team?.members ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              ) : null}

              {item.type === "set_priority" ? (
                <Select
                  aria-label={`Action ${index + 1} priority`}
                  value={item.priority}
                  onChange={(e) => setAction(index, { priority: e.target.value })}
                  className="w-auto"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </Select>
              ) : null}

              {item.type === "add_tag" ? (
                <Select
                  aria-label={`Action ${index + 1} tag`}
                  value={item.tagId}
                  onChange={(e) => setAction(index, { tagId: e.target.value })}
                  className="w-auto min-w-[8rem]"
                >
                  <option value="">Choose a tag</option>
                  {options.tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              ) : null}

              {item.type === "notify" ? (
                <>
                  <Select
                    aria-label={`Action ${index + 1} recipient`}
                    value={item.recipient}
                    onChange={(e) => setAction(index, { recipient: e.target.value })}
                    className="w-auto"
                  >
                    {RECIPIENTS.map((r) => (
                      <option key={r} value={r}>
                        {RECIPIENT_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`Action ${index + 1} message`}
                    value={item.message}
                    maxLength={300}
                    placeholder="Message"
                    onChange={(e) => setAction(index, { message: e.target.value })}
                    className="min-w-[12rem] flex-1"
                  />
                </>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove action ${index + 1}`}
                onClick={() =>
                  setRule((r) => ({ ...r, actions: r.actions.filter((_, i) => i !== index) }))
                }
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rule.actions.length >= 10}
          onClick={() => setRule((r) => ({ ...r, actions: [...r.actions, { ...EMPTY_ACTION }] }))}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add action
        </Button>
      </fieldset>

      <div className="flex gap-2">
        <SubmitButton>{rule.id ? "Save rule" : "Create rule"}</SubmitButton>
        <Link href="/admin/automation" className={cn(buttonVariants({ variant: "outline" }))}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
