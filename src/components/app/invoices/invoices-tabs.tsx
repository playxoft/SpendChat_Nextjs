"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/app/invoices", label: "Invoices & quotes", blurb: "Invoices and quotes, numbered for you." },
  { href: "/app/invoices/clients", label: "Clients", blurb: "The people and companies you bill." },
  { href: "/app/invoices/details", label: "Your details", blurb: "Who your invoices and quotes are from." },
] as const;

/**
 * The invoices section's three pages, as tabs under its heading. They live in
 * the `(tabs)`
 * layout, so switching tabs keeps the heading and the tabs on screen and only
 * the content below loads.
 */
export function InvoicesTabs() {
  const pathname = usePathname();
  const active = TABS.find((t) => t.href === pathname) ?? TABS[0];
  return (
    <nav aria-label="Invoices" className="-mb-px flex min-w-0 gap-1 overflow-x-auto">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          title={tab.blurb}
          aria-current={active.href === tab.href ? "page" : undefined}
          className={cn(
            "shrink-0 border-b-2 px-2.5 py-2 text-sm font-medium transition-colors",
            active.href === tab.href
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The section's page: wide, since every tab is a list with a panel beside it.
 * From `lg` it's exactly the screen's height and never scrolls — the list and
 * the panel (or the editor's form and preview) scroll on their own, each to
 * its end (`SplitView`). Below that it's an ordinary scrolling page.
 */
export function InvoicesShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 pt-3 pb-6 lg:h-svh lg:overflow-hidden lg:pb-3">
      {children}
    </div>
  );
}
