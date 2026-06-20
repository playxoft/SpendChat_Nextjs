"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { ProfileList } from "./profile-list";
import { UserMenu } from "./user-menu";
import { isActive, navItems } from "./nav-items";
import type { Profile } from "@/db/schema";

export function AppSidebar({
  email,
  profiles,
}: {
  email: string | null;
  profiles: Pick<Profile, "id" | "name" | "icon">[];
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-background md:flex print:hidden">
      <div className="flex h-14 shrink-0 items-center px-5">
        <Link href="/app" aria-label="Tracker">
          <Logo />
        </Link>
      </div>
      <nav className="shrink-0 space-y-1 px-3 py-2">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Separator className="my-1" />
      <ProfileList profiles={profiles} />

      <div className="flex shrink-0 items-center gap-1 border-t p-3">
        <UserMenu email={email} />
        <ThemeToggle />
      </div>
    </aside>
  );
}
