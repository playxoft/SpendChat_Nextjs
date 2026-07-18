import "server-only";
import { and, asc, eq, exists, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  profileAccess,
  profiles,
  userSettings,
  workspaceInvites,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "@/db/schema";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { forbidden, notFound } from "@/lib/errors";
import { maxRole, rolesAtLeast } from "@/lib/rbac";

/**
 * Workspace access resolution — the single source of truth for "which
 * workspaces/profiles can this user see, and with what role". Pure data
 * helpers only (no session, no bootstrap); `src/lib/auth.ts` and the services
 * build on these.
 */

export type WorkspaceSummary = {
  id: string;
  name: string;
  ownerId: string;
  /** Currency + number format (locale) are per-workspace. */
  currency: string;
  locale: string;
  /** Workspace-wide role; null when access comes via per-profile grants only. */
  role: WorkspaceRole | null;
};

/** Every workspace the user can open: memberships first, then grant-only ones. */
export async function listUserWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const db = getDb();

  const memberOf = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      ownerId: workspaces.ownerId,
      currency: workspaces.currency,
      locale: workspaces.locale,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaces.createdAt));

  const memberIds = new Set(memberOf.map((w) => w.id));

  // Workspaces reachable only through a per-profile grant.
  const granted = await db
    .selectDistinct({
      id: workspaces.id,
      name: workspaces.name,
      ownerId: workspaces.ownerId,
      currency: workspaces.currency,
      locale: workspaces.locale,
    })
    .from(profileAccess)
    .innerJoin(profiles, eq(profileAccess.profileId, profiles.id))
    .innerJoin(workspaces, eq(profiles.workspaceId, workspaces.id))
    .where(eq(profileAccess.userId, userId));

  return [
    ...memberOf,
    ...granted
      .filter((w) => !memberIds.has(w.id))
      .map((w) => ({ ...w, role: null as WorkspaceRole | null })),
  ];
}

/**
 * A workspace's currency + number format (locale), for parsing/formatting money.
 * Falls back to USD/en-US if the workspace vanished mid-request. Access is
 * assumed already checked by the caller (it resolved this workspace id).
 */
export async function getWorkspaceMoneyFormat(
  workspaceId: string,
): Promise<{ currency: string; locale: string }> {
  const db = getDb();
  const row = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { currency: true, locale: true },
  });
  return { currency: row?.currency ?? "USD", locale: row?.locale ?? "en-US" };
}

/** The user's workspace-wide role, or null when not a member. */
export async function getWorkspaceRole(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceRole | null> {
  const db = getDb();
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .limit(1);
  return row?.role ?? null;
}

/**
 * The user's effective role on one profile: max(workspace role, profile
 * grant), or null when the profile doesn't exist / isn't accessible.
 */
export async function getEffectiveProfileRole(
  userId: string,
  profileId: string,
): Promise<{ role: WorkspaceRole; workspaceId: string } | null> {
  const db = getDb();
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { id: true, workspaceId: true },
  });
  if (!profile) return null;

  const [workspaceRole, [grant]] = await Promise.all([
    getWorkspaceRole(userId, profile.workspaceId),
    db
      .select({ role: profileAccess.role })
      .from(profileAccess)
      .where(and(eq(profileAccess.profileId, profileId), eq(profileAccess.userId, userId)))
      .limit(1),
  ]);

  const role = maxRole(workspaceRole, grant?.role ?? null);
  return role ? { role, workspaceId: profile.workspaceId } : null;
}

/**
 * SQL condition selecting profiles (of the `profiles` table) in `workspaceId`
 * that the user can access with at least `minRole`. Composable into any query
 * via `inArray(<col>, accessibleProfileIds(...))`.
 */
export function accessibleProfileIds(
  userId: string,
  workspaceId: string,
  minRole: WorkspaceRole = "viewer",
) {
  const db = getDb();
  const roles = rolesAtLeast(minRole);
  return db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.workspaceId, workspaceId),
        or(
          exists(
            db
              .select({ one: workspaceMembers.userId })
              .from(workspaceMembers)
              .where(
                and(
                  eq(workspaceMembers.workspaceId, profiles.workspaceId),
                  eq(workspaceMembers.userId, userId),
                  inArray(workspaceMembers.role, roles),
                ),
              ),
          ),
          exists(
            db
              .select({ one: profileAccess.userId })
              .from(profileAccess)
              .where(
                and(
                  eq(profileAccess.profileId, profiles.id),
                  eq(profileAccess.userId, userId),
                  inArray(profileAccess.role, roles),
                ),
              ),
          ),
        ),
      ),
    );
}

/**
 * Whether the user can write (≥ editor) to at least one profile in the
 * workspace. Drives the UI's viewer gate: a "pure viewer" (no editor access
 * anywhere) sees the compose/add controls replaced with a read-only notice.
 * Backend mutations enforce the per-profile role regardless.
 */
export async function canWriteInWorkspace(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const rows = await accessibleProfileIds(userId, workspaceId, "editor").limit(1);
  return rows.length > 0;
}

/** Throw 403/404 unless the user has ≥ `minRole` on the profile. */
export async function requireProfileRole(
  userId: string,
  profileId: string,
  minRole: WorkspaceRole,
): Promise<{ role: WorkspaceRole; workspaceId: string }> {
  const access = await getEffectiveProfileRole(userId, profileId);
  if (!access) throw notFound("Profile not found");
  if (!rolesAtLeast(minRole).includes(access.role)) {
    throw forbidden("You don't have permission to do that");
  }
  return access;
}

/** Throw unless the user is a workspace member with ≥ `minRole`. */
export async function requireWorkspaceRole(
  userId: string,
  workspaceId: string,
  minRole: WorkspaceRole,
): Promise<WorkspaceRole> {
  const role = await getWorkspaceRole(userId, workspaceId);
  if (!role) throw notFound("Workspace not found");
  if (!rolesAtLeast(minRole).includes(role)) {
    throw forbidden("You don't have permission to do that");
  }
  return role;
}

/**
 * Create a workspace with its currency/locale, admin membership, default
 * "Personal" profile, and default category list, and point the creator's
 * `last_workspace_id` at it when unset (`makeCurrent` forces the switch, for
 * explicit "create workspace" flows). Currency/locale default to USD/en-US;
 * bootstrap passes geo-detected values, and the "create workspace" flow can pass
 * the creator's current-workspace values so a new workspace inherits them.
 */
export async function createWorkspaceWithDefaults(
  userId: string,
  name: string,
  opts: { makeCurrent?: boolean; currency?: string; locale?: string } = {},
): Promise<WorkspaceSummary> {
  const db = getDb();
  const [workspace] = await db
    .insert(workspaces)
    .values({
      name,
      ownerId: userId,
      ...(opts.currency ? { currency: opts.currency } : {}),
      ...(opts.locale ? { locale: opts.locale } : {}),
    })
    .returning();
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: workspace!.id, userId, role: "admin" })
    .onConflictDoNothing();
  await db
    .insert(profiles)
    .values({
      userId,
      workspaceId: workspace!.id,
      name: "Personal",
      icon: "👤",
      sortOrder: 0,
    })
    .onConflictDoNothing();

  // Seed the workspace's shared category list.
  await db
    .insert(categories)
    .values(
      DEFAULT_CATEGORIES.map((c) => ({
        userId,
        workspaceId: workspace!.id,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
      })),
    )
    .onConflictDoNothing();

  // Point last_workspace_id here — always for an explicit "create workspace",
  // otherwise only when the user has no current workspace yet (first bootstrap).
  await db
    .update(userSettings)
    .set({ lastWorkspaceId: workspace!.id, updatedAt: new Date() })
    .where(
      opts.makeCurrent
        ? eq(userSettings.userId, userId)
        : and(eq(userSettings.userId, userId), isNull(userSettings.lastWorkspaceId)),
    );

  return {
    id: workspace!.id,
    name: workspace!.name,
    ownerId: userId,
    currency: workspace!.currency,
    locale: workspace!.locale,
    role: "admin",
  };
}

/**
 * Convert any pending email invites for this (new) user into memberships /
 * profile grants, then clear them. Called once from first bootstrap.
 */
export async function acceptPendingInvites(userId: string, email: string): Promise<number> {
  const db = getDb();
  const pending = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.email, email.trim().toLowerCase()));
  if (pending.length === 0) return 0;

  for (const invite of pending) {
    if (invite.profileId) {
      await db
        .insert(profileAccess)
        .values({ profileId: invite.profileId, userId, role: invite.role })
        .onConflictDoNothing();
    } else {
      await db
        .insert(workspaceMembers)
        .values({ workspaceId: invite.workspaceId, userId, role: invite.role })
        .onConflictDoNothing();
    }
  }
  await db.delete(workspaceInvites).where(
    inArray(
      workspaceInvites.id,
      pending.map((i) => i.id),
    ),
  );
  return pending.length;
}
