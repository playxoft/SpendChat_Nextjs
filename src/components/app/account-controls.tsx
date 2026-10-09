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
 * The theme button and the account menu, top right of every app page.
 *
 * On a desktop there's no bar above the pages: each page puts these at the end
 * of its own first row (header, title row), so they cost no height of their
 * own. That's the default here — hidden below `md`, where the phone's top bar
 * carries them instead (`inTopbar`).
 *
 * Render it in a page's `loading.tsx` too, in the same spot: a skeleton that
 * dropped it would make the avatar blink on every navigation.
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
  return (
    <div
      className={cn(
        "shrink-0 items-center gap-1 print:hidden",
        inTopbar ? "flex" : "hidden md:flex",
        className,
      )}
    >
      <ThemeToggle />
      <UserMenu email={account.email} name={account.name} image={account.image} />
    </div>
  );
}
