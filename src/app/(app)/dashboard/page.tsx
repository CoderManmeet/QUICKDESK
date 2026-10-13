import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/ticket-badges";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser, toActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isStaff, ticketScope } from "@/lib/permissions";
import { getDashboardCards } from "@/lib/tickets/list";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const actor = toActor(user);
  const staff = isStaff(actor);

  const [cards, recent] = await Promise.all([
    // Each count is limited in SQL to tickets this user may see.
    getDashboardCards(actor),
    db.ticket.findMany({
      where: ticketScope(actor),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 6,
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        status: true,
        priority: true,
        updatedAt: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Welcome, {user.name.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">
            {staff
              ? "Here is what needs attention in your queue."
              : "Track your support requests here."}
          </p>
        </div>
        <Link href="/tickets/new" className={cn(buttonVariants({ size: "sm" }), "shrink-0")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New ticket
        </Link>
      </div>

      <div
        className={cn(
          "grid grid-cols-2 gap-3 sm:grid-cols-3",
          staff ? "lg:grid-cols-4 xl:grid-cols-7" : "lg:grid-cols-5",
        )}
      >
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            data-card={card.key}
            className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                card.key === "overdue" && card.count > 0 ? "text-red-600 dark:text-red-400" : "",
              )}
            >
              {card.count}
            </p>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recently updated</CardTitle>
          <Link href="/tickets" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-8 w-8" aria-hidden="true" />}
              title="No tickets yet"
              description="Create a ticket to get started."
            />
          ) : (
            <ul className="divide-y">
              {recent.map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {ticket.subject}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {ticket.ticketNumber} · Updated {formatDateTime(ticket.updatedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <PriorityBadge priority={ticket.priority} />
                    <StatusBadge status={ticket.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
