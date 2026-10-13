import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Zap } from "lucide-react";
import {
  deleteRuleAction,
  moveRuleAction,
  toggleRuleAction,
} from "@/app/(app)/admin/automation/actions";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { ActionForm } from "@/components/tickets/action-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser, toActor } from "@/lib/auth/session";
import { describeRule, loadNames } from "@/lib/automation/admin";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Automation" };

export default async function AutomationPage() {
  const user = await requireUser();
  if (!can(toActor(user), "admin.automation")) notFound();

  const [rules, names] = await Promise.all([
    db.automationRule.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { runs: true } } },
    }),
    loadNames(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Automation rules</h1>
          <p className="text-sm text-muted-foreground">
            Rules run top to bottom. A later rule sees the changes made by earlier ones.
          </p>
        </div>
        <Link href="/admin/automation/new" className={cn(buttonVariants({ size: "sm" }))}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New rule
        </Link>
      </div>

      <Card>
        {rules.length === 0 ? (
          <EmptyState
            icon={<Zap className="h-8 w-8" aria-hidden="true" />}
            title="No automation rules yet"
            description="Create a rule to route, prioritise or tag tickets automatically."
          />
        ) : (
          <ol className="divide-y">
            {rules.map((rule, index) => {
              const summary = describeRule(rule, names);
              return (
                <li
                  key={rule.id}
                  data-rule={rule.name}
                  className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between"
                >
                  <div className="flex min-w-0 gap-3">
                    <span className="mt-0.5 w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                      {index + 1}.
                    </span>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{rule.name}</p>
                        {rule.isEnabled ? (
                          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                            Enabled
                          </Badge>
                        ) : (
                          <Badge className="border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300">
                            Disabled
                          </Badge>
                        )}
                        {!summary.valid ? (
                          <Badge className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">
                            Invalid, skipped
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {summary.when} · if {summary.conditions.join(" and ")}
                      </p>
                      <ul className="list-inside list-disc text-sm">
                        {summary.actions.map((text, i) => (
                          <li key={i} className="break-words">
                            {text}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-muted-foreground">
                        Ran {rule._count.runs === 1 ? "once" : `${rule._count.runs} times`}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-start gap-1.5 pl-8 md:pl-0">
                    <ActionForm action={moveRuleAction}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <input type="hidden" name="direction" value="up" />
                      <SubmitButton
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        aria-label={`Move ${rule.name} up`}
                        disabled={index === 0}
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={moveRuleAction}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <input type="hidden" name="direction" value="down" />
                      <SubmitButton
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        aria-label={`Move ${rule.name} down`}
                        disabled={index === rules.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={toggleRuleAction}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <SubmitButton size="sm" variant="outline" aria-label={`${rule.isEnabled ? "Disable" : "Enable"} ${rule.name}`}>
                        {rule.isEnabled ? "Disable" : "Enable"}
                      </SubmitButton>
                    </ActionForm>
                    <Link
                      href={`/admin/automation/${rule.id}`}
                      aria-label={`Edit ${rule.name}`}
                      className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Edit
                    </Link>
                    <ActionForm action={deleteRuleAction}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <ConfirmButton
                        size="sm"
                        variant="outline"
                        aria-label={`Delete ${rule.name}`}
                        message={`Delete the rule "${rule.name}"? This cannot be undone.`}
                      >
                        Delete
                      </ConfirmButton>
                    </ActionForm>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card>
        <CardContent className="space-y-1 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Scheduled job</p>
          <p>
            &quot;Time elapsed&quot; rules, SLA warnings, escalation and auto-closing of resolved
            tickets run in the scheduled job at <code>/api/cron/run</code>. Call it every 5 minutes
            with the <code>CRON_SECRET</code> header (see the README). Locally, run{" "}
            <code>npm run jobs</code> next to <code>npm run dev</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
