import { Suspense } from "react";
import { getAppContext, getUserWorkspaces } from "@/lib/auth";
import { canWriteInWorkspace } from "@/lib/workspaces";
import { getAddLimits, getWorkspaceEntitlements, voiceAllowed } from "@/lib/entitlements";
import { getCategories, getProfiles, getTags } from "@/lib/queries";
import { normalizeUiPrefs } from "@/lib/validation";
import { listSpaces } from "@/services/spaces";
import { todayISO } from "@/lib/dates";
import { getTimeZone } from "@/lib/timezone.server";
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
  const timeZone = await getTimeZone();
  const [profiles, spaces, categories, tags, workspaces, canWrite, entitlements, addLimits] =
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
      getWorkspaceEntitlements(workspace.id),
      // What can still be added (spaces, categories, tags, members, a new
      // workspace) — so the "new …" buttons show a lock before a form is filled in.
      getAddLimits(workspace.id, user.id),
    ]);
  // Admins manage profiles/workspace; editors+ (canWrite) can add/edit transactions.
  const canManage = workspace.role === "admin";
  const collapsedSpaces = normalizeUiPrefs(settings.uiPrefs).sidebar.collapsedSpaces;

  return (
    <LoadingOverlayProvider>
    <PermissionsProvider canWrite={canWrite} canManage={canManage}>
    <PlanProvider
      plan={entitlements.plan}
      readOnly={entitlements.readOnly}
      voiceAllowed={voiceAllowed(entitlements)}
      profileLevelAccess={entitlements.limits.profileLevelAccess}
      addLimits={addLimits}
      currency={workspace.currency}
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
        <BottomNav />
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
