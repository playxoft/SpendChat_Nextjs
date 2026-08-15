import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { getAccountProfile, getProfiles } from "@/lib/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AccountProfileForm } from "@/components/app/account-profile-form";
import { AccountSecurityCard } from "@/components/app/account-security-card";
import { AccountSignOut } from "@/components/app/account-sign-out";
import { DangerZone } from "@/components/app/danger-zone";
import { WorkspaceCurrencyForm } from "@/components/app/workspace-currency-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account settings",
  robots: { index: false, follow: false },
};

export default async function AccountSettingsPage() {
  const { user, workspace } = await getAppContext();
  const isAdmin = workspace.role === "admin";
  const [profiles, account] = await Promise.all([
    getProfiles(user.id, workspace.id),
    getAccountProfile(user.id),
  ]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your name and picture across SpendChat.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountProfileForm
            initialName={account?.name ?? user.name}
            initialImage={account?.image ?? null}
            email={user.email}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Currency &amp; number format</CardTitle>
          <CardDescription>
            Applies to everyone in the “{workspace.name}” workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceCurrencyForm
            workspaceId={workspace.id}
            currency={workspace.currency}
            locale={workspace.locale}
            canEdit={isAdmin}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign-in &amp; password</CardTitle>
          <CardDescription>How you sign in, and your account password.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountSecurityCard email={user.email} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign out</CardTitle>
          <CardDescription>End your session on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountSignOut />
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Irreversible actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <DangerZone profiles={profiles.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))} />
        </CardContent>
      </Card>
    </>
  );
}
