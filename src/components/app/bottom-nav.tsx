"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Ellipsis } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { hrefWithProfile, invitationBadge, isActive, navItems, splitNavItem } from "./nav-items";
import { BudgetNavBadge, type BudgetAlertCount } from "./budgets/budget-nav-badge";

/**
 * Five slots on a phone, so every label fits on one line at 320px: the
 * everyday places (Tracker, Ask, Transactions), Split, and "More" for the
 * rest (Analytics, Budgets, Files). Settings and Trash live in the account
 * menu, top right. The desktop sidebar still lists everything.
 */
const PRIMARY = new Set(["/app", "/app/ask", "/app/transactions"]);
const BAR_ITEMS = navItems.filter((item) => PRIMARY.has(item.href));
const MORE_ITEMS = navItems.filter((item) => !PRIMARY.has(item.href));

const slot = "flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors";

export function BottomNav({
  budgetAlerts,
  splitInvitations = 0,
}: { budgetAlerts?: Promise<BudgetAlertCount>; splitInvitations?: number } = {}) {
  const pathname = usePathname();
  const profile = useSearchParams().get("profile");
  const splitActive = isActive(pathname, splitNavItem.href, splitNavItem.exact);
  const moreActive = MORE_ITEMS.some((item) => isActive(pathname, item.href, item.exact));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 h-16 border-t bg-background md:hidden print:hidden">
      <div className="mx-auto flex h-full max-w-md items-stretch justify-around">
        {BAR_ITEMS.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={hrefWithProfile(item.href, profile)}
              aria-current={active ? "page" : undefined}
              className={cn(slot, active ? "text-foreground" : "text-muted-foreground")}
            >
              <item.icon className={cn("size-5", active && "scale-105")} />
              {item.label}
            </Link>
          );
        })}
        {/* Split is outside workspaces — no `?profile=` rides along. */}
        <Link
          href={splitNavItem.href}
          aria-current={splitActive ? "page" : undefined}
          className={cn("relative", slot, splitActive ? "text-foreground" : "text-muted-foreground")}
        >
          <splitNavItem.icon className={cn("size-5", splitActive && "scale-105")} />
          {splitNavItem.label}
          {splitInvitations > 0 && (
            <>
              <span aria-hidden className="absolute top-2 left-1/2 ml-2 size-2 rounded-full bg-primary" />
              <span className="sr-only">
                , {invitationBadge(splitInvitations)} {splitInvitations === 1 ? "invitation" : "invitations"}
              </span>
            </>
          )}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "relative outline-none",
              slot,
              moreActive ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Ellipsis className={cn("size-5", moreActive && "scale-105")} />
            More
            {/* A budget past 80% shows its dot here too, so it isn't hidden in the menu. */}
            <BudgetNavBadge alerts={budgetAlerts} className="absolute top-1 left-1/2 ml-1.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="min-w-44">
            {MORE_ITEMS.map((item) => (
              <DropdownMenuItem key={item.href} asChild className="py-2">
                <Link
                  href={hrefWithProfile(item.href, profile)}
                  aria-current={isActive(pathname, item.href, item.exact) ? "page" : undefined}
                >
                  <item.icon className="size-4" />
                  {item.label}
                  {item.href === "/app/budgets" && <BudgetNavBadge alerts={budgetAlerts} className="ml-auto" />}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
