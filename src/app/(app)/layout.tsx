import { getAppContext } from "@/lib/auth";
import { StackShell } from "@/components/stack-shell";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { BottomNav } from "@/components/app/bottom-nav";

// Auth + DB access — always rendered dynamically per request.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await getAppContext();
  const email = user.primaryEmail ?? null;

  return (
    <StackShell>
      <div className="flex min-h-svh">
        <AppSidebar email={email} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar email={email} />
          <main className="flex-1 pb-20 md:pb-0">{children}</main>
          <BottomNav />
        </div>
      </div>
    </StackShell>
  );
}
