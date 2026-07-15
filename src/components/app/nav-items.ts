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

/**
 * Carry the currently-selected profile across section navigation. The active
 * profile lives entirely in the `?profile=` query param, so a plain section
 * link would drop it and the destination would fall back to the first profile.
 * Appending it here keeps the user on their chosen profile until they switch it
 * explicitly (profile button or Shift+n shortcut). `profile` is the raw param:
 * a profile id, "all", or null (the default first-profile state → no param).
 */
export function hrefWithProfile(href: string, profile: string | null): string {
  return profile ? `${href}?profile=${encodeURIComponent(profile)}` : href;
}
