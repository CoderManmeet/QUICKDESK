import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { z } from "zod";
import { PriorityBadge, StatusBadge } from "@/components/ticket-badges";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser, toActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isStaff, ticketScope } from "@/lib/permissions";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Tickets" };

const PAGE_SIZE = 20;
const pageSchema = z.coerce.number().int().min(1).max(100000).catch(1);

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await requireUser();
  const actor = toActor(user);
  const staff = isStaff(actor);
  // Limits the query in SQL to tickets this user may see.
  const scope = ticketScope(actor);

  const params = await searchParams;
  const page = pageSchema.parse(Array.isArray(params.page) ? params.page[0] : params.page);

  const [total, tickets] = await Promise.all([
    db.ticket.count({ where: scope }),
    db.ticket.findMany({
      where: scope,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        status: true,
        priority: true,
        updatedAt: true,
        category: { select: { name: true } },
        requester: { select: { name: true } },
        assignee: { select: { name: true } },
      },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{staff ? "Tickets" : "My tickets"}</h1>
        <p className="text-sm text-muted-foreground">
          {total === 1 ? "1 ticket" : `${total} tickets`}
        </p>
      </div>

      <Card>
        {tickets.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-8 w-8" aria-hidden="true" />}
            title={total === 0 ? "No tickets yet" : "No tickets on this page"}
            description={
              total === 0
                ? "Tickets you can access will show up here."
                : "Go back to an earlier page to see your tickets."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Ticket</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Subject</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Priority</th>
                  {staff ? (
                    <th scope="col" className="px-4 py-2.5 font-medium">Requester</th>
                  ) : null}
                  <th scope="col" className="px-4 py-2.5 font-medium">Assignee</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                      {ticket.ticketNumber}
                    </td>
                    <td className="max-w-xs px-4 py-2.5">
                      <p className="truncate font-medium">{ticket.subject}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ticket.category ? ticket.category.name : "Uncategorised"}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    {staff ? (
                      <td className="whitespace-nowrap px-4 py-2.5">{ticket.requester.name}</td>
                    ) : null}
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {ticket.assignee ? (
                        ticket.assignee.name
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                      {formatDateTime(ticket.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {Math.min(page, pageCount)} of {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/tickets?page=${Math.min(page, pageCount + 1) - 1}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={`/tickets?page=${page + 1}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
