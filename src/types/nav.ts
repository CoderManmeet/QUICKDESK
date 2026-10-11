export type NavIcon = "dashboard" | "ticket" | "users" | "profile";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
};
