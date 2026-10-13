export type NavIcon = "dashboard" | "ticket" | "users" | "automation" | "profile";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
};
