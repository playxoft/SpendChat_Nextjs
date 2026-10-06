"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { hrefWithProfile, invitationBadge, isActive, navItems, splitNavItem } from "./nav-items";

/** Settings used to be filtered out here; it is no longer in `navItems` at all
 *  (it lives in the profile/user menu), so the bar is the whole list again. */
const BOTTOM_NAV_ITEMS = navItems;

export function BottomNav({ splitInvitations = 0 }: { splitInvitations?: number }) {
  const pathname = usePathname();
  const profile = useSearchParams().get("profile");
  const splitActive = isActive(pathname, splitNavItem.href, splitNavItem.exact);

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
              <item.icon className={cn("size-5", active && "scale-105")} />
              {item.label}
            </Link>
          );
        })}
        {/* Split is outside workspaces — no `?profile=` rides along. */}
        <Link
          href={splitNavItem.href}
          aria-current={splitActive ? "page" : undefined}
          className={cn(
            "relative flex flex-1 flex-col items-center justify-center gap-1 text-sm transition-colors",
            splitActive ? "text-foreground" : "text-muted-foreground",
          )}
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
      </div>
    </nav>
  );
}
