import { ChartColumn, FolderOpen, MessageSquare, Table2 } from "lucide-react";
import { comboFor } from "@/lib/shortcuts";

export const navItems = [
  { href: "/app", label: "Tracker", icon: MessageSquare, exact: true, shortcut: comboFor("nav.tracker") },
  { href: "/app/transactions", label: "Transactions", icon: Table2, exact: false, shortcut: comboFor("nav.transactions") },
  { href: "/app/analytics", label: "Analytics", icon: ChartColumn, exact: false, shortcut: comboFor("nav.analytics") },
  { href: "/app/files", label: "Files", icon: FolderOpen, exact: false, shortcut: comboFor("nav.files") },
] as const;

/**
 * Settings is deliberately not here. It sits in the profile/user menu, which is
 * on every screen in both layouts, and listing it twice spent a nav slot on the
 * destination people visit least. The `s` shortcut still goes there — it is
 * registered from the shortcut registry in `global-shortcuts.tsx`, not from
 * this list, so the key and the cheat-sheet row are unaffected.
 */

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
