import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { markAllReadFormAction } from "@/app/(app)/notifications/actions";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/lib/auth/session";
import { listNotifications } from "@/lib/notifications/queries";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

const PAGE_SIZE = 30;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await requireUser();
  const raw = (await searchParams).page;
  const requested = Number(Array.isArray(raw) ? raw[0] : raw);
  const page = Number.isInteger(requested) && requested > 1 ? requested : 1;

  const { items, total, unread } = await listNotifications(user.id, {
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground" data-unread-total={unread}>
            {unread === 0 ? "No unread notifications" : `${unread} unread`}
          </p>
        </div>
        {unread > 0 ? (
          <form action={markAllReadFormAction}>
            <SubmitButton size="sm" variant="outline">
              Mark all as read
            </SubmitButton>
          </form>
        ) : null}
      </div>

      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-8 w-8" aria-hidden="true" />}
            title="No notifications yet"
            description="Replies, assignments and status changes on your tickets will show up here."
          />
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`/api/notifications/${item.id}/open`}
                  className={cn(
                    "flex gap-3 px-4 py-3 text-sm hover:bg-accent/60",
                    item.readAt ? "" : "bg-primary/5",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      item.readAt ? "bg-transparent" : "bg-primary",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {item.title}
                      {item.readAt ? null : <span className="sr-only"> (unread)</span>}
                    </span>
                    {item.body ? (
                      <span className="block break-words text-muted-foreground">{item.body}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(item.createdAt)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
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
                href={`/notifications?page=${page - 1}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={`/notifications?page=${page + 1}`}
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
