"use client";

import * as React from "react";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { TicketPriority, TicketStatus } from "@prisma/client";
import { bulkAction } from "@/app/(app)/tickets/bulk-actions";
import { PriorityBadge, StatusBadge } from "@/components/ticket-badges";
import { Badge } from "@/components/ui/badge";
import { FormAlert } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/labels";

export type TicketRow = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  requester: string;
  assignee: string | null;
  updated: string;
  overdue: boolean;
  escalated: boolean;
};

export type SortLink = { href: string; direction: "asc" | "desc" | null };

type BulkKind = "assign" | "status" | "priority" | "tag";

type BulkOptions = {
  assignGroups: { teamId: string; teamName: string; options: { value: string; label: string }[] }[];
  tags: { id: string; name: string }[];
};

const BULK_STATUSES: TicketStatus[] = [
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "RESOLVED",
  "OPEN",
  "CANCELLED",
];
const PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function SortHeader({ label, link }: { label: string; link: SortLink }) {
  return (
    <Link
      href={link.href}
      className="inline-flex items-center gap-1 hover:text-foreground"
      aria-label={`Sort by ${label}`}
    >
      {label}
      {link.direction === "asc" ? (
        <ArrowUp className="h-3 w-3" aria-hidden="true" />
      ) : link.direction === "desc" ? (
        <ArrowDown className="h-3 w-3" aria-hidden="true" />
      ) : null}
    </Link>
  );
}

export function TicketTable({
  rows,
  showRequester,
  sort,
  bulk,
  emptyState,
}: {
  rows: TicketRow[];
  /** Shown instead of the table when there are no rows. */
  emptyState: React.ReactNode;
  showRequester: boolean;
  sort: { number: SortLink; status: SortLink; priority: SortLink; updated: SortLink };
  /** Present only for team leads and admins. The server checks again on submit. */
  bulk: BulkOptions | null;
}) {
  const [state, action] = useActionState(bulkAction, initialFormState);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<BulkKind>("status");

  // After a bulk action the list reloads; start with a clean selection.
  useEffect(() => {
    setSelected(new Set());
  }, [state]);

  // Drop selections that are no longer on this page (filter or page changed).
  const visible = rows.filter((row) => selected.has(row.id));
  const allSelected = rows.length > 0 && visible.length === rows.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  }

  return (
    <div>
      {/* Stays mounted when an action empties the list, so its result stays visible. */}
      {bulk ? (
        <form
          action={action}
          aria-label="Bulk actions"
          className="flex flex-col gap-2 border-b bg-muted/40 px-4 py-3"
        >
          {visible.map((row) => (
            <input key={row.id} type="hidden" name="ticketIds" value={row.id} />
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium" aria-live="polite">
              {visible.length} selected
            </p>
            <Select
              name="action"
              aria-label="Bulk action"
              value={kind}
              onChange={(event) => setKind(event.target.value as BulkKind)}
              className="w-auto"
            >
              <option value="status">Change status</option>
              <option value="priority">Change priority</option>
              <option value="assign">Assign</option>
              <option value="tag">Add tag</option>
            </Select>
            <Select
              name="value"
              aria-label="Bulk value"
              key={kind}
              defaultValue=""
              required
              className="w-auto min-w-[10rem]"
            >
              <option value="" disabled>
                Choose
              </option>
              {kind === "status"
                ? BULK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </option>
                  ))
                : null}
              {kind === "priority"
                ? PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {PRIORITY_LABEL[priority]}
                    </option>
                  ))
                : null}
              {kind === "assign"
                ? bulk.assignGroups.map((group) => (
                    <optgroup key={group.teamId} label={group.teamName}>
                      {group.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))
                : null}
              {kind === "tag"
                ? bulk.tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))
                : null}
            </Select>
            <SubmitButton size="sm" className="h-9" disabled={visible.length === 0}>
              Apply
            </SubmitButton>
          </div>
          {state.success ? <FormAlert tone="success">{state.success}</FormAlert> : null}
          {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
        </form>
      ) : null}

      {rows.length === 0 ? (
        emptyState
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {bulk ? (
                <th scope="col" className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all tickets on this page"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-input"
                  />
                </th>
              ) : null}
              <th scope="col" className="px-4 py-2.5 font-medium">
                <SortHeader label="Ticket" link={sort.number} />
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">Subject</th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                <SortHeader label="Status" link={sort.status} />
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                <SortHeader label="Priority" link={sort.priority} />
              </th>
              {showRequester ? (
                <th scope="col" className="px-4 py-2.5 font-medium">Requester</th>
              ) : null}
              <th scope="col" className="px-4 py-2.5 font-medium">Assignee</th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                <SortHeader label="Updated" link={sort.updated} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} data-ticket={row.ticketNumber} className="hover:bg-muted/40">
                {bulk ? (
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.ticketNumber}`}
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                  </td>
                ) : null}
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                  <Link href={`/tickets/${row.id}`} className="hover:underline">
                    {row.ticketNumber}
                  </Link>
                </td>
                <td className="max-w-xs px-4 py-2.5">
                  <Link
                    href={`/tickets/${row.id}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {row.subject}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.category ?? "Uncategorised"}
                  </p>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <StatusBadge status={row.status} />
                    {row.escalated ? (
                      <Badge className="border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300">
                        Escalated
                      </Badge>
                    ) : null}
                    {row.overdue ? (
                      <Badge className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">
                        Overdue
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <PriorityBadge priority={row.priority} />
                </td>
                {showRequester ? (
                  <td className="whitespace-nowrap px-4 py-2.5">{row.requester}</td>
                ) : null}
                <td className="whitespace-nowrap px-4 py-2.5">
                  {row.assignee ?? <span className="text-muted-foreground">Unassigned</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                  {row.updated}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
