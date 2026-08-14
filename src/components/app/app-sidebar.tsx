"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatStorageCompact } from "@/lib/files";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StorageRingSvg, storageExactLabel } from "./files/storage-ring";
import { ProfileList } from "./profile-list";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher";
import { hrefWithProfile, isActive, navItems } from "./nav-items";
import type { Profile } from "@/db/schema";

export function AppSidebar({
  email,
  profiles,
  workspaces,
  currentWorkspaceId,
  storage,
}: {
  email: string | null;
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  workspaces: WorkspaceOption[];
  currentWorkspaceId: string;
  /** Workspace storage usage, shown as a mini gauge on the Files item. */
  storage: { usedBytes: number; limitBytes: number };
}) {
  const pathname = usePathname();
  const profile = useSearchParams().get("profile");

  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-background md:flex print:hidden">
      <div className="flex h-14 shrink-0 items-center px-5">
        <Link href={hrefWithProfile("/app", profile)} aria-label="Tracker">
          <Logo />
        </Link>
      </div>

      <div className="shrink-0 px-3 pb-1">
        <WorkspaceSwitcher
          workspaces={workspaces}
          currentId={currentWorkspaceId}
          showShortcut
        />
      </div>

      {/* Profiles are the primary content — they fill the sidebar. */}
      <ProfileList profiles={profiles} enableShortcuts />

      <Separator className="my-1" />
      <nav className="shrink-0 space-y-1 px-3 py-2">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={hrefWithProfile(item.href, profile)}
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
              <span className="ml-auto flex items-center gap-1.5">
                {item.href === "/app/files" ? (
                  // Mini storage gauge; the exact numbers live in the tooltip
                  // (sidebar is md+ only, so hover is always available).
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                        <StorageRingSvg
                          usedBytes={storage.usedBytes}
                          limitBytes={storage.limitBytes}
                          className="size-3.5"
                        />
                        {formatStorageCompact(storage.usedBytes, storage.limitBytes)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {storageExactLabel(storage.usedBytes, storage.limitBytes)}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                <Kbd combo={item.shortcut} className="opacity-70" />
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center justify-between border-t px-3 py-1.5">
        <span className="text-xs text-muted-foreground">Theme</span>
        <ThemeToggle />
      </div>
      <div className="flex shrink-0 items-center border-t p-3">
        <UserMenu email={email} />
      </div>
    </aside>
  );
}
