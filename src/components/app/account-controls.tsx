"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";

/** Who's signed in, for the account menu: the layout reads it once per request. */
export type AccountSummary = {
  email: string | null;
  /** Display name and picture; either may be missing. */
  name: string | null;
  image: string | null;
};

const AccountContext = createContext<AccountSummary | null>(null);

export function AccountProvider({
  account,
  children,
}: {
  account: AccountSummary;
  children: ReactNode;
}) {
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

/**
 * The theme button and the account menu, in the top-right corner of every app
 * page.
 *
 * On a desktop there's no bar above the pages. The controls are drawn once, by
 * the layout (`AccountCorner`), pinned to the corner of the content area —
 * pages are centred at different widths, so a copy in each page's own first
 * row would sit wherever that page's column ends, not in the corner. What a
 * page renders here instead is a same-sized empty slot at the end of its first
 * row (header, title row), so nothing in that row runs under the corner. Below
 * `md` the phone's top bar carries the real controls (`inTopbar`).
 *
 * Keep it in a page's `loading.tsx` too, in the same spot, so a skeleton's
 * first row is laid out like the page's.
 */
export function AccountControls({
  inTopbar = false,
  className,
}: {
  inTopbar?: boolean;
  className?: string;
}) {
  const account = useContext(AccountContext);
  if (!account) return null;
  if (!inTopbar) {
    return <div aria-hidden className={cn("hidden h-8 w-[68px] shrink-0 md:block print:hidden", className)} />;
  }
  return (
    <div className={cn("flex shrink-0 items-center gap-1 print:hidden", className)}>
      <ThemeToggle />
      <UserMenu email={account.email} name={account.name} image={account.image} />
    </div>
  );
}

/**
 * The desktop copy of the controls, drawn once by the app layout and fixed to
 * the window's top-right corner — at the height every page's first row puts
 * its `AccountControls` slot (14px down), so it lines up with the titles. Fixed,
 * not absolute, so it stays with the sticky headers (tracker, split chat,
 * SpendChat AI) when a page scrolls; the faint backdrop keeps it readable over
 * content passing underneath. Being in the layout, it also stays put across
 * navigations. Under dialogs and menus (z-50), over sticky headers (z-10).
 */
export function AccountCorner() {
  const account = useContext(AccountContext);
  if (!account) return null;
  return (
    <div className="fixed right-4 top-3.5 z-20 hidden items-center gap-1 rounded-full bg-background/80 backdrop-blur-sm md:flex print:hidden">
      <ThemeToggle />
      <UserMenu email={account.email} name={account.name} image={account.image} />
    </div>
  );
}
