import { ChartColumn, MessageSquare, Settings, Table2 } from "lucide-react";
import { comboFor } from "@/lib/shortcuts";

export const navItems = [
  { href: "/app", label: "Tracker", icon: MessageSquare, exact: true, shortcut: comboFor("nav.tracker") },
  { href: "/transactions", label: "Transactions", icon: Table2, exact: false, shortcut: comboFor("nav.transactions") },
  { href: "/analytics", label: "Analytics", icon: ChartColumn, exact: false, shortcut: comboFor("nav.analytics") },
  { href: "/settings", label: "Settings", icon: Settings, exact: false, shortcut: comboFor("nav.settings") },
] as const;

export function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}`);
}
