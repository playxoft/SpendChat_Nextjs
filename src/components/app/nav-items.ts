import { ChartColumn, MessageSquare, Settings, Table2 } from "lucide-react";

export const navItems = [
  { href: "/app", label: "Tracker", icon: MessageSquare, exact: true },
  { href: "/transactions", label: "Transactions", icon: Table2, exact: false },
  { href: "/analytics", label: "Analytics", icon: ChartColumn, exact: false },
  { href: "/settings", label: "Settings", icon: Settings, exact: false },
] as const;

export function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}`);
}
