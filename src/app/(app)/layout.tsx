import { getAppContext } from "@/lib/auth";
import { getProfiles } from "@/lib/queries";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { BottomNav } from "@/components/app/bottom-nav";

// Auth + DB access — always rendered dynamically per request.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await getAppContext();
  const email = user.email;
  const profiles = await getProfiles(user.id);

  return (
    <div className="flex min-h-svh">
      <AppSidebar email={email} profiles={profiles} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar email={email} profiles={profiles} />
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
