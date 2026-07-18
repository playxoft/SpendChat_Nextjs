import { Suspense } from "react";
import { getAppContext, getUserWorkspaces } from "@/lib/auth";
import { canWriteInWorkspace } from "@/lib/workspaces";
import { getCategories, getProfiles } from "@/lib/queries";
import { todayISO } from "@/lib/dates";
import { getTimeZone } from "@/lib/timezone.server";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { BottomNav } from "@/components/app/bottom-nav";
import { GlobalShortcuts } from "@/components/app/global-shortcuts";
import { LoadingOverlayProvider } from "@/components/app/loading-overlay";
import { TimezoneSync } from "@/components/app/timezone-sync";

// Auth + DB access — always rendered dynamically per request.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user, workspace } = await getAppContext();
  const email = user.email;
  const timeZone = await getTimeZone();
  const [profiles, categories, workspaces, canWrite] = await Promise.all([
    getProfiles(user.id, workspace.id),
    getCategories(workspace.id),
    getUserWorkspaces(user.id),
    canWriteInWorkspace(user.id, workspace.id),
  ]);

  return (
    <LoadingOverlayProvider>
    <div className="flex min-h-svh">
      <AppSidebar
        email={email}
        profiles={profiles}
        workspaces={workspaces}
        currentWorkspaceId={workspace.id}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          email={email}
          profiles={profiles}
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
      {/* Reports the browser's timezone so server-rendered times match the viewer's region. */}
      <TimezoneSync current={timeZone} />
      {/* App-wide keyboard shortcuts (nav, add, bulk add, focus search). */}
      <Suspense fallback={null}>
        <GlobalShortcuts
          categories={categories}
          profiles={profiles}
          currency={workspace.currency}
          locale={workspace.locale}
          today={todayISO(timeZone)}
          canWrite={canWrite}
        />
      </Suspense>
    </div>
    </LoadingOverlayProvider>
  );
}
