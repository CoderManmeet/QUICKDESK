import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RuleForm } from "@/components/admin/rule-form";
import { emptyRule } from "@/lib/automation/form-value";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser, toActor } from "@/lib/auth/session";
import { getRuleFormOptions } from "@/lib/automation/admin";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "New automation rule" };

export default async function NewRulePage() {
  const user = await requireUser();
  if (!can(toActor(user), "admin.automation")) notFound();
  const options = await getRuleFormOptions();

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
          <CardTitle>New automation rule</CardTitle>
        </CardHeader>
        <CardContent>
          <RuleForm initial={emptyRule()} options={options} />
        </CardContent>
      </Card>
    </div>
  );
}
