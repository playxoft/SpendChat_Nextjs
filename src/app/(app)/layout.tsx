import { Suspense } from "react";
import { getAppContext, getUserSettings } from "@/lib/auth";
import { getCategories, getProfiles } from "@/lib/queries";
import { todayISO } from "@/lib/dates";
import { getTimeZone } from "@/lib/timezone.server";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { BottomNav } from "@/components/app/bottom-nav";
import { GlobalShortcuts } from "@/components/app/global-shortcuts";
import { TimezoneSync } from "@/components/app/timezone-sync";

// Auth + DB access — always rendered dynamically per request.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await getAppContext();
  const email = user.email;
  const timeZone = await getTimeZone();
  const [profiles, categories, settings] = await Promise.all([
    getProfiles(user.id),
    getCategories(user.id),
    getUserSettings(user.id),
  ]);

  return (
    <div className="flex min-h-svh">
      <AppSidebar email={email} profiles={profiles} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar email={email} profiles={profiles} />
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <BottomNav />
      </div>
      {/* Reports the browser's timezone so server-rendered times match the viewer's region. */}
      <TimezoneSync current={timeZone} />
      {/* App-wide keyboard shortcuts (nav, add, bulk add, focus search). */}
      <Suspense fallback={null}>
        <GlobalShortcuts
          categories={categories}
          profiles={profiles}
          currency={settings.currency}
          today={todayISO(timeZone)}
        />
      </Suspense>
    </div>
  );
}
