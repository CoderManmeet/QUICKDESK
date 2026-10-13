import "server-only";
import { can, isStaff, type Actor } from "@/lib/permissions";
import type { NavItem } from "@/types/nav";

/** Sidebar links for this user. Built on the server from the permission helper. */
export function navFor(actor: Actor): NavItem[] {
  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    {
      href: "/tickets",
      label: isStaff(actor) ? "Tickets" : "My tickets",
      icon: "ticket",
    },
  ];

  if (can(actor, "admin.users")) {
    items.push({ href: "/admin/users", label: "Users", icon: "users" });
  }
  if (can(actor, "admin.automation")) {
    items.push({ href: "/admin/automation", label: "Automation", icon: "automation" });
  }

  items.push({ href: "/profile", label: "Profile", icon: "profile" });
  return items;
}
