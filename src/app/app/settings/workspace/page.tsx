import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { getUsage } from "@/lib/entitlements";
import { getProfiles } from "@/lib/queries";
import { listSpaces } from "@/services/spaces";
import {
  listCollaborators,
  listMembers,
  listPendingInvites,
  type CollaboratorAccess,
  type CollaboratorRow,
} from "@/services/workspaces";
import { WorkspaceSettings } from "@/components/app/workspace-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Workspace settings",
  robots: { index: false, follow: false },
};

/** Drop the display-only profile name/icon — the client looks those up from `profiles`. */
function leanAccess(a: CollaboratorAccess) {
  return a.mode === "all"
    ? {
        mode: "all" as const,
        role: a.role,
        // A non-admin's spaces (admins see every space; absent for a non-admin viewer's list).
        ...(a.spaceIds !== undefined ? { spaceIds: a.spaceIds } : {}),
      }
    : {
        mode: "profiles" as const,
        entries: a.entries.map((e) => ({ profileId: e.profileId, role: e.role })),
      };
}

export default async function WorkspaceSettingsPage() {
  const { user, workspace } = await getAppContext();
  const isMember = workspace.role !== null;
  const isAdmin = workspace.role === "admin";

  const [profiles, spaces, usage] = await Promise.all([
    getProfiles(user.id, workspace.id),
    listSpaces(user.id, workspace.id),
    // The plan & usage card — every member sees it, since the limits are shared.
    getUsage(workspace.id),
  ]);

  // Admins see everyone (workspace-wide + per-profile) and pending invites.
  // A plain member only sees the workspace-wide member list, no invites.
  const collaborators: CollaboratorRow[] = isAdmin
    ? await listCollaborators(user.id, workspace.id)
    : isMember
      ? (await listMembers(user.id, workspace.id)).map((m) => ({
          userId: m.userId,
          name: m.name,
          email: m.email,
          isOwner: m.isOwner,
          access: { mode: "all", role: m.role },
        }))
      : [];
  const invites = isAdmin ? await listPendingInvites(user.id, workspace.id) : [];

  return (
    <WorkspaceSettings
      workspace={{
        id: workspace.id,
        name: workspace.name,
        icon: workspace.icon,
        role: workspace.role,
      }}
      currentUserId={user.id}
      collaborators={collaborators.map((c) => ({
        userId: c.userId,
        name: c.name,
        email: c.email,
        isOwner: c.isOwner,
        access: leanAccess(c.access),
      }))}
      invites={invites.map((i) => ({ email: i.email, access: leanAccess(i.access) }))}
      spaces={spaces.map((s) => ({ id: s.id, name: s.name, icon: s.icon }))}
      profiles={profiles.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))}
      usage={{
        plan: usage.plan,
        readOnly: usage.readOnly,
        ai: {
          used: usage.ai.used,
          limit: usage.ai.limit,
          remaining: usage.ai.remaining,
          resetsAt: usage.ai.resetsAt,
        },
        storage: usage.storage,
        members: usage.members,
        spaces: usage.spaces,
        categories: usage.categories,
        tags: usage.tags,
        profilesPerSpace: usage.profilesPerSpace,
        voice: usage.voice,
      }}
    />
  );
}
