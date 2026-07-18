import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Signed in as {user.email ?? user.name ?? "unknown"}.
          </CardDescription>
        </CardHeader>
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

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Irreversible actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <DangerZone />
        </CardContent>
      </Card>
    </>
  );
}
