"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { Separator } from "@/components/ui/separator";
import type { SidebarNavLayout } from "@/lib/sidebar-nav";
import { ProfileList, type SidebarProfile, type SidebarSpace } from "./profile-list";
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher";
import { hrefWithProfile, invitationBadge } from "./nav-items";
import { SidebarNav } from "./sidebar-nav";
import { BudgetNavBadge, type BudgetAlertCount } from "./budgets/budget-nav-badge";

export function AppSidebar({
  profiles,
  spaces,
  collapsedSpaces,
  navLayout,
  workspaces,
  currentWorkspaceId,
  budgetAlerts,
  splitInvitations = 0,
}: {
  profiles: SidebarProfile[];
  spaces: SidebarSpace[];
  collapsedSpaces: string[];
  /** `ui_prefs.sidebar.nav` — how the sections are arranged. */
  navLayout: SidebarNavLayout;
  workspaces: WorkspaceOption[];
  currentWorkspaceId: string;
  /** This month's budget alerts for the nav badge — streamed, never awaited. */
  budgetAlerts?: Promise<BudgetAlertCount>;
  /** Split invitations waiting for an answer — the badge on Split. */
  splitInvitations?: number;
}) {
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

      {/* Spaces and their profiles are the primary content — they fill the
          sidebar. The wrapper is the product tour's anchor for them, and
          passes the fill on (flex-1, min-h-0) so the list still scrolls. */}
      <div data-tour="spaces" className="flex min-h-0 flex-1 flex-col">
        <ProfileList
          profiles={profiles}
          spaces={spaces}
          collapsedSpaces={collapsedSpaces}
          enableShortcuts
        />
      </div>

      <Separator className="my-1" />
      <SidebarNav
        initial={navLayout}
        profile={profile}
        badges={{
          budgets: <BudgetNavBadge alerts={budgetAlerts} />,
          split:
            splitInvitations > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium leading-4 text-primary-foreground">
                <span aria-hidden>{invitationBadge(splitInvitations)}</span>
                <span className="sr-only">
                  , {invitationBadge(splitInvitations)} {splitInvitations === 1 ? "invitation" : "invitations"}
                </span>
              </span>
            ) : undefined,
        }}
      />
    </aside>
  );
}
