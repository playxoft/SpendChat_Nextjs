import { Suspense } from "react";
import { getAppContext, getUserWorkspaces } from "@/lib/auth";
import { canWriteInWorkspace } from "@/lib/workspaces";
import { getAddLimits } from "@/lib/entitlements";
import { getCategories, getProfiles, getTags } from "@/lib/queries";
import { normalizeUiPrefs } from "@/lib/validation";
import { listSpaces } from "@/services/spaces";
import { monthKey, todayISO } from "@/lib/dates";
import { getBudgetAlertCount } from "@/services/budgets";
import { describeError, logger } from "@/lib/logger";
import { getTimeZone } from "@/lib/timezone.server";
import { requestCountry } from "@/lib/geo.server";
import { workspacePriceCurrency } from "@/lib/plan-copy";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { BottomNav } from "@/components/app/bottom-nav";
import { GlobalShortcuts } from "@/components/app/global-shortcuts";
import { WorkspaceSwitchDialog } from "@/components/app/workspace-switch-dialog";
import { LoadingOverlayProvider } from "@/components/app/loading-overlay";
import { PermissionsProvider } from "@/components/app/permissions";
import { PlanProvider } from "@/components/app/upgrade-dialog";
import { AttachmentViewerProvider } from "@/components/app/attachments/attachment-viewer";
import { TimezoneSync } from "@/components/app/timezone-sync";

// Auth + DB access — always rendered dynamically per request.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user, settings, workspace } = await getAppContext();
  const email = user.email;
  const [timeZone, country] = await Promise.all([getTimeZone(), requestCountry()]);
  // The nav's budget badge: started here, never awaited — the badge streams in
  // under its own Suspense, so a slow count can't hold up the page. A failure
  // shows no badge rather than an error.
  const budgetAlerts = getBudgetAlertCount(
    user.id,
    workspace.id,
    monthKey(todayISO(timeZone)),
  ).catch((err: unknown) => {
    logger.warn(`The budget badge count failed: ${describeError(err)}`, {
      event: "budget.badge_failed",
      error: err,
    });
    return { warn: 0, over: 0 };
  });
  const [profiles, spaces, categories, tags, workspaces, canWrite, addLimits] =
    await Promise.all([
      getProfiles(user.id, workspace.id),
      // The sidebar's groups: every space for admins, a member's own spaces otherwise.
      listSpaces(user.id, workspace.id),
      getCategories(workspace.id),
      // For the add dialog the shortcuts mount app-wide. Workspace-scoped like
      // the categories beside it, so it rides the same round-trip.
      getTags(workspace.id),
      getUserWorkspaces(user.id),
      canWriteInWorkspace(user.id, workspace.id),
      // The plan, and what can still be added (spaces, categories, tags,
      // members, a new workspace) — so the "new …" buttons show a lock before
      // a form is filled in.
      getAddLimits(workspace.id, user.id),
    ]);
  // Admins manage profiles/workspace; editors+ (canWrite) can add/edit transactions.
  const canManage = workspace.role === "admin";
  const collapsedSpaces = normalizeUiPrefs(settings.uiPrefs).sidebar.collapsedSpaces;

  return (
    <LoadingOverlayProvider>
    <PermissionsProvider canWrite={canWrite} canManage={canManage}>
    <PlanProvider
      plan={addLimits.plan}
      readOnly={addLimits.readOnly}
      voiceAllowed={addLimits.voice}
      profileLevelAccess={addLimits.profileLevelAccess}
      addLimits={addLimits}
      currency={workspacePriceCurrency(workspace.currency, country)}
    >
    <AttachmentViewerProvider>
    <div className="flex min-h-svh">
      <AppSidebar
        email={email}
        profiles={profiles}
        spaces={spaces}
        collapsedSpaces={collapsedSpaces}
        workspaces={workspaces}
        currentWorkspaceId={workspace.id}
        budgetAlerts={budgetAlerts}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          email={email}
          profiles={profiles}
          spaces={spaces}
          collapsedSpaces={collapsedSpaces}
          workspaces={workspaces}
          currentWorkspaceId={workspace.id}
          categories={categories}
          currency={workspace.currency}
          locale={workspace.locale}
          today={todayISO(timeZone)}
          canWrite={canWrite}
        />
        <main className="flex-1 pb-16 md:pb-0">{children}</main>
        <BottomNav budgetAlerts={budgetAlerts} />
      </div>
      {/* `g` from anywhere opens the workspace picker; 1…9 jump straight to one. */}
      <WorkspaceSwitchDialog workspaces={workspaces} currentWorkspaceId={workspace.id} />
      {/* Reports the browser's timezone so server-rendered times match the viewer's region. */}
      <TimezoneSync current={timeZone} />
      {/* App-wide keyboard shortcuts (nav, add, bulk add, focus search). */}
      <Suspense fallback={null}>
        <GlobalShortcuts
          categories={categories}
          profiles={profiles}
          tags={tags}
          currency={workspace.currency}
          locale={workspace.locale}
          today={todayISO(timeZone)}
          canWrite={canWrite}
        />
      </Suspense>
    </div>
    </AttachmentViewerProvider>
    </PlanProvider>
    </PermissionsProvider>
    </LoadingOverlayProvider>
  );
}
