"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";
import type { WorkspaceOption } from "./workspace-switcher";

/** Who's signed in, for the account menu: the layout reads it once per request. */
export type AccountSummary = {
  email: string | null;
  /** Display name and picture; either may be missing. */
  name: string | null;
  image: string | null;
  /** Their workspaces and the current one — the menu is where they switch. */
  workspaces: WorkspaceOption[];
  currentWorkspaceId: string;
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
 * the layout (`AccountCorner`), pinned to the window's corner — pages are
 * centred at different widths, so a copy in each page's own first row would sit
 * wherever that page's column ends, not in the corner. What a page renders here
 * instead is a clearance slot at the end of its first row (`CornerClearance`):
 * no width at all while the row ends well clear of the corner, so the page's own
 * buttons (Bulk add, Print…) sit flush with its column's right edge; on a window
 * narrow enough for the row to reach the corner, just enough width to keep them
 * out from under it. Below `md` the phone's top bar carries the real controls
 * (`inTopbar`).
 *
 * Keep it last in its row, in a page's `loading.tsx` too, so a skeleton's first
 * row is laid out like the page's.
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
  if (!inTopbar) return <CornerClearance className={className} />;
  return (
    <div className={cn("flex shrink-0 items-center gap-1 print:hidden", className)}>
      <ThemeToggle />
      <UserMenu account={account} />
    </div>
  );
}

/** How far in from the window's right edge `AccountCorner` reaches: `right-4` + its 68px + an 8px gap. */
const CORNER_REACH = 16 + 68 + 8;
/** The most a row can need: when it runs to the window edge less its own 16px padding. */
const CORNER_MAX_CLEARANCE = CORNER_REACH - 16;

/**
 * An empty slot, last in a page's first row, as wide as it takes to keep that
 * row's end out from under `AccountCorner` — 0 on a wide window. Measured, not
 * computed in CSS: rows sit in columns of every width, nested at different
 * depths. Being last, the slot's right edge is the row's end whatever its own
 * width, so the measurement is stable. When no clearance is needed the slot
 * also cancels the row's flex `gap` in front of it, or the row's last button
 * would still stop that gap short of the edge.
 */
function CornerClearance({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, marginLeft: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const measure = () => {
      const parent = el.parentElement;
      const gap = parent ? parseFloat(getComputedStyle(parent).columnGap) || 0 : 0;
      const needed = desktop.matches
        ? Math.min(CORNER_MAX_CLEARANCE, CORNER_REACH - (window.innerWidth - el.getBoundingClientRect().right))
        : 0;
      const next = needed > 0 ? { width: Math.max(0, needed - gap), marginLeft: 0 } : { width: 0, marginLeft: -gap };
      setBox((prev) => (prev.width === next.width && prev.marginLeft === next.marginLeft ? prev : next));
    };
    measure();
    const resized = new ResizeObserver(measure);
    resized.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => {
      resized.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn("hidden h-8 shrink-0 md:block print:hidden", className)}
      style={box}
    />
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
      <UserMenu account={account} />
    </div>
  );
}
