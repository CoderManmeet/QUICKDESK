"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  Ticket,
  UserCircle,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import { NotificationBell } from "@/components/shell/notification-bell";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NavIcon, NavItem } from "@/types/nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  ticket: Ticket,
  users: Users,
  automation: Zap,
  profile: UserCircle,
};

type ShellUser = { name: string; email: string; roleLabel: string };

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <LifeBuoy className="h-4 w-4" aria-hidden="true" />
      </span>
      QuickDesk
    </Link>
  );
}

function NavLinks({ nav, pathname }: { nav: NavItem[]; pathname: string }) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1 p-3">
      {nav.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  user,
  nav,
  unreadCount,
  children,
}: {
  user: ShellUser;
  unreadCount: number;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Close the mobile drawer after navigating.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card lg:flex">
        <div className="flex h-14 items-center border-b px-4">
          <Brand />
        </div>
        <NavLinks nav={nav} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-64 max-w-[80%] flex-col border-r bg-card">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <Brand />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <NavLinks nav={nav} pathname={pathname} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </Button>

          {/* Global search: a GET form, so the query lands in the ticket list URL. */}
          <form action="/tickets" method="get" role="search" className="min-w-0 flex-1">
            <div className="relative max-w-md">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                name="q"
                aria-label="Search all tickets"
                placeholder="Search tickets"
                maxLength={100}
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </form>

          <NotificationBell initialUnread={unreadCount} />
          <ThemeToggle />

          <Link
            href="/profile"
            className="hidden min-w-0 flex-col items-end rounded-md px-2 py-1 text-right hover:bg-accent sm:flex"
          >
            <span className="max-w-[12rem] truncate text-sm font-medium leading-tight">
              {user.name}
            </span>
            <span className="text-xs leading-tight text-muted-foreground">
              {user.roleLabel}
            </span>
          </Link>

          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
              <span className="sr-only sm:hidden">Log out</span>
            </Button>
          </form>
        </header>

        <main className="mx-auto w-full max-w-7xl p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
