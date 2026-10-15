import { ChartColumn, FolderOpen, MessageSquare, PiggyBank, ReceiptText, Sparkles, Split, Table2 } from "lucide-react";
import { comboFor } from "@/lib/shortcuts";
import { canonicalProfileParam } from "@/lib/profile-scope";

export const navItems = [
  { id: "tracker", href: "/app", label: "Tracker", icon: MessageSquare, exact: true, shortcut: comboFor("nav.tracker") },
  // SpendChat AI sits under the tracker: the same chat, asked instead of told.
  // `shortLabel` is what the phone's bottom bar prints — five slots at 320px
  // leave no room for the full name, which stays its accessible name there.
  {
    id: "ask",
    href: "/app/ask",
    label: "SpendChat AI",
    shortLabel: "AI",
    icon: Sparkles,
    exact: false,
    shortcut: comboFor("nav.ask"),
  },
  { id: "transactions", href: "/app/transactions", label: "Transactions", icon: Table2, exact: false, shortcut: comboFor("nav.transactions") },
  { id: "analytics", href: "/app/analytics", label: "Analytics", icon: ChartColumn, exact: false, shortcut: comboFor("nav.analytics") },
  { id: "budgets", href: "/app/budgets", label: "Budgets", icon: PiggyBank, exact: false, shortcut: comboFor("nav.budgets") },
  { id: "files", href: "/app/files", label: "Files", icon: FolderOpen, exact: false, shortcut: comboFor("nav.files") },
  { id: "invoices", href: "/app/invoices", label: "Invoices", icon: ReceiptText, exact: false, shortcut: comboFor("nav.invoices") },
] as const;

/**
 * Split sits apart from the list above: those sections all show the *current
 * workspace*, while split groups belong to the person and live outside every
 * workspace. The sidebar lets it be arranged with the rest (`sidebar-nav.tsx`,
 * under More by default); the mobile bar appends it as a fifth item. No
 * `?profile=` is carried there — there is no profile in a split group.
 */
export const splitNavItem = {
  id: "split",
  href: "/app/split",
  label: "Split",
  icon: Split,
  exact: false,
  shortcut: comboFor("nav.split"),
} as const;

/**
 * Settings is deliberately not here. It sits in the profile/user menu, which is
 * on every screen in both layouts, and listing it twice spent a nav slot on the
 * destination people visit least. The `s` shortcut still goes there — it is
 * registered from the shortcut registry in `global-shortcuts.tsx`, not from
 * this list, so the key and the cheat-sheet row are unaffected.
 */

/**
 * The invitations badge: `countInvitations` stops counting past 9, so ten or
 * more reads "9+".
 */
export function invitationBadge(count: number): string {
  return count > 9 ? "9+" : String(count);
}

export function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}`);
}

/**
 * Carry the current profile selection across section navigation. The selection
 * lives entirely in the `?profile=` query param, so a plain section link would
 * drop it and the destination would fall back to the first profile. Appending
 * it here keeps the user on what they picked until they change it explicitly
 * (the sidebar, the profile button, or a Shift+number shortcut).
 *
 * `profile` is the raw param: a profile id, "all", a multi-selection
 * (`<id>,s.<spaceId>,…` — see `lib/profile-scope.ts`), or null (the default
 * first-profile state → no param). It is carried in its canonical form, so a
 * mangled value is dropped rather than passed along. That form is URL-safe by
 * construction (hex ids, dashes, `s.`, commas, or "all"), so it goes in as is:
 * escaping would only turn each comma into `%2C`.
 */
export function hrefWithProfile(href: string, profile: string | null): string {
  const value = canonicalProfileParam(profile);
  return value ? `${href}?profile=${value}` : href;
}
