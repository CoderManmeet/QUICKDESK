import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/ticket-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser, toActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/labels";
import { ticketScope } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  // Every query below is limited in SQL to tickets this user may see.
  const scope = ticketScope(toActor(user));

  const [byStatus, recent] = await Promise.all([
    db.ticket.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    db.ticket.findMany({
      where: scope,
      orderBy: { updatedAt: "desc" },
      take: 5,
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

  const counts = new Map(byStatus.map((row) => [row.status, row._count._all]));
  const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          {total === 1 ? "1 ticket" : `${total} tickets`} visible to you.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATUS_ORDER.map((status) => (
          <Card key={status}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{STATUS_LABEL[status]}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {counts.get(status) ?? 0}
              </p>
            </CardContent>
          </Card>
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
              description="Tickets you can access will show up here."
            />
          ) : (
            <ul className="divide-y">
              {recent.map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{ticket.subject}</p>
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
