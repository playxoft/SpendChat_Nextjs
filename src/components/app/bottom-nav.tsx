"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActive, navItems } from "./nav-items";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-sm md:hidden print:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
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
