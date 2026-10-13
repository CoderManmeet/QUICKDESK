import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RuleForm } from "@/components/admin/rule-form";
import { ruleToFormValue } from "@/lib/automation/form-value";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser, toActor } from "@/lib/auth/session";
import { getRuleFormOptions } from "@/lib/automation/admin";
import { storedActionsSchema, storedConditionsSchema } from "@/lib/automation/schema";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Edit automation rule" };

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(toActor(user), "admin.automation")) notFound();

  const { id } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const [rule, options] = await Promise.all([
    db.automationRule.findUnique({ where: { id } }),
    getRuleFormOptions(),
  ]);
  if (!rule) notFound();

  const conditions = storedConditionsSchema.safeParse(rule.conditions);
  const actions = storedActionsSchema.safeParse(rule.actions);

  return (
    <div className="max-w-4xl space-y-4">
      <Link
        href="/admin/automation"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to automation
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Edit rule</CardTitle>
        </CardHeader>
        <CardContent>
          <RuleForm
            options={options}
            initial={ruleToFormValue({
              id: rule.id,
              name: rule.name,
              trigger: rule.trigger,
              elapsedMinutes: rule.elapsedMinutes,
              isEnabled: rule.isEnabled,
              conditions: conditions.success ? conditions.data : [],
              actions: actions.success
                ? (actions.data as unknown as Record<string, string>[])
                : [],
            })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
