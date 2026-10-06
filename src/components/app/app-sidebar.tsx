"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { ThemeCapsule } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { Kbd } from "@/components/ui/kbd";
import { ProfileList, type SidebarProfile, type SidebarSpace } from "./profile-list";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher";
import { hrefWithProfile, isActive, navItems, splitNavItem } from "./nav-items";

export function AppSidebar({
  email,
  profiles,
  spaces,
  collapsedSpaces,
  workspaces,
  currentWorkspaceId,
  splitInvitations = 0,
}: {
  email: string | null;
  profiles: SidebarProfile[];
  spaces: SidebarSpace[];
  collapsedSpaces: string[];
  workspaces: WorkspaceOption[];
  currentWorkspaceId: string;
  /** Split invitations waiting for an answer — the badge on Split. */
  splitInvitations?: number;
}) {
  const pathname = usePathname();
  const splitActive = isActive(pathname, splitNavItem.href, splitNavItem.exact);
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

      {/* Spaces and their profiles are the primary content — they fill the sidebar. */}
      <ProfileList
        profiles={profiles}
        spaces={spaces}
        collapsedSpaces={collapsedSpaces}
        enableShortcuts
      />

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
              <Kbd combo={item.shortcut} className="ml-auto opacity-70" />
            </Link>
          );
        })}
      </nav>

      {/* Outside every workspace: split groups belong to the person. */}
      <Separator />
      <nav aria-label="Split" className="shrink-0 px-3 py-2">
        <Link
          href={splitNavItem.href}
          aria-current={splitActive ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            splitActive
              ? "bg-accent font-medium text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <splitNavItem.icon className="size-4" />
          {splitNavItem.label}
          {splitInvitations > 0 && (
            <span
              className="rounded-full bg-primary px-1.5 text-[11px] font-medium leading-4 text-primary-foreground"
              aria-label={`${splitInvitations} ${splitInvitations === 1 ? "invitation" : "invitations"}`}
            >
              {splitInvitations}
            </span>
          )}
          <Kbd combo={splitNavItem.shortcut} className="ml-auto opacity-70" />
        </Link>
      </nav>

      <div className="flex shrink-0 items-center justify-between border-t px-3 py-1.5">
        <span className="text-xs text-muted-foreground">Theme</span>
        <ThemeCapsule />
      </div>
      <div className="flex shrink-0 items-center border-t p-3">
        <UserMenu email={email} />
      </div>
    </aside>
  );
}
