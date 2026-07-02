import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  profileAccess,
  profiles,
  userSettings,
  workspaceInvites,
  workspaceMembers,
  workspaces,
  type WorkspaceInvite,
  type WorkspaceRole,
} from "@/db/schema";
import { ensureBootstrap } from "@/lib/auth";
import { findUserByEmail, findUsersByIds } from "@/lib/directory";
import { sendEmail } from "@/lib/email";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { parseOrThrow } from "@/lib/api-response";
import {
  createWorkspaceWithDefaults,
  getWorkspaceRole,
  listUserWorkspaces,
  requireProfileRole,
  requireWorkspaceRole,
  type WorkspaceSummary,
} from "@/lib/workspaces";
import {
  addMemberSchema,
  createWorkspaceSchema,
  updateMemberRoleSchema,
  workspaceNameSchema,
} from "@/lib/validation";
import { siteConfig } from "@/lib/site";

/**
 * Workspace management: create/rename/switch, members, per-profile grants,
 * and email invites (ZeptoMail). Admin-gated except switching and leaving.
 */

export type MemberRow = {
  userId: string;
  role: WorkspaceRole;
  name: string | null;
  email: string | null;
  isOwner: boolean;
};

export async function listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  await ensureBootstrap(userId);
  return listUserWorkspaces(userId);
}

export async function createWorkspace(userId: string, input: unknown): Promise<WorkspaceSummary> {
  const { name } = parseOrThrow(createWorkspaceSchema, input);
  await ensureBootstrap(userId);
  const created = await createWorkspaceWithDefaults(userId, name, { makeCurrent: true });
  logger.info("workspace.created", { workspaceId: created.id, userId });
  return created;
}

export async function renameWorkspace(
  userId: string,
  workspaceId: string,
  name: unknown,
): Promise<void> {
  const parsed = parseOrThrow(workspaceNameSchema, name);
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();
  await db
    .update(workspaces)
    .set({ name: parsed, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
  logger.info("workspace.renamed", { workspaceId, userId });
}

/** Point the user's session at another workspace they can access. */
export async function switchWorkspace(userId: string, workspaceId: string): Promise<void> {
  await ensureBootstrap(userId);
  const list = await listUserWorkspaces(userId);
  if (!list.some((w) => w.id === workspaceId)) throw notFound("Workspace not found");
  const db = getDb();
  await db
    .update(userSettings)
    .set({ lastWorkspaceId: workspaceId, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
}

/** Members with directory names/emails; any member may look. */
export async function listMembers(userId: string, workspaceId: string): Promise<MemberRow[]> {
  const role = await getWorkspaceRole(userId, workspaceId);
  if (!role) throw notFound("Workspace not found");
  const db = getDb();

  const [workspace, members] = await Promise.all([
    db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
      columns: { ownerId: true },
    }),
    db
      .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(asc(workspaceMembers.createdAt)),
  ]);
  const directory = await findUsersByIds(members.map((m) => m.userId));

  return members.map((m) => ({
    userId: m.userId,
    role: m.role,
    name: directory.get(m.userId)?.name ?? null,
    email: directory.get(m.userId)?.email ?? null,
    isOwner: m.userId === workspace?.ownerId,
  }));
}

/** Pending email invites (admin only). */
export async function listInvites(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceInvite[]> {
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();
  return db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.workspaceId, workspaceId))
    .orderBy(asc(workspaceInvites.createdAt));
}

function invitationEmail(workspaceName: string, role: WorkspaceRole, profileName?: string) {
  const scope = profileName
    ? `the "${profileName}" profile in the workspace "${workspaceName}"`
    : `the workspace "${workspaceName}"`;
  return {
    subject: `You've been invited to ${workspaceName} on ${siteConfig.name}`,
    html:
      `<p>You've been invited to ${scope} on <b>${siteConfig.name}</b> as ${role}.</p>` +
      `<p><a href="${siteConfig.url}/sign-up">Create your account</a> with this email ` +
      `address and the workspace will be waiting for you.</p>`,
  };
}

function addedEmail(workspaceName: string, role: WorkspaceRole, profileName?: string) {
  const scope = profileName
    ? `the "${profileName}" profile in "${workspaceName}"`
    : `the workspace "${workspaceName}"`;
  return {
    subject: `You now have access to ${workspaceName} on ${siteConfig.name}`,
    html:
      `<p>You've been given ${role} access to ${scope} on <b>${siteConfig.name}</b>.</p>` +
      `<p><a href="${siteConfig.url}/app">Open ${siteConfig.name}</a> and switch ` +
      `workspaces from the sidebar.</p>`,
  };
}

export type AddMemberResult = { status: "added" | "invited"; email: string };

/**
 * Give someone access — workspace-wide, or to a single profile when
 * `profileId` is set. A registered email gets access immediately (plus a
 * notification email); an unknown email gets an invite row that converts to
 * access at their first sign-in.
 */
export async function addMember(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<AddMemberResult> {
  const data = parseOrThrow(addMemberSchema, input);
  const db = getDb();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  if (!workspace) throw notFound("Workspace not found");

  let profileName: string | undefined;
  if (data.profileId) {
    // Per-profile grant: admin on that profile is enough.
    const access = await requireProfileRole(userId, data.profileId, "admin");
    if (access.workspaceId !== workspaceId) throw badRequest("Profile is not in this workspace");
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, data.profileId),
      columns: { name: true },
    });
    profileName = profile?.name;
  } else {
    await requireWorkspaceRole(userId, workspaceId, "admin");
  }

  const existing = await findUserByEmail(data.email);
  if (existing) {
    if (existing.id === userId) throw badRequest("That's you — you already have access");
    if (data.profileId) {
      await db
        .insert(profileAccess)
        .values({ profileId: data.profileId, userId: existing.id, role: data.role })
        .onConflictDoUpdate({
          target: [profileAccess.profileId, profileAccess.userId],
          set: { role: data.role, updatedAt: new Date() },
        });
    } else {
      await db
        .insert(workspaceMembers)
        .values({ workspaceId, userId: existing.id, role: data.role })
        .onConflictDoUpdate({
          target: [workspaceMembers.workspaceId, workspaceMembers.userId],
          set: { role: data.role, updatedAt: new Date() },
        });
    }
    sendEmail({ to: data.email, ...addedEmail(workspace.name, data.role, profileName) });
    logger.info("workspace.member_added", {
      workspaceId,
      userId,
      memberId: existing.id,
      role: data.role,
      profileId: data.profileId ?? null,
    });
    return { status: "added", email: data.email };
  }

  await db
    .insert(workspaceInvites)
    .values({
      workspaceId,
      email: data.email,
      role: data.role,
      profileId: data.profileId ?? null,
      invitedBy: userId,
    })
    .onConflictDoNothing();
  sendEmail({ to: data.email, ...invitationEmail(workspace.name, data.role, profileName) });
  logger.info("workspace.invite_sent", {
    workspaceId,
    userId,
    email: data.email,
    role: data.role,
    profileId: data.profileId ?? null,
  });
  return { status: "invited", email: data.email };
}

export async function updateMemberRole(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<void> {
  const data = parseOrThrow(updateMemberRoleSchema, input);
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { ownerId: true },
  });
  if (data.userId === workspace?.ownerId) {
    throw conflict("The workspace owner is always an admin");
  }

  const updated = await db
    .update(workspaceMembers)
    .set({ role: data.role, updatedAt: new Date() })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, data.userId),
      ),
    )
    .returning({ userId: workspaceMembers.userId });
  if (updated.length === 0) throw notFound("Member not found");
  logger.info("workspace.member_role_changed", {
    workspaceId,
    userId,
    memberId: data.userId,
    role: data.role,
  });
}

/** Remove a member (admin), or leave yourself. The owner can never be removed. */
export async function removeMember(
  userId: string,
  workspaceId: string,
  memberId: string,
): Promise<void> {
  if (memberId !== userId) {
    await requireWorkspaceRole(userId, workspaceId, "admin");
  }
  const db = getDb();
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { ownerId: true },
  });
  if (!workspace) throw notFound("Workspace not found");
  if (memberId === workspace.ownerId) {
    throw forbidden("The workspace owner can't be removed");
  }

  const removed = await db
    .delete(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberId)),
    )
    .returning({ userId: workspaceMembers.userId });
  if (removed.length === 0) throw notFound("Member not found");

  // Don't leave them staring at a workspace they can no longer open.
  await db
    .update(userSettings)
    .set({ lastWorkspaceId: null, updatedAt: new Date() })
    .where(
      and(eq(userSettings.userId, memberId), eq(userSettings.lastWorkspaceId, workspaceId)),
    );
  logger.info("workspace.member_removed", { workspaceId, userId, memberId });
}

/** Revoke a pending invite (admin). */
export async function cancelInvite(userId: string, inviteId: string): Promise<void> {
  const db = getDb();
  const invite = await db.query.workspaceInvites.findFirst({
    where: eq(workspaceInvites.id, inviteId),
  });
  if (!invite) throw notFound("Invite not found");
  await requireWorkspaceRole(userId, invite.workspaceId, "admin");
  await db.delete(workspaceInvites).where(eq(workspaceInvites.id, inviteId));
  logger.info("workspace.invite_cancelled", { workspaceId: invite.workspaceId, userId, inviteId });
}

export type ProfileGrantRow = {
  profileId: string;
  profileName: string;
  userId: string;
  role: WorkspaceRole;
  name: string | null;
  email: string | null;
};

/** Every per-profile grant in the workspace, for the admin sharing UI. */
export async function listWorkspaceProfileGrants(
  userId: string,
  workspaceId: string,
): Promise<ProfileGrantRow[]> {
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();
  const rows = await db
    .select({
      profileId: profileAccess.profileId,
      profileName: profiles.name,
      userId: profileAccess.userId,
      role: profileAccess.role,
    })
    .from(profileAccess)
    .innerJoin(profiles, eq(profileAccess.profileId, profiles.id))
    .where(eq(profiles.workspaceId, workspaceId))
    .orderBy(asc(profiles.sortOrder), asc(profileAccess.createdAt));
  const directory = await findUsersByIds(rows.map((r) => r.userId));
  return rows.map((r) => ({
    ...r,
    name: directory.get(r.userId)?.name ?? null,
    email: directory.get(r.userId)?.email ?? null,
  }));
}

/** Per-profile grants for one profile, with directory info (profile admin). */
export async function listProfileAccess(userId: string, profileId: string) {
  await requireProfileRole(userId, profileId, "admin");
  const db = getDb();
  const rows = await db
    .select({ userId: profileAccess.userId, role: profileAccess.role })
    .from(profileAccess)
    .where(eq(profileAccess.profileId, profileId))
    .orderBy(asc(profileAccess.createdAt));
  const directory = await findUsersByIds(rows.map((r) => r.userId));
  return rows.map((r) => ({
    ...r,
    name: directory.get(r.userId)?.name ?? null,
    email: directory.get(r.userId)?.email ?? null,
  }));
}

/** Revoke a per-profile grant (profile admin). */
export async function removeProfileAccess(
  userId: string,
  profileId: string,
  targetUserId: string,
): Promise<void> {
  await requireProfileRole(userId, profileId, "admin");
  const removed = await getDb()
    .delete(profileAccess)
    .where(
      and(eq(profileAccess.profileId, profileId), eq(profileAccess.userId, targetUserId)),
    )
    .returning({ userId: profileAccess.userId });
  if (removed.length === 0) throw notFound("Access not found");
  logger.info("workspace.profile_access_removed", { profileId, userId, memberId: targetUserId });
}
