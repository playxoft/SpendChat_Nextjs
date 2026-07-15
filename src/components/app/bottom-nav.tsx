"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { hrefWithProfile, isActive, navItems } from "./nav-items";

export function BottomNav() {
  const pathname = usePathname();
  const profile = useSearchParams().get("profile");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 h-16 border-t bg-background md:hidden print:hidden">
      <div className="mx-auto flex h-full max-w-md items-stretch justify-around">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={hrefWithProfile(item.href, profile)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <item.icon className={cn("size-5", active && "scale-105")} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
