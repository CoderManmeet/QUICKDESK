"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, toActor } from "@/lib/auth/session";
import { validateReferences } from "@/lib/automation/admin";
import { ruleInputSchema } from "@/lib/automation/schema";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { can } from "@/lib/permissions";
import { field } from "@/lib/validation/auth";

const idSchema = z.string().regex(/^[a-z0-9]{1,40}$/i);
const DENIED: FormState = { error: "You do not have permission to do that." };

async function isAdmin(): Promise<boolean> {
  const user = await requireUser();
  return can(toActor(user), "admin.automation");
}

export async function saveRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await isAdmin())) return DENIED;

  let raw: unknown;
  try {
    raw = JSON.parse(field(formData, "payload"));
  } catch {
    return { error: "The form could not be read. Reload the page and try again." };
  }

  const parsed = ruleInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue ? issue.message : "Check the rule and try again." };
  }
  const rule = parsed.data;

  const referenceError = await validateReferences(rule);
  if (referenceError) return { error: referenceError };

  const ruleId = field(formData, "ruleId");
  const data = {
    name: rule.name,
    trigger: rule.trigger,
    elapsedMinutes: rule.elapsedMinutes,
    isEnabled: rule.isEnabled,
    conditions: rule.conditions,
    actions: rule.actions,
  };

  if (ruleId) {
    if (!idSchema.safeParse(ruleId).success) return { error: "This rule no longer exists." };
    const updated = await db.automationRule.updateMany({ where: { id: ruleId }, data });
    if (updated.count !== 1) return { error: "This rule no longer exists." };
  } else {
    const last = await db.automationRule.aggregate({ _max: { position: true } });
    await db.automationRule.create({ data: { ...data, position: (last._max.position ?? -1) + 1 } });
  }

  revalidatePath("/admin/automation");
  redirect("/admin/automation");
}

export async function toggleRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await isAdmin())) return DENIED;
  const id = idSchema.safeParse(field(formData, "ruleId"));
  if (!id.success) return { error: "This rule no longer exists." };

  const rule = await db.automationRule.findUnique({ where: { id: id.data }, select: { isEnabled: true } });
  if (!rule) return { error: "This rule no longer exists." };
  await db.automationRule.update({ where: { id: id.data }, data: { isEnabled: !rule.isEnabled } });

  revalidatePath("/admin/automation");
  return {};
}

export async function moveRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await isAdmin())) return DENIED;
  const id = idSchema.safeParse(field(formData, "ruleId"));
  const direction = field(formData, "direction");
  if (!id.success || (direction !== "up" && direction !== "down")) {
    return { error: "This rule no longer exists." };
  }

  await db.$transaction(async (tx) => {
    const rules = await tx.automationRule.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const index = rules.findIndex((rule) => rule.id === id.data);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= rules.length) return;

    [rules[index], rules[swapWith]] = [rules[swapWith], rules[index]];
    // Renumber everything so positions stay 0..n-1 with no gaps or ties.
    for (let position = 0; position < rules.length; position++) {
      await tx.automationRule.update({ where: { id: rules[position].id }, data: { position } });
    }
  });

  revalidatePath("/admin/automation");
  return {};
}

export async function deleteRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await isAdmin())) return DENIED;
  const id = idSchema.safeParse(field(formData, "ruleId"));
  if (!id.success) return { error: "This rule no longer exists." };

  await db.automationRule.deleteMany({ where: { id: id.data } });
  revalidatePath("/admin/automation");
  return {};
}
