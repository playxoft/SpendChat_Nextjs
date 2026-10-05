import "server-only";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  profileOverrides,
  profiles,
  spaceMembers,
  spaces,
  workspaceMembers,
  workspaces,
  type ProfileAccessLevel,
  type SpaceRole,
  type WorkspaceRole,
} from "@/db/schema";
import { parseOrThrow } from "@/lib/api-response";
import { findUsersByIds } from "@/lib/directory";
import {
  assertCanAddProfilesToSpace,
  assertCanAddSpace,
  assertProfileLevelAccess,
  assertWorkspaceWritable,
  getWorkspaceEntitlements,
} from "@/lib/entitlements";
import { badRequest, conflict, isUniqueViolation, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  accessibleProfileIds,
  getWorkspaceRole,
  requireSpaceInWorkspace,
  requireWorkspaceRole,
} from "@/lib/workspaces";
import {
  createSpaceSchema,
  deleteSpaceSchema,
  moveProfileToSpaceSchema,
  reorderSpacesSchema,
  setProfileOverrideSchema,
  setSpaceMemberSchema,
  updateSpaceSchema,
} from "@/lib/validation";

/**
 * Spaces: the middle of workspace → space → profile, and the unit of sharing.
 * Workspace admins manage everything here (create, rename, reorder, delete,
 * membership, per-profile overrides); members only ever read their own list.
 * Shared by the web actions and the REST API.
 *
 * Limits come from the workspace's plan (`lib/entitlements.ts`): how many
 * spaces, how many profiles per space, and whether per-profile overrides can
 * be changed at all (Plus/Pro).
 */

const DUPLICATE = "A space with that name already exists";

export type SpaceSummary = {
  id: string;
  name: string;
  icon: string | null;
  position: number;
  /** Profiles in the space (all of them — what counts towards the per-space cap). */
  profileCount: number;
  /** The caller's role here: "admin" for workspace admins, else their space role or null. */
  role: WorkspaceRole | null;
};

/** A space by id, with its workspace — 404 when it doesn't exist. */
async function loadSpace(spaceId: string) {
  const db = getDb();
  const [row] = await db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  if (!row) throw notFound("Space not found");
  return row;
}

/** Load a space and require workspace admin on it (404 for non-members, 403 below admin). */
async function requireSpaceAdmin(userId: string, spaceId: string) {
  const space = await loadSpace(spaceId);
  await requireWorkspaceRole(userId, space.workspaceId, "admin");
  return space;
}

/**
 * The spaces the caller can see, in sidebar order. Admins see every space;
 * anyone else sees the spaces they're a member of plus any space holding a
 * profile they can reach some other way (an override that raises, or a legacy
 * single-profile grant). Empty spaces show for admins and for their members, so
 * a just-created space is there to put profiles into.
 */
export async function listSpaces(userId: string, workspaceId: string): Promise<SpaceSummary[]> {
  const db = getDb();
  const [wsRole, rows, memberships, reachable] = await Promise.all([
    getWorkspaceRole(userId, workspaceId),
    db
      .select({
        id: spaces.id,
        name: spaces.name,
        icon: spaces.icon,
        position: spaces.position,
        // A builder subquery, not a hand-written one: in this single-table
        // select Drizzle renders `spaces.id` unqualified, which inside a raw
        // subquery over `profiles` would bind to `profiles.id`.
        profileCount: sql<number>`(${db
          .select({ n: sql`count(*)::int` })
          .from(profiles)
          .where(eq(profiles.spaceId, spaces.id))})`,
      })
      .from(spaces)
      .where(eq(spaces.workspaceId, workspaceId))
      .orderBy(asc(spaces.position), asc(spaces.createdAt)),
    db
      .select({ spaceId: spaceMembers.spaceId, role: spaceMembers.role })
      .from(spaceMembers)
      .innerJoin(spaces, eq(spaceMembers.spaceId, spaces.id))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(spaceMembers.userId, userId))),
    db
      .selectDistinct({ spaceId: profiles.spaceId })
      .from(profiles)
      .where(inArray(profiles.id, accessibleProfileIds(userId, workspaceId))),
  ]);

  if (wsRole === "admin") return rows.map((r) => ({ ...r, role: "admin" as const }));
  // Space membership only counts for workspace members — the same rule the
  // profile resolver applies, so a stale row can't surface a space.
  const roleBySpace = new Map<string, SpaceRole>(
    wsRole ? memberships.map((m) => [m.spaceId, m.role]) : [],
  );
  const visible = new Set([...roleBySpace.keys(), ...reachable.map((r) => r.spaceId)]);
  return rows
    .filter((r) => visible.has(r.id))
    .map((r) => ({ ...r, role: roleBySpace.get(r.id) ?? null }));
}

export async function createSpace(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<SpaceSummary> {
  const data = parseOrThrow(createSpaceSchema, input);
  await requireWorkspaceRole(userId, workspaceId, "admin");
  await assertCanAddSpace(workspaceId);
  const db = getDb();
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${spaces.position}), -1) + 1` })
    .from(spaces)
    .where(eq(spaces.workspaceId, workspaceId));
  try {
    const [row] = await db
      .insert(spaces)
      .values({ workspaceId, name: data.name, icon: data.icon || null, position: next ?? 0 })
      .returning();
    logger.info("Space created", { event: "space.created", workspaceId, spaceId: row!.id });
    return {
      id: row!.id,
      name: row!.name,
      icon: row!.icon,
      position: row!.position,
      profileCount: 0,
      role: "admin",
    };
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(DUPLICATE);
    throw err;
  }
}

export async function updateSpace(userId: string, spaceId: string, input: unknown): Promise<void> {
  const data = parseOrThrow(updateSpaceSchema, input);
  const space = await requireSpaceAdmin(userId, spaceId);
  const patch: { name?: string; icon?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.icon !== undefined) patch.icon = data.icon || null;
  try {
    await getDb().update(spaces).set(patch).where(eq(spaces.id, space.id));
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(DUPLICATE);
    throw err;
  }
  logger.info("Space updated", { event: "space.updated", workspaceId: space.workspaceId, spaceId });
}

/** Put the workspace's spaces in the given order. Every id must be one of its spaces. */
export async function reorderSpaces(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<void> {
  const { ids } = parseOrThrow(reorderSpacesSchema, input);
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();
  const own = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(eq(spaces.workspaceId, workspaceId));
  const allowed = new Set(own.map((r) => r.id));
  if (ids.some((id) => !allowed.has(id))) throw badRequest("Space is not in this workspace");
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) {
      await tx
        .update(spaces)
        .set({ position, updatedAt: new Date() })
        .where(and(eq(spaces.id, id), eq(spaces.workspaceId, workspaceId)));
    }
  });
}

/**
 * Delete a space. Its profiles are never deleted with it: an empty space just
 * goes; one with profiles needs `moveProfilesTo` (another space of the same
 * workspace, with room under the plan's per-space cap), and the move and the
 * delete commit together. The last space can't be deleted — a profile always
 * needs somewhere to live. Membership rows go with the space (cascade).
 */
export async function deleteSpace(userId: string, spaceId: string, input: unknown = {}): Promise<void> {
  const data = parseOrThrow(deleteSpaceSchema, input ?? {});
  const space = await requireSpaceAdmin(userId, spaceId);
  const db = getDb();

  const [{ n: spaceCount }] = await db
    .select({ n: count() })
    .from(spaces)
    .where(eq(spaces.workspaceId, space.workspaceId));
  if (spaceCount <= 1) throw conflict("A workspace needs at least one space");

  const [{ n: profileCount }] = await db
    .select({ n: count() })
    .from(profiles)
    .where(eq(profiles.spaceId, space.id));

  let target: string | null = null;
  if (profileCount > 0) {
    if (!data.moveProfilesTo) {
      throw conflict("This space still has profiles — move them to another space first");
    }
    if (data.moveProfilesTo === space.id) throw badRequest("Pick a different space");
    target = await requireSpaceInWorkspace(space.workspaceId, data.moveProfilesTo);
    await assertCanAddProfilesToSpace(space.workspaceId, target, profileCount);
  }

  await db.transaction(async (tx) => {
    if (target) {
      await tx
        .update(profiles)
        .set({ spaceId: target, updatedAt: new Date() })
        .where(eq(profiles.spaceId, space.id));
    }
    // Restrict FK on profiles.space_id: a profile written into the space after
    // the count above fails this delete and rolls the move back with it.
    await tx.delete(spaces).where(eq(spaces.id, space.id));
  });
  logger.info(`Space deleted${target ? ` (${profileCount} profiles moved)` : ""}`, {
    event: "space.deleted",
    workspaceId: space.workspaceId,
    spaceId,
    movedTo: target,
  });
}

/**
 * Move a profile into another space of its workspace (admin). Who can see it
 * follows: the new space's members, plus anyone with an override on the
 * profile itself (overrides belong to the profile, so they move with it).
 */
export async function moveProfileToSpace(
  userId: string,
  profileId: string,
  input: unknown,
): Promise<void> {
  const { spaceId } = parseOrThrow(moveProfileToSpaceSchema, input);
  const db = getDb();
  const [profile] = await db
    .select({ id: profiles.id, workspaceId: profiles.workspaceId, spaceId: profiles.spaceId })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!profile) throw notFound("Profile not found");
  await requireWorkspaceRole(userId, profile.workspaceId, "admin");
  if (profile.spaceId === spaceId) return;
  await requireSpaceInWorkspace(profile.workspaceId, spaceId);
  await assertCanAddProfilesToSpace(profile.workspaceId, spaceId);
  await db
    .update(profiles)
    .set({ spaceId, updatedAt: new Date() })
    .where(eq(profiles.id, profileId));
  logger.info("Profile moved to another space", {
    event: "space.profile_moved",
    workspaceId: profile.workspaceId,
    profileId,
    spaceId,
  });
}

// ── Membership + overrides ─────────────────────────────────────────────────

export type SpaceAccessMember = {
  userId: string;
  name: string | null;
  email: string | null;
  workspaceRole: WorkspaceRole;
  /** Their role in this space; null when they're not in it. Admins: always null (they see all). */
  spaceRole: SpaceRole | null;
  isOwner: boolean;
};

export type SpaceAccess = {
  space: { id: string; name: string; icon: string | null; workspaceId: string };
  /** Every workspace member, admins included (shown as "sees everything"). */
  members: SpaceAccessMember[];
  profiles: { id: string; name: string; icon: string | null }[];
  /** Overrides on this space's profiles. */
  overrides: { profileId: string; userId: string; access: ProfileAccessLevel }[];
  /** Whether the plan lets overrides be changed (Plus/Pro). Existing ones always apply. */
  canEditOverrides: boolean;
};

/** Everything the space's "Members & access" dialog shows (admin). */
export async function getSpaceAccess(userId: string, spaceId: string): Promise<SpaceAccess> {
  const space = await requireSpaceAdmin(userId, spaceId);
  const db = getDb();
  const [workspace, members, inSpace, spaceProfiles, overrides, ent] = await Promise.all([
    db
      .select({ ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, space.workspaceId))
      .limit(1),
    db
      .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, space.workspaceId))
      .orderBy(asc(workspaceMembers.createdAt)),
    db
      .select({ userId: spaceMembers.userId, role: spaceMembers.role })
      .from(spaceMembers)
      .where(eq(spaceMembers.spaceId, space.id)),
    db
      .select({ id: profiles.id, name: profiles.name, icon: profiles.icon })
      .from(profiles)
      .where(eq(profiles.spaceId, space.id))
      .orderBy(asc(profiles.sortOrder), asc(profiles.createdAt)),
    db
      .select({
        profileId: profileOverrides.profileId,
        userId: profileOverrides.userId,
        access: profileOverrides.access,
      })
      .from(profileOverrides)
      .innerJoin(profiles, eq(profileOverrides.profileId, profiles.id))
      .where(eq(profiles.spaceId, space.id)),
    getWorkspaceEntitlements(space.workspaceId),
  ]);
  const roleIn = new Map(inSpace.map((r) => [r.userId, r.role]));
  const directory = await findUsersByIds(members.map((m) => m.userId));
  const ownerId = workspace[0]?.ownerId;
  const memberIds = new Set(members.map((m) => m.userId));
  return {
    space: { id: space.id, name: space.name, icon: space.icon, workspaceId: space.workspaceId },
    members: members
      .map((m) => ({
        userId: m.userId,
        name: directory.get(m.userId)?.name ?? null,
        email: directory.get(m.userId)?.email ?? null,
        workspaceRole: m.role,
        spaceRole: m.role === "admin" ? null : (roleIn.get(m.userId) ?? null),
        isOwner: m.userId === ownerId,
      }))
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner)),
    profiles: spaceProfiles,
    // Only members' overrides mean anything (the resolver ignores the rest).
    overrides: overrides.filter((o) => memberIds.has(o.userId)),
    canEditOverrides: ent.limits.profileLevelAccess,
  };
}

/** The target must be a non-admin member of the workspace — admins already see every space. */
async function requireNonAdminMember(workspaceId: string, targetUserId: string): Promise<void> {
  const role = await getWorkspaceRole(targetUserId, workspaceId);
  if (!role) throw badRequest("Add them to the workspace first");
  if (role === "admin") throw badRequest("Admins already see every space");
}

/**
 * Put a workspace member in this space at `role`, change their role, or take
 * them out (`role: null`). Taking someone out also clears their overrides on
 * this space's profiles, so "removed from the space" means no access to it —
 * a leftover override can't keep one profile visible.
 */
export async function setSpaceMember(userId: string, spaceId: string, input: unknown): Promise<void> {
  const data = parseOrThrow(setSpaceMemberSchema, input);
  const space = await requireSpaceAdmin(userId, spaceId);
  await requireNonAdminMember(space.workspaceId, data.userId);
  // Taking someone out is cleanup and stays open; putting them in (or raising
  // them) is adding access, which a view-only workspace refuses.
  if (data.role !== null) await assertWorkspaceWritable(space.workspaceId);
  const db = getDb();
  if (data.role === null) {
    await db.transaction(async (tx) => {
      await tx
        .delete(spaceMembers)
        .where(and(eq(spaceMembers.spaceId, space.id), eq(spaceMembers.userId, data.userId)));
      await tx
        .delete(profileOverrides)
        .where(
          and(
            eq(profileOverrides.userId, data.userId),
            inArray(
              profileOverrides.profileId,
              tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.spaceId, space.id)),
            ),
          ),
        );
    });
  } else {
    await db
      .insert(spaceMembers)
      .values({ spaceId: space.id, userId: data.userId, role: data.role })
      .onConflictDoUpdate({
        target: [spaceMembers.spaceId, spaceMembers.userId],
        set: { role: data.role, updatedAt: new Date() },
      });
  }
  logger.info(data.role ? `Space member set to ${data.role}` : "Space member removed", {
    event: "space.member_set",
    workspaceId: space.workspaceId,
    spaceId,
    memberId: data.userId,
    role: data.role,
  });
}

/**
 * Set or clear one member's override on one profile (Plus/Pro). An override
 * replaces the space role on that profile in either direction — `none` hides
 * it inside their space, `read`/`write` can open a profile in a space they're
 * not in. On Free, overrides can't be changed at all; existing ones keep
 * enforcing, so a downgrade never widens anyone's access.
 */
export async function setProfileOverride(
  userId: string,
  profileId: string,
  input: unknown,
): Promise<void> {
  const data = parseOrThrow(setProfileOverrideSchema, input);
  const db = getDb();
  const [profile] = await db
    .select({ id: profiles.id, workspaceId: profiles.workspaceId })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!profile) throw notFound("Profile not found");
  await requireWorkspaceRole(userId, profile.workspaceId, "admin");
  await assertWorkspaceWritable(profile.workspaceId);
  await assertProfileLevelAccess(profile.workspaceId);
  await requireNonAdminMember(profile.workspaceId, data.userId);

  if (data.access === null) {
    await db
      .delete(profileOverrides)
      .where(and(eq(profileOverrides.profileId, profileId), eq(profileOverrides.userId, data.userId)));
  } else {
    await db
      .insert(profileOverrides)
      .values({ profileId, userId: data.userId, access: data.access })
      .onConflictDoUpdate({
        target: [profileOverrides.profileId, profileOverrides.userId],
        set: { access: data.access, updatedAt: new Date() },
      });
  }
  logger.info(data.access ? `Profile override set to ${data.access}` : "Profile override cleared", {
    event: "space.override_set",
    workspaceId: profile.workspaceId,
    profileId,
    memberId: data.userId,
    access: data.access,
  });
}

/** Overrides on one profile (admin) — for the API's per-profile view. */
export async function listProfileOverrides(userId: string, profileId: string) {
  const db = getDb();
  const [profile] = await db
    .select({ workspaceId: profiles.workspaceId })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!profile) throw notFound("Profile not found");
  await requireWorkspaceRole(userId, profile.workspaceId, "admin");
  return db
    .select({ userId: profileOverrides.userId, access: profileOverrides.access })
    .from(profileOverrides)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.userId, profileOverrides.userId),
        eq(workspaceMembers.workspaceId, profile.workspaceId),
        ne(workspaceMembers.role, "admin"),
      ),
    )
    .where(eq(profileOverrides.profileId, profileId))
    .orderBy(asc(profileOverrides.createdAt));
}
