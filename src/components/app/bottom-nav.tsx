"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { hrefWithProfile, isActive, navItems } from "./nav-items";
import { BudgetNavBadge, type BudgetAlertCount } from "./budgets/budget-nav-badge";

/** Settings used to be filtered out here; it is no longer in `navItems` at all
 *  (it lives in the profile/user menu), so the bar is the whole list again. */
const BOTTOM_NAV_ITEMS = navItems;

export function BottomNav({ budgetAlerts }: { budgetAlerts?: Promise<BudgetAlertCount> } = {}) {
  const pathname = usePathname();
  const profile = useSearchParams().get("profile");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 h-16 border-t bg-background md:hidden print:hidden">
      <div className="mx-auto flex h-full max-w-md items-stretch justify-around">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={hrefWithProfile(item.href, profile)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-sm transition-colors",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <item.icon className={cn("size-5", active && "scale-105")} />
                {item.href === "/app/budgets" && (
                  <BudgetNavBadge alerts={budgetAlerts} className="absolute -top-1.5 -right-2.5" />
                )}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
