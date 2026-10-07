import "server-only";
import { and, asc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  aiChats,
  profileAccess,
  profileOverrides,
  profiles,
  spaceMembers,
  spaces,
  userSettings,
  workspaceInvites,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "@/db/schema";
import { ensureBootstrap, getCurrentWorkspace, type SessionUser } from "@/lib/auth";
import { findUserByEmail, findUserById, findUsersByIds } from "@/lib/directory";
import { redactEmail, sendEmail } from "@/lib/email";
import { inviteEmail, siteUrl, type InviteScope } from "@/lib/email-templates";
import { assertEmailSendAllowed } from "@/lib/email-quota";
import {
  assertCanAddMember,
  assertCanCreateFreeWorkspace,
  assertProfileLevelAccess,
  assertWorkspaceWritable,
} from "@/lib/entitlements";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { generateInviteToken, invitePath, openWorkspacePath } from "@/lib/invite-links";
import { atLeastRole } from "@/lib/rbac";
import { logger } from "@/lib/logger";
import { parseOrThrow } from "@/lib/api-response";
import {
  convertInvites,
  convertibleInviteColumns,
  createWorkspaceWithDefaults,
  getWorkspaceRole,
  listUserWorkspaces,
  requireProfileRole,
  requireWorkspaceRole,
  type WorkspaceSummary,
} from "@/lib/workspaces";
import { notTrashed } from "@/lib/trash-scope";
import {
  addMemberSchema,
  createWorkspaceSchema,
  inviteTokenSchema,
  setInviteAccessSchema,
  setMemberAccessSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
  workspaceCurrencySchema,
  type AccessGrant,
} from "@/lib/validation";

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
  // One free workspace per person (abuse rule C5); more need a paid plan each.
  await assertCanCreateFreeWorkspace(userId);
  // A new workspace inherits the creator's current currency/number format, so a
  // non-USD user doesn't land on a USD workspace by default.
  const current = await getCurrentWorkspace(userId);
  const created = await createWorkspaceWithDefaults(userId, name, {
    makeCurrent: true,
    requireNoFreeWorkspace: true,
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

/** A person's resolved access — workspace-wide, or a set of profiles with roles. */
export type CollaboratorAccess =
  /** A workspace member. `spaceIds`: the spaces a non-admin is in (admins see all). */
  | { mode: "all"; role: WorkspaceRole; spaceIds?: string[] }
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

  const [workspace, members, memberSpaces, grants] = await Promise.all([
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
      .select({ userId: spaceMembers.userId, spaceId: spaceMembers.spaceId })
      .from(spaceMembers)
      .innerJoin(spaces, eq(spaceMembers.spaceId, spaces.id))
      .where(eq(spaces.workspaceId, workspaceId))
      .orderBy(asc(spaces.position), asc(spaces.createdAt)),
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
      // Grants on live profiles: one on a trashed profile opens nothing today.
      .where(and(eq(profiles.workspaceId, workspaceId), notTrashed(profiles)))
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

  const spacesByUser = new Map<string, string[]>();
  for (const r of memberSpaces) {
    const list = spacesByUser.get(r.userId);
    if (list) list.push(r.spaceId);
    else spacesByUser.set(r.userId, [r.spaceId]);
  }

  const rows: CollaboratorRow[] = [
    ...members.map((m) => ({
      userId: m.userId,
      ...named(m.userId),
      isOwner: m.userId === workspace?.ownerId,
      access: (m.role === "admin"
        ? { mode: "all", role: m.role }
        : { mode: "all", role: m.role, spaceIds: spacesByUser.get(m.userId) ?? [] }) as CollaboratorAccess,
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
      spaceIds: workspaceInvites.spaceIds,
      profileName: profiles.name,
      icon: profiles.icon,
    })
    .from(workspaceInvites)
    // trash: display join — a pending invite to a trashed profile is still a
    // pending invite (it counts toward members until withdrawn).
    .leftJoin(profiles, eq(workspaceInvites.profileId, profiles.id))
    .where(eq(workspaceInvites.workspaceId, workspaceId))
    .orderBy(asc(profiles.sortOrder), asc(workspaceInvites.createdAt));

  const byEmail = new Map<string, PendingInviteRow>();
  for (const r of rows) {
    const cur = byEmail.get(r.email);
    if (r.profileId === null) {
      byEmail.set(r.email, {
        email: r.email,
        access:
          r.role === "admin" || r.spaceIds === null
            ? { mode: "all", role: r.role }
            : { mode: "all", role: r.role, spaceIds: r.spaceIds },
      });
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

/**
 * Validate that every profile in the grant belongs to the workspace and gather
 * their names + roles for the email copy. Throws before any email/quota is
 * burned so an invalid profile can't cost a send.
 */
async function describeAccessScope(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  access: AccessGrant,
): Promise<InviteScope> {
  if (access.mode === "all") {
    if (access.role === "admin") return { kind: "all", role: access.role };
    // Checked here, with the profiles below, so a stale space id costs an
    // error message before any invite email (or its hourly quota) is spent.
    const ids = await resolveGrantSpaces(db, workspaceId, access.spaceIds);
    return { kind: "all", role: access.role, spaces: await spaceNamesUnlessAll(db, workspaceId, ids) };
  }
  const ids = access.entries.map((e) => e.profileId);
  const rows = await db
    .select({ id: profiles.id, name: profiles.name })
    .from(profiles)
    .where(and(eq(profiles.workspaceId, workspaceId), notTrashed(profiles), inArray(profiles.id, ids)));
  if (rows.length !== new Set(ids).size) throw badRequest("Profile is not in this workspace");
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  return {
    kind: "profiles",
    entries: access.entries.map((e) => ({
      name: byId.get(e.profileId) ?? "a profile",
      role: e.role,
    })),
  };
}

/**
 * The names of `spaceIds`, in sidebar order — or undefined when they are every
 * space in the workspace, which the copy calls "all profiles". An invite to one
 * space must never read as access to everything.
 */
async function spaceNamesUnlessAll(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  spaceIds: string[],
): Promise<string[] | undefined> {
  const all = await db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaces)
    .where(eq(spaces.workspaceId, workspaceId))
    .orderBy(asc(spaces.position), asc(spaces.createdAt));
  const chosen = new Set(spaceIds);
  if (all.every((sp) => chosen.has(sp.id))) return undefined;
  return all.filter((sp) => chosen.has(sp.id)).map((sp) => sp.name);
}

/**
 * Whether per-profile `next` only takes access away from `existing`: every
 * entry is a profile they already have, at the same or a lower role. Such a
 * change needs no plan feature.
 */
function onlyNarrows(
  existing: { profileId: string; role: WorkspaceRole }[],
  next: { profileId: string; role: WorkspaceRole }[],
): boolean {
  const had = new Map(existing.map((e) => [e.profileId, e.role]));
  return next.every((e) => {
    const before = had.get(e.profileId);
    return before !== undefined && atLeastRole(before, e.role);
  });
}

/** Count-only summary safe for log messages (no profile names — user data). */
function accessLogSummary(access: AccessGrant): string {
  if (access.mode === "all") return "all profiles";
  return access.entries.length === 1 ? "1 profile" : `${access.entries.length} profiles`;
}

/**
 * The space ids an `all` grant puts a non-admin into: the listed ones (checked
 * to belong to this workspace), or every space when the grant names none.
 * Throws before anything is written, so a stale id costs an error message
 * rather than half-applied access.
 */
async function resolveGrantSpaces(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  spaceIds: string[] | undefined,
): Promise<string[]> {
  const all = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(eq(spaces.workspaceId, workspaceId))
    .orderBy(asc(spaces.position), asc(spaces.createdAt));
  if (spaceIds === undefined) return all.map((r) => r.id);
  const allowed = new Set(all.map((r) => r.id));
  for (const id of spaceIds) {
    if (!allowed.has(id)) throw badRequest("Space is not in this workspace");
  }
  return spaceIds;
}

/**
 * Remove a person's space memberships and per-profile overrides in one
 * workspace — what leaving the workspace (or dropping to per-profile grants)
 * must take with it, so a stale row can never grant access later.
 */
async function clearSpaceAccess(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  targetUserId: string,
): Promise<void> {
  await db
    .delete(spaceMembers)
    .where(
      and(
        eq(spaceMembers.userId, targetUserId),
        inArray(
          spaceMembers.spaceId,
          db.select({ id: spaces.id }).from(spaces).where(eq(spaces.workspaceId, workspaceId)),
        ),
      ),
    );
  await db
    .delete(profileOverrides)
    .where(
      and(
        eq(profileOverrides.userId, targetUserId),
        inArray(
          profileOverrides.profileId,
          // trash: every profile, trashed too — a restore must not bring back
          // access someone lost while it was in the trash.
          db.select({ id: profiles.id }).from(profiles).where(eq(profiles.workspaceId, workspaceId)),
        ),
      ),
    );
}

/**
 * Put a workspace member into exactly `spaceIds` at `role` (viewer/editor),
 * removing them from the workspace's other spaces. The role is applied to every
 * listed space — the members list edits "role + which spaces" as one setting;
 * per-space differences are made in the space's own dialog.
 */
async function setMemberSpaces(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  targetUserId: string,
  role: "viewer" | "editor",
  spaceIds: string[],
): Promise<void> {
  const wsSpaces = db
    .select({ id: spaces.id })
    .from(spaces)
    .where(eq(spaces.workspaceId, workspaceId));
  // Leaving a space takes its opening overrides (read/write) with it, as it
  // does from the space's own dialog (`setSpaceMember`): otherwise a `write`
  // override on one of its profiles would keep that profile open — and on Free
  // nobody could change it. Overrides in spaces they were never in (deliberate
  // one-profile openings) are left alone.
  const leaving = await db
    .select({ spaceId: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(
      and(
        eq(spaceMembers.userId, targetUserId),
        inArray(spaceMembers.spaceId, wsSpaces),
        spaceIds.length > 0 ? notInArray(spaceMembers.spaceId, spaceIds) : undefined,
      ),
    );
  if (leaving.length > 0) {
    await db.delete(profileOverrides).where(
      and(
        eq(profileOverrides.userId, targetUserId),
        // Only the overrides that *open* something. A `none` stays: it may be
        // what's hiding a profile from a legacy single-profile grant, and
        // deleting it would widen access on the way out.
        inArray(profileOverrides.access, ["read", "write"]),
        inArray(
          profileOverrides.profileId,
          // trash: trashed profiles too (see `clearSpaceAccess`).
          db
            .select({ id: profiles.id })
            .from(profiles)
            .where(inArray(profiles.spaceId, leaving.map((l) => l.spaceId))),
        ),
      ),
    );
  }
  await db
    .delete(spaceMembers)
    .where(
      and(
        eq(spaceMembers.userId, targetUserId),
        inArray(spaceMembers.spaceId, wsSpaces),
        spaceIds.length > 0 ? notInArray(spaceMembers.spaceId, spaceIds) : undefined,
      ),
    );
  if (spaceIds.length === 0) return;
  await db
    .insert(spaceMembers)
    .values(spaceIds.map((spaceId) => ({ spaceId, userId: targetUserId, role })))
    .onConflictDoUpdate({
      target: [spaceMembers.spaceId, spaceMembers.userId],
      set: { role, updatedAt: new Date() },
    });
}

/**
 * Reconcile a *registered* user's access to exactly what `access` describes.
 * `all` → a workspace membership (dropping any now-redundant per-profile
 * grants) plus, below admin, the spaces it names at that role. `profiles` →
 * per-profile grants at each entry's role, removing the workspace membership
 * (and with it their spaces and overrides) and any grants for profiles no
 * longer selected. The caller is responsible for permission checks, plan
 * limits and the owner guard.
 */
async function applyMemberAccess(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  targetUserId: string,
  access: AccessGrant,
): Promise<void> {
  // trash: every profile for the sweeps below (a restore must not revive a
  // grant that was replaced); only live ones may be granted.
  const wsProfiles = await db
    .select({ id: profiles.id, deletedAt: profiles.deletedAt })
    .from(profiles)
    .where(eq(profiles.workspaceId, workspaceId));
  const wsProfileIds = wsProfiles.map((p) => p.id);
  const liveProfileIds = wsProfiles.filter((p) => p.deletedAt === null).map((p) => p.id);

  if (access.mode === "all") {
    const spaceIds =
      access.role === "admin" ? [] : await resolveGrantSpaces(db, workspaceId, access.spaceIds);
    await db
      .insert(workspaceMembers)
      .values({ workspaceId, userId: targetUserId, role: access.role })
      .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: { role: access.role, updatedAt: new Date() },
      });
    if (access.role === "admin") {
      // Admins see every space; leftover rows would only resurface on a demotion.
      await clearSpaceAccess(db, workspaceId, targetUserId);
    } else {
      await setMemberSpaces(db, workspaceId, targetUserId, access.role, spaceIds);
    }
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

  const allowed = new Set(liveProfileIds);
  for (const entry of access.entries) {
    if (!allowed.has(entry.profileId)) throw badRequest("Profile is not in this workspace");
  }
  // Per-profile access replaces any workspace-wide membership.
  await db
    .delete(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId)),
    );
  await clearSpaceAccess(db, workspaceId, targetUserId);
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

/** Advisory-lock namespace for invite-group rewrites; 1 and 2 are the quotas'. */
const INVITE_LOCK_NAMESPACE = 3;

/**
 * Reconcile the pending-invite rows for `email` to match `access`: one
 * workspace-wide row (`all`) or one row per profile (`profiles`). Replaces the
 * whole set for that email so editing an invite never leaves stale rows.
 *
 * Returns the group's join-link token. An existing token is carried over to the
 * new rows, so re-scoping an invite doesn't break the link already sitting in
 * the invitee's inbox; a first invite mints one.
 *
 * Validation happens *before* anything is deleted — a stale profile id (removed
 * in another tab, or from another workspace) must cost the admin an error
 * message, not the invite and its emailed link. The delete + insert then run
 * in one transaction behind a per-(workspace, email) advisory lock, so two
 * concurrent rewrites of the same group queue up instead of interleaving —
 * without it the second could delete nothing, mint a fresh token, and collide
 * with the first's rows on the unique index.
 */
async function applyInviteAccess(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  email: string,
  access: AccessGrant,
  invitedBy: string,
): Promise<string> {
  if (access.mode === "profiles") {
    const wsProfiles = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.workspaceId, workspaceId), notTrashed(profiles)));
    const allowed = new Set(wsProfiles.map((p) => p.id));
    for (const entry of access.entries) {
      if (!allowed.has(entry.profileId)) throw badRequest("Profile is not in this workspace");
    }
  }
  // Resolved to an explicit list now, so a space created after the invite was
  // sent isn't silently included when it's accepted. Admins see every space.
  const spaceIds =
    access.mode === "all" && access.role !== "admin"
      ? await resolveGrantSpaces(db, workspaceId, access.spaceIds)
      : null;

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${INVITE_LOCK_NAMESPACE}, hashtext(${`${workspaceId}:${email}`}))`,
    );
    const existing = await tx
      .delete(workspaceInvites)
      .where(and(eq(workspaceInvites.workspaceId, workspaceId), eq(workspaceInvites.email, email)))
      .returning({ token: workspaceInvites.token });
    const token = existing.find((r) => r.token)?.token ?? generateInviteToken();

    if (access.mode === "all") {
      await tx
        .insert(workspaceInvites)
        .values({ workspaceId, email, role: access.role, profileId: null, invitedBy, token, spaceIds });
      return token;
    }
    await tx.insert(workspaceInvites).values(
      access.entries.map((entry) => ({
        workspaceId,
        email,
        role: entry.role,
        profileId: entry.profileId,
        invitedBy,
        token,
      })),
    );
    return token;
  });
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
  // A new single-profile grant is per-profile access (Plus/Pro).
  if (data.access.mode === "profiles") await assertProfileLevelAccess(workspaceId);

  const [existing, inviter] = await Promise.all([
    findUserByEmail(data.email),
    findUserById(userId),
  ]);

  // The plan's member cap, before any email quota is spent. Someone who
  // already has access (or a pending invite) is being re-scoped, not added,
  // and always fits.
  await assertCanAddMember(workspaceId, { userId: existing?.id, email: data.email });

  // Both branches below send an email to a caller-chosen address.
  await assertInviteEmailAllowed(userId);
  const emailBase = {
    workspaceName: workspace.name,
    workspaceIcon: workspace.icon,
    inviterName: inviter?.name ?? null,
    scope,
    recipientEmail: data.email,
    money: { currency: workspace.currency, locale: workspace.locale },
  };

  if (existing) {
    if (existing.id === userId) throw badRequest("That's you — you already have access");
    if (existing.id === workspace.ownerId) {
      throw badRequest("The workspace owner already has full access");
    }
    await applyMemberAccess(db, workspaceId, existing.id, data.access);
    sendEmail({
      to: data.email,
      ...inviteEmail({
        ...emailBase,
        joinUrl: siteUrl(openWorkspacePath(workspaceId)),
        recipientHasAccount: true,
      }),
    });
    logger.info(`Workspace member added (${accessLogSummary(data.access)})`, {
      event: "workspace.member_added",
      workspaceId,
      userId,
      memberId: existing.id,
      mode: data.access.mode,
    });
    return { status: "added", email: data.email };
  }

  const token = await applyInviteAccess(db, workspaceId, data.email, data.access, userId);
  sendEmail({
    to: data.email,
    ...inviteEmail({ ...emailBase, joinUrl: siteUrl(invitePath(token)), recipientHasAccount: false }),
  });
  logger.info(`Workspace invite sent to ${redactEmail(data.email)} (${accessLogSummary(data.access)})`, {
    event: "workspace.invite_sent",
    workspaceId,
    userId,
    email: redactEmail(data.email),
    mode: data.access.mode,
  });
  return { status: "invited", email: data.email };
}

/** What the join page shows before anyone signs in: who, which workspace, what access. */
export type InvitePreview = {
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string | null;
  /** The invited address (lowercased) — the account that can accept. */
  email: string;
  inviterName: string | null;
  scope: InviteScope;
};

/** Every row of the invite group behind a token, with what the acceptance needs. */
async function loadInviteGroup(token: string) {
  const db = getDb();
  return db
    .select({
      ...convertibleInviteColumns,
      email: workspaceInvites.email,
      invitedBy: workspaceInvites.invitedBy,
      profileName: profiles.name,
      workspaceName: workspaces.name,
      workspaceIcon: workspaces.icon,
    })
    .from(workspaceInvites)
    .innerJoin(workspaces, eq(workspaceInvites.workspaceId, workspaces.id))
    // trash: display join for the join page; access is resolved later through
    // the access layer, which hides a trashed profile anyway.
    .leftJoin(profiles, eq(workspaceInvites.profileId, profiles.id))
    .where(eq(workspaceInvites.token, token))
    .orderBy(asc(profiles.sortOrder), asc(workspaceInvites.createdAt));
}

/**
 * Resolve a join link to what it offers, or null when the token is unknown —
 * accepted already, withdrawn by an admin, or never real. No auth: the page
 * renders this to a signed-out visitor so they know what they're signing up
 * for. The token is the secret; nothing here is reachable without it.
 */
export async function getInviteByToken(rawToken: unknown): Promise<InvitePreview | null> {
  const parsed = inviteTokenSchema.safeParse(rawToken);
  if (!parsed.success) return null;
  const rows = await loadInviteGroup(parsed.data);
  const first = rows[0];
  if (!first) return null;
  const inviter = await findUserById(first.invitedBy);
  const wide = rows.find((r) => r.profileId === null);
  const scope: InviteScope = wide
    ? {
        kind: "all",
        role: wide.role,
        // Null space ids (an admin invite, or one sent before spaces) cover everything.
        spaces:
          wide.role === "admin" || wide.spaceIds === null
            ? undefined
            : await spaceNamesUnlessAll(getDb(), first.workspaceId, wide.spaceIds),
      }
    : {
        kind: "profiles",
        entries: rows.map((r) => ({ name: r.profileName ?? "a profile", role: r.role })),
      };
  return {
    workspaceId: first.workspaceId,
    workspaceName: first.workspaceName,
    workspaceIcon: first.workspaceIcon,
    email: first.email,
    inviterName: inviter?.name ?? null,
    scope,
  };
}

/**
 * Accept an invite from its join link, as the signed-in user.
 *
 * The invite stays bound to the address it was sent to: a different account
 * holding the link is refused, so a forwarded email can't hand the workspace
 * to whoever opens it. For a brand-new account this is also where bootstrap
 * runs — and bootstrap's own by-email acceptance already covers these rows, so
 * the explicit conversion after it is a no-op there and does the work for an
 * existing account. Either way the invited workspace becomes the current one,
 * so `/app` opens on it rather than on the person's own default.
 */
export async function acceptInviteByToken(
  user: SessionUser,
  rawToken: unknown,
): Promise<{ workspaceId: string }> {
  const token = parseOrThrow(inviteTokenSchema, rawToken);
  const rows = await loadInviteGroup(token);
  const first = rows[0];
  if (!first) throw notFound("This invite has already been accepted or was withdrawn");
  if (!user.email || user.email.trim().toLowerCase() !== first.email) {
    throw forbidden("This invite was sent to a different email address");
  }

  await ensureBootstrap(user.id);
  // Re-read rather than trust the rows above: bootstrap's own by-email pass
  // may have consumed them (fine), or an admin may have withdrawn the invite in
  // the meantime (then there's nothing to grant). Either way the end state —
  // can this user open the workspace? — is what gets checked, not the read.
  await convertInvites(user.id, await loadInviteGroup(token));
  const list = await listUserWorkspaces(user.id);
  if (!list.some((w) => w.id === first.workspaceId)) {
    throw notFound("This invite has already been accepted or was withdrawn");
  }
  const db = getDb();
  await db
    .update(userSettings)
    .set({ lastWorkspaceId: first.workspaceId, updatedAt: new Date() })
    .where(eq(userSettings.userId, user.id));
  logger.info("Workspace invite accepted from its join link", {
    event: "workspace.invite_accepted",
    workspaceId: first.workspaceId,
    userId: user.id,
    invitedBy: first.invitedBy,
  });
  return { workspaceId: first.workspaceId };
}

/**
 * Open a workspace the user already has access to — the landing behaviour of
 * an "access granted" email's link (`/app?workspace=<id>`). Anything the user
 * can't open is ignored rather than surfaced: the link is a convenience, and
 * the tracker falls back to their current workspace.
 */
export async function openWorkspaceIfAccessible(userId: string, workspaceId: string): Promise<void> {
  await ensureBootstrap(userId);
  const list = await listUserWorkspaces(userId);
  if (!list.some((w) => w.id === workspaceId)) return;
  const db = getDb();
  await db
    .update(userSettings)
    .set({ lastWorkspaceId: workspaceId, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
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
  // Per-profile access is a Plus/Pro feature — but narrowing what someone
  // already has (dropping a profile, lowering a role) never needs the plan, so
  // an admin on Free is never stuck with a share they want smaller.
  if (data.access.mode === "profiles") {
    const existing = await db
      .select({ profileId: profileAccess.profileId, role: profileAccess.role })
      .from(profileAccess)
      // trash: all of their grants — dropping one on a trashed profile is still
      // a narrowing, never a widening.
      .innerJoin(profiles, eq(profiles.id, profileAccess.profileId))
      .where(and(eq(profiles.workspaceId, workspaceId), eq(profileAccess.userId, data.userId)));
    if (!onlyNarrows(existing, data.access.entries)) await assertProfileLevelAccess(workspaceId);
  }
  // Meant for re-scoping someone who already has access (who always fits), but
  // it upserts — so a user id that isn't here yet is an add, and pays the cap.
  await assertCanAddMember(workspaceId, { userId: data.userId });
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
  // As in `setMemberAccess`: narrowing a pending per-profile invite is free.
  if (data.access.mode === "profiles") {
    const existing = await db
      .select({ profileId: workspaceInvites.profileId, role: workspaceInvites.role })
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.workspaceId, workspaceId),
          eq(workspaceInvites.email, data.email),
          isNotNull(workspaceInvites.profileId),
        ),
      );
    const rows = existing.flatMap((r) => (r.profileId ? [{ profileId: r.profileId, role: r.role }] : []));
    if (!onlyNarrows(rows, data.access.entries)) await assertProfileLevelAccess(workspaceId);
  }
  // Same as `setMemberAccess`: an email with no invite yet is a new person.
  await assertCanAddMember(workspaceId, { email: data.email });
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
  await clearSpaceAccess(db, workspaceId, targetUserId);
  await db.delete(profileAccess).where(
    and(
      eq(profileAccess.userId, targetUserId),
      inArray(
        profileAccess.profileId,
        // trash: trashed profiles too — removal must survive a restore.
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
  // A view-only workspace refuses widening access (a promotion), never
  // narrowing it — an owner must always be able to take access away.
  const currentRole = await getWorkspaceRole(data.userId, workspaceId);
  if (currentRole && !atLeastRole(currentRole, data.role)) await assertWorkspaceWritable(workspaceId);
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
  if (data.role === "admin") {
    await clearSpaceAccess(db, workspaceId, data.userId);
  } else {
    // The role applies to the spaces they're in; someone with none (a demoted
    // admin) gets every space, which is what a workspace-wide role meant.
    const current = await db
      .select({ spaceId: spaceMembers.spaceId })
      .from(spaceMembers)
      .innerJoin(spaces, eq(spaceMembers.spaceId, spaces.id))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(spaceMembers.userId, data.userId)));
    const spaceIds =
      current.length > 0
        ? current.map((r) => r.spaceId)
        : await resolveGrantSpaces(db, workspaceId, undefined);
    await setMemberSpaces(db, workspaceId, data.userId, data.role, spaceIds);
  }
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
  await clearSpaceAccess(db, workspaceId, memberId);
  // Their Ask chats here go with them (messages cascade): each answer was
  // built from this workspace's transactions, and someone who can no longer
  // open the workspace shouldn't keep a copy of what it said. Chats in their
  // other workspaces are untouched.
  await db
    .delete(aiChats)
    .where(and(eq(aiChats.workspaceId, workspaceId), eq(aiChats.userId, memberId)));

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
    .where(and(eq(profiles.workspaceId, workspaceId), notTrashed(profiles)))
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
