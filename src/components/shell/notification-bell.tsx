"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Loader2 } from "lucide-react";
import { markNotificationsRead } from "@/app/(app)/notifications/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POLL_MS = 30_000;

type Item = {
  id: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/unread-count", { cache: "no-store" });
      if (response.ok) setUnread((await response.json()).count);
    } catch {
      // Offline or server restarting: keep the last known count.
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/notifications?limit=8", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 30 seconds while the tab is visible, and right away when it becomes visible.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshCount();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCount();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshCount]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void loadItems();
  }

  async function markAll() {
    await markNotificationsRead({ all: true });
    setUnread(0);
    setItems((current) => current?.map((item) => ({ ...item, read: true })) ?? current);
  }

  const label = unread === 0 ? "Notifications" : `Notifications, ${unread} unread`;

  return (
    <div className="relative" ref={panelRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
        className="relative"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 ? (
          <span
            data-unread={unread}
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-4 top-14 z-50 overflow-hidden rounded-lg border bg-card shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[22rem]"
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all as read
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && !items ? (
              <div className="flex items-center justify-center py-8" role="status">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Loading notifications</span>
              </div>
            ) : error ? (
              <div className="space-y-2 px-4 py-6 text-center text-sm" role="alert">
                <p>Could not load notifications.</p>
                <button
                  type="button"
                  onClick={() => void loadItems()}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : items && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                You are all caught up.
              </p>
            ) : (
              <ul className="divide-y">
                {(items ?? []).map((item) => (
                  <li key={item.id}>
                    <a
                      href={`/api/notifications/${item.id}/open`}
                      className={cn(
                        "flex gap-3 px-4 py-3 text-sm hover:bg-accent",
                        item.read ? "" : "bg-primary/5",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          item.read ? "bg-transparent" : "bg-primary",
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {item.title}
                          {item.read ? null : <span className="sr-only"> (unread)</span>}
                        </span>
                        {item.body ? (
                          <span className="block truncate text-muted-foreground">{item.body}</span>
                        ) : null}
                        <span className="block text-xs text-muted-foreground">
                          {timeAgo(item.createdAt)}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-accent"
          >
            View all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
