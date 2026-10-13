import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { TicketTable, type SortLink, type TicketRow } from "@/components/tickets/ticket-table";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser, toActor } from "@/lib/auth/session";
import { can, isStaff } from "@/lib/permissions";
import {
  availableViews,
  getBulkAssignGroups,
  getFilterOptions,
  getTicketList,
  hasActiveFilters,
  isOverdue,
  listHref,
  parseListParams,
  type RawSearchParams,
  type SortKey,
} from "@/lib/tickets/list";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Tickets" };

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const actor = toActor(user);
  const staff = isStaff(actor);
  const canBulk = can(actor, "ticket.bulk");

  // Search, filters, sort and page all come from the URL and are validated here.
  const params = parseListParams(await searchParams, actor);
  const views = availableViews(actor);

  const [{ total, tickets, pageCount }, options, assignGroups] = await Promise.all([
    getTicketList(actor, params),
    getFilterOptions(actor),
    getBulkAssignGroups(actor),
  ]);

  const now = new Date();
  const rows: TicketRow[] = tickets.map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    category: ticket.category ? ticket.category.name : null,
    status: ticket.status,
    priority: ticket.priority,
    requester: ticket.requester.name,
    assignee: ticket.assignee ? ticket.assignee.name : null,
    updated: formatDateTime(ticket.updatedAt),
    overdue: isOverdue(ticket, now),
    // Escalation is internal: requesters never see it.
    escalated: staff && ticket.escalationLevel > 0,
  }));

  // Clicking a header sorts by it; clicking again flips the direction.
  const sortLink = (key: SortKey): SortLink => {
    const active = params.sort === key;
    return {
      href: listHref(params, {
        sort: key,
        dir: active ? (params.dir === "asc" ? "desc" : "asc") : undefined,
        page: 1,
      }),
      direction: active ? params.dir : null,
    };
  };

  const filtered = hasActiveFilters(params);
  const clearHref = params.view === "all" ? "/tickets" : `/tickets?view=${params.view}`;
  const page = Math.min(params.page, pageCount);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{staff ? "Tickets" : "My tickets"}</h1>
          <p className="text-sm text-muted-foreground" data-total={total}>
            {total === 1 ? "1 ticket" : `${total} tickets`}
            {filtered ? " match your search and filters" : ""}
          </p>
        </div>
        <Link href="/tickets/new" className={cn(buttonVariants({ size: "sm" }), "shrink-0")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New ticket
        </Link>
      </div>

      {views.length > 0 ? (
        <nav aria-label="Saved views" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {views.map((view) => {
            const active = params.view === view.key;
            return (
              <Link
                key={view.key}
                href={view.key === "all" ? "/tickets" : `/tickets?view=${view.key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {view.label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <Card>
        <TicketFilters
          values={params}
          staff={staff}
          options={options}
          clearHref={clearHref}
          showClear={filtered}
        />

        <TicketTable
          rows={rows}
          showRequester={staff}
          sort={{
            number: sortLink("number"),
            status: sortLink("status"),
            priority: sortLink("priority"),
            updated: sortLink("updated"),
          }}
          bulk={canBulk ? { assignGroups, tags: options.tags } : null}
          emptyState={
            <EmptyState
              icon={<Inbox className="h-8 w-8" aria-hidden="true" />}
              title={
                filtered
                  ? "No tickets match your search and filters"
                  : total > 0
                    ? "No tickets on this page"
                    : params.view === "all"
                      ? "No tickets yet"
                      : "No tickets in this view"
              }
              description={
                filtered
                  ? "Try a different search or clear the filters."
                  : total > 0
                    ? "Go back to an earlier page."
                    : params.view === "all"
                      ? "Create a ticket to get started."
                      : "Nothing needs attention here right now."
              }
            />
          }
        />
      </Card>

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={listHref(params, { page: page - 1 })}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={listHref(params, { page: page + 1 })}
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
