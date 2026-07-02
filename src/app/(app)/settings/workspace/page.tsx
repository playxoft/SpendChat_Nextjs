import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { getProfiles } from "@/lib/queries";
import {
  listInvites,
  listMembers,
  listWorkspaceProfileGrants,
  type MemberRow,
  type ProfileGrantRow,
} from "@/services/workspaces";
import type { WorkspaceInvite } from "@/db/schema";
import { WorkspaceSettings } from "@/components/app/workspace-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Workspace settings",
  robots: { index: false, follow: false },
};

export default async function WorkspaceSettingsPage() {
  const { user, workspace } = await getAppContext();
  const isMember = workspace.role !== null;
  const isAdmin = workspace.role === "admin";

  const profiles = await getProfiles(user.id, workspace.id);
  const members: MemberRow[] = isMember ? await listMembers(user.id, workspace.id) : [];
  const [invites, grants]: [WorkspaceInvite[], ProfileGrantRow[]] = isAdmin
    ? await Promise.all([
        listInvites(user.id, workspace.id),
        listWorkspaceProfileGrants(user.id, workspace.id),
      ])
    : [[], []];

  return (
    <WorkspaceSettings
      workspace={{ id: workspace.id, name: workspace.name, role: workspace.role }}
      currentUserId={user.id}
      members={members}
      invites={invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        profileName: i.profileId
          ? (profiles.find((p) => p.id === i.profileId)?.name ?? "a profile")
          : null,
      }))}
      grants={grants}
      profiles={profiles.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))}
    />
  );
}
