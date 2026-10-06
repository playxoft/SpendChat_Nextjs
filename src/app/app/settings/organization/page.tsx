import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { getMyOrganization } from "@/services/organizations";
import { OrganizationSettings } from "@/components/app/organization-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Organisation settings",
  robots: { index: false, follow: false },
};

export default async function OrganizationSettingsPage() {
  const { user, workspace } = await getAppContext();
  const org = await getMyOrganization(user.id);

  return (
    <OrganizationSettings
      organization={{
        id: org.id,
        name: org.name,
        owner: org.owner,
        workspaces: org.workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          icon: w.icon,
          plan: w.plan,
          grandfathered: w.grandfathered,
          readOnly: w.readOnly,
          canOpen: w.canOpen,
        })),
      }}
      currentWorkspaceId={workspace.id}
    />
  );
}
