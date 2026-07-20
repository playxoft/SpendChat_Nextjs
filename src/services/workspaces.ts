import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
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
import { ensureBootstrap, getCurrentWorkspace } from "@/lib/auth";
import { findUserByEmail, findUsersByIds } from "@/lib/directory";
import { escapeHtml, redactEmail, sendEmail } from "@/lib/email";
import { assertEmailSendAllowed } from "@/lib/email-quota";
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
  setInviteAccessSchema,
  setMemberAccessSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
  workspaceCurrencySchema,
  type AccessGrant,
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
  const { name, icon } = parseOrThrow(createWorkspaceSchema, input);
  await ensureBootstrap(userId);
  // A new workspace inherits the creator's current currency/number format, so a
  // non-USD user doesn't land on a USD workspace by default.
  const current = await getCurrentWorkspace(userId);
  const created = await createWorkspaceWithDefaults(userId, name, {
    makeCurrent: true,
    currency: current.currency,
    locale: current.locale,
    // Empty/omitted icon falls back to the default inside the helper.
    icon: icon || undefined,
  });
  logger.info("Workspace created", { event: "workspace.created", workspaceId: created.id, userId });
  return created;
}

/**
 * Update a workspace's currency + number format (locale). Admin-only, since it
 * changes how every member reads amounts in the workspace.
 */
export async function updateWorkspaceCurrency(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<{ currency: string; locale: string }> {
  const data = parseOrThrow(workspaceCurrencySchema, input);
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();
  const [row] = await db
    .update(workspaces)
    .set({ currency: data.currency, locale: data.locale, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning({ currency: workspaces.currency, locale: workspaces.locale });
  logger.info("Workspace currency updated", {
    event: "workspace.currency_updated",
    workspaceId,
    userId,
  });
  return row!;
}

/**
 * Update a workspace's display details — name and emoji icon. Admin-only. The
 * icon is only touched when the field is present (`undefined` leaves it as-is);
 * an empty string clears it back to null.
 */
export async function updateWorkspace(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<void> {
  const data = parseOrThrow(updateWorkspaceSchema, input);
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const patch: { name: string; icon?: string | null; updatedAt: Date } = {
    name: data.name,
    updatedAt: new Date(),
  };
  if (data.icon !== undefined) patch.icon = data.icon || null;
  const db = getDb();
  await db.update(workspaces).set(patch).where(eq(workspaces.id, workspaceId));
  logger.info("Workspace updated", { event: "workspace.updated", workspaceId, userId });
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

/** A person's resolved access — workspace-wide, or a set of profiles with roles. */
export type CollaboratorAccess =
  | { mode: "all"; role: WorkspaceRole }
  | {
      mode: "profiles";
      entries: {
        profileId: string;
        profileName: string;
        icon: string | null;
        role: WorkspaceRole;
      }[];
    };

export type CollaboratorRow = {
  userId: string;
  name: string | null;
  email: string | null;
  isOwner: boolean;
  access: CollaboratorAccess;
};

/**
 * Everyone with access to the workspace, one row per person (admin only). A
 * workspace member shows as `all`; anyone reachable only through per-profile
 * grants shows as `profiles` with each granted profile's role. Owner first.
 */
export async function listCollaborators(
  userId: string,
  workspaceId: string,
): Promise<CollaboratorRow[]> {
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();

  const [workspace, members, grants] = await Promise.all([
    db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
      columns: { ownerId: true },
    }),
    db
      .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(asc(workspaceMembers.createdAt)),
    db
      .select({
        userId: profileAccess.userId,
        role: profileAccess.role,
        profileId: profiles.id,
        profileName: profiles.name,
        icon: profiles.icon,
      })
      .from(profileAccess)
      .innerJoin(profiles, eq(profileAccess.profileId, profiles.id))
      .where(eq(profiles.workspaceId, workspaceId))
      .orderBy(asc(profiles.sortOrder), asc(profileAccess.createdAt)),
  ]);

  const memberIds = new Set(members.map((m) => m.userId));
  // Group per-profile grants by user, ignoring users who are workspace-wide
  // members (their membership already grants everything).
  const grantsByUser = new Map<string, CollaboratorAccess & { mode: "profiles" }>();
  for (const g of grants) {
    if (memberIds.has(g.userId)) continue;
    const entry = {
      profileId: g.profileId,
      profileName: g.profileName,
      icon: g.icon,
      role: g.role,
    };
    const cur = grantsByUser.get(g.userId);
    if (cur) cur.entries.push(entry);
    else grantsByUser.set(g.userId, { mode: "profiles", entries: [entry] });
  }

  const directory = await findUsersByIds([...memberIds, ...grantsByUser.keys()]);
  const named = (id: string) => ({
    name: directory.get(id)?.name ?? null,
    email: directory.get(id)?.email ?? null,
  });

  const rows: CollaboratorRow[] = [
    ...members.map((m) => ({
      userId: m.userId,
      ...named(m.userId),
      isOwner: m.userId === workspace?.ownerId,
      access: { mode: "all", role: m.role } as CollaboratorAccess,
    })),
    ...[...grantsByUser.entries()].map(([id, access]) => ({
      userId: id,
      ...named(id),
      isOwner: false, // the owner is always a member, handled above
      access,
    })),
  ];
  // Owner pinned to the top; the rest keep their query order (stable sort).
  rows.sort((a, b) => Number(b.isOwner) - Number(a.isOwner));
  return rows;
}

export type PendingInviteRow = { email: string; access: CollaboratorAccess };

/**
 * Pending invites grouped by email (admin only). Multiple invite rows for one
 * email collapse into a single editable entry; a workspace-wide (null-profile)
 * row wins over per-profile rows.
 */
export async function listPendingInvites(
  userId: string,
  workspaceId: string,
): Promise<PendingInviteRow[]> {
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();
  const rows = await db
    .select({
      email: workspaceInvites.email,
      role: workspaceInvites.role,
      profileId: workspaceInvites.profileId,
      profileName: profiles.name,
      icon: profiles.icon,
    })
    .from(workspaceInvites)
    .leftJoin(profiles, eq(workspaceInvites.profileId, profiles.id))
    .where(eq(workspaceInvites.workspaceId, workspaceId))
    .orderBy(asc(profiles.sortOrder), asc(workspaceInvites.createdAt));

  const byEmail = new Map<string, PendingInviteRow>();
  for (const r of rows) {
    const cur = byEmail.get(r.email);
    if (r.profileId === null) {
      byEmail.set(r.email, { email: r.email, access: { mode: "all", role: r.role } });
      continue;
    }
    if (cur?.access.mode === "all") continue; // workspace-wide invite wins
    const entry = {
      profileId: r.profileId,
      profileName: r.profileName ?? "a profile",
      icon: r.icon ?? null,
      role: r.role,
    };
    if (cur?.access.mode === "profiles") cur.access.entries.push(entry);
    else byEmail.set(r.email, { email: r.email, access: { mode: "profiles", entries: [entry] } });
  }
  return [...byEmail.values()];
}

/** What an access grant covers — resolved to profile names for the email copy. */
type AccessScopeDescription = { kind: "all" } | { kind: "profiles"; names: string[] };

/**
 * Validate that every profile in the grant belongs to the workspace and gather
 * their names (for the notification email). Throws before any email/quota is
 * burned so an invalid profile can't cost a send.
 */
async function describeAccessScope(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  access: AccessGrant,
): Promise<AccessScopeDescription> {
  if (access.mode === "all") return { kind: "all" };
  const ids = access.entries.map((e) => e.profileId);
  const rows = await db
    .select({ id: profiles.id, name: profiles.name })
    .from(profiles)
    .where(and(eq(profiles.workspaceId, workspaceId), inArray(profiles.id, ids)));
  if (rows.length !== new Set(ids).size) throw badRequest("Profile is not in this workspace");
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  return { kind: "profiles", names: ids.map((id) => byId.get(id) ?? "a profile") };
}

// Workspace/profile names are user-controlled — always `escapeHtml` them
// before interpolating into an HTML body (subjects are plain text, not HTML).
function scopeText(workspaceName: string, scope: AccessScopeDescription): string {
  const ws = escapeHtml(workspaceName);
  if (scope.kind === "all") return `the workspace "${ws}"`;
  if (scope.names.length === 1) return `the "${escapeHtml(scope.names[0]!)}" profile in "${ws}"`;
  const list = scope.names.map((n) => `"${escapeHtml(n)}"`).join(", ");
  return `${scope.names.length} profiles (${list}) in "${ws}"`;
}

/** Count-only summary safe for log messages (no profile names — user data). */
function accessLogSummary(access: AccessGrant): string {
  if (access.mode === "all") return "all profiles";
  return access.entries.length === 1 ? "1 profile" : `${access.entries.length} profiles`;
}

function invitationEmail(workspaceName: string, scope: AccessScopeDescription) {
  return {
    subject: `You've been invited to ${workspaceName} on ${siteConfig.name}`,
    html:
      `<p>You've been invited to ${scopeText(workspaceName, scope)} on <b>${siteConfig.name}</b>.</p>` +
      `<p><a href="${siteConfig.url}/sign-up">Create your account</a> with this email ` +
      `address and the workspace will be waiting for you.</p>`,
  };
}

function addedEmail(workspaceName: string, scope: AccessScopeDescription) {
  return {
    subject: `You now have access to ${workspaceName} on ${siteConfig.name}`,
    html:
      `<p>You've been given access to ${scopeText(workspaceName, scope)} on <b>${siteConfig.name}</b>.</p>` +
      `<p><a href="${siteConfig.url}/app">Open ${siteConfig.name}</a> and switch ` +
      `workspaces from the sidebar.</p>`,
  };
}

/**
 * Reconcile a *registered* user's access to exactly what `access` describes.
 * `all` → a workspace-wide membership (and drop any now-redundant per-profile
 * grants). `profiles` → per-profile grants at each entry's role, removing the
 * workspace membership and any grants for profiles no longer selected. The
 * caller is responsible for permission checks and the owner guard.
 */
async function applyMemberAccess(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  targetUserId: string,
  access: AccessGrant,
): Promise<void> {
  const wsProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.workspaceId, workspaceId));
  const wsProfileIds = wsProfiles.map((p) => p.id);

  if (access.mode === "all") {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId, userId: targetUserId, role: access.role })
      .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: { role: access.role, updatedAt: new Date() },
      });
    if (wsProfileIds.length > 0) {
      await db
        .delete(profileAccess)
        .where(
          and(
            eq(profileAccess.userId, targetUserId),
            inArray(profileAccess.profileId, wsProfileIds),
          ),
        );
    }
    return;
  }

  const allowed = new Set(wsProfileIds);
  for (const entry of access.entries) {
    if (!allowed.has(entry.profileId)) throw badRequest("Profile is not in this workspace");
  }
  // Per-profile access replaces any workspace-wide membership.
  await db
    .delete(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId)),
    );
  for (const entry of access.entries) {
    await db
      .insert(profileAccess)
      .values({ profileId: entry.profileId, userId: targetUserId, role: entry.role })
      .onConflictDoUpdate({
        target: [profileAccess.profileId, profileAccess.userId],
        set: { role: entry.role, updatedAt: new Date() },
      });
  }
  const selected = new Set(access.entries.map((e) => e.profileId));
  const toRemove = wsProfileIds.filter((id) => !selected.has(id));
  if (toRemove.length > 0) {
    await db
      .delete(profileAccess)
      .where(
        and(eq(profileAccess.userId, targetUserId), inArray(profileAccess.profileId, toRemove)),
      );
  }
}

/**
 * Reconcile the pending-invite rows for `email` to match `access`: one
 * workspace-wide row (`all`) or one row per profile (`profiles`). Replaces the
 * whole set for that email so editing an invite never leaves stale rows.
 */
async function applyInviteAccess(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  email: string,
  access: AccessGrant,
  invitedBy: string,
): Promise<void> {
  await db
    .delete(workspaceInvites)
    .where(and(eq(workspaceInvites.workspaceId, workspaceId), eq(workspaceInvites.email, email)));

  if (access.mode === "all") {
    await db
      .insert(workspaceInvites)
      .values({ workspaceId, email, role: access.role, profileId: null, invitedBy });
    return;
  }

  const wsProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.workspaceId, workspaceId));
  const allowed = new Set(wsProfiles.map((p) => p.id));
  for (const entry of access.entries) {
    if (!allowed.has(entry.profileId)) throw badRequest("Profile is not in this workspace");
  }
  await db.insert(workspaceInvites).values(
    access.entries.map((entry) => ({
      workspaceId,
      email,
      role: entry.role,
      profileId: entry.profileId,
      invitedBy,
    })),
  );
}

/** Cap invite emails at the shared per-user hourly budget (`email-quota.ts`). */
function assertInviteEmailAllowed(userId: string): Promise<void> {
  return assertEmailSendAllowed(
    userId,
    "member_invite",
    "Too many invites in the last hour — try again later",
  );
}

export type AddMemberResult = { status: "added" | "invited"; email: string };

/**
 * Give someone access — workspace-wide (`all`) or to a chosen set of profiles,
 * each at its own role. A registered email gets access immediately (plus one
 * notification email); an unknown email gets invite rows that convert to access
 * at their first sign-in. Managing members requires workspace admin.
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

  await requireWorkspaceRole(userId, workspaceId, "admin");

  // Validate the scope (and get profile names for the email) before touching quota.
  const scope = await describeAccessScope(db, workspaceId, data.access);

  // Both branches below send an email to a caller-chosen address.
  await assertInviteEmailAllowed(userId);

  const existing = await findUserByEmail(data.email);
  if (existing) {
    if (existing.id === userId) throw badRequest("That's you — you already have access");
    if (existing.id === workspace.ownerId) {
      throw badRequest("The workspace owner already has full access");
    }
    await applyMemberAccess(db, workspaceId, existing.id, data.access);
    sendEmail({ to: data.email, ...addedEmail(workspace.name, scope) });
    logger.info(`Workspace member added (${accessLogSummary(data.access)})`, {
      event: "workspace.member_added",
      workspaceId,
      userId,
      memberId: existing.id,
      mode: data.access.mode,
    });
    return { status: "added", email: data.email };
  }

  await applyInviteAccess(db, workspaceId, data.email, data.access, userId);
  sendEmail({ to: data.email, ...invitationEmail(workspace.name, scope) });
  logger.info(`Workspace invite sent to ${redactEmail(data.email)} (${accessLogSummary(data.access)})`, {
    event: "workspace.invite_sent",
    workspaceId,
    userId,
    email: redactEmail(data.email),
    mode: data.access.mode,
  });
  return { status: "invited", email: data.email };
}

/** Re-scope a registered member's access (admin). The owner can't be re-scoped. */
export async function setMemberAccess(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<void> {
  const data = parseOrThrow(setMemberAccessSchema, input);
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { ownerId: true },
  });
  if (!workspace) throw notFound("Workspace not found");
  if (data.userId === workspace.ownerId) {
    throw conflict("The workspace owner always has full access");
  }
  await applyMemberAccess(db, workspaceId, data.userId, data.access);
  logger.info(`Member access updated (${accessLogSummary(data.access)})`, {
    event: "workspace.member_access_updated",
    workspaceId,
    userId,
    memberId: data.userId,
    mode: data.access.mode,
  });
}

/** Re-scope a pending invite by email (admin). */
export async function setInviteAccess(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<void> {
  const data = parseOrThrow(setInviteAccessSchema, input);
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { id: true },
  });
  if (!workspace) throw notFound("Workspace not found");
  await applyInviteAccess(db, workspaceId, data.email, data.access, userId);
  logger.info(
    `Invite access updated for ${redactEmail(data.email)} (${accessLogSummary(data.access)})`,
    {
      event: "workspace.invite_access_updated",
      workspaceId,
      userId,
      email: redactEmail(data.email),
      mode: data.access.mode,
    },
  );
}

/**
 * Remove a collaborator entirely (admin), or leave yourself — drops both their
 * workspace membership and every per-profile grant in the workspace. The owner
 * can never be removed.
 */
export async function removeCollaborator(
  userId: string,
  workspaceId: string,
  targetUserId: string,
): Promise<void> {
  if (targetUserId !== userId) {
    await requireWorkspaceRole(userId, workspaceId, "admin");
  }
  const db = getDb();
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { ownerId: true },
  });
  if (!workspace) throw notFound("Workspace not found");
  if (targetUserId === workspace.ownerId) {
    throw forbidden("The workspace owner can't be removed");
  }

  await db
    .delete(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId)),
    );
  await db.delete(profileAccess).where(
    and(
      eq(profileAccess.userId, targetUserId),
      inArray(
        profileAccess.profileId,
        db.select({ id: profiles.id }).from(profiles).where(eq(profiles.workspaceId, workspaceId)),
      ),
    ),
  );
  // Don't leave them staring at a workspace they can no longer open.
  await db
    .update(userSettings)
    .set({ lastWorkspaceId: null, updatedAt: new Date() })
    .where(
      and(eq(userSettings.userId, targetUserId), eq(userSettings.lastWorkspaceId, workspaceId)),
    );
  logger.info(targetUserId === userId ? "Collaborator left workspace" : "Collaborator removed", {
    event: "workspace.collaborator_removed",
    workspaceId,
    userId,
    memberId: targetUserId,
  });
}

/** Cancel every pending invite row for an email (admin). */
export async function cancelInviteByEmail(
  userId: string,
  workspaceId: string,
  email: string,
): Promise<void> {
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const normalized = email.trim().toLowerCase();
  await getDb()
    .delete(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspaceId),
        eq(workspaceInvites.email, normalized),
      ),
    );
  logger.info("Workspace invite cancelled", {
    event: "workspace.invite_cancelled",
    workspaceId,
    userId,
    email: redactEmail(normalized),
  });
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
  logger.info(`Workspace member role changed to ${data.role}`, {
    event: "workspace.member_role_changed",
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
  logger.info(memberId === userId ? "Workspace member left" : "Workspace member removed", {
    event: "workspace.member_removed",
    workspaceId,
    userId,
    memberId,
  });
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
  logger.info("Workspace invite cancelled", {
    event: "workspace.invite_cancelled",
    workspaceId: invite.workspaceId,
    userId,
    inviteId,
  });
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
  logger.info("Profile access removed for member", {
    event: "workspace.profile_access_removed",
    profileId,
    userId,
    memberId: targetUserId,
  });
}
