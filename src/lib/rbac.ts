import type { ProfileAccessLevel, SpaceRole, WorkspaceRole } from "@/db/schema";

/**
 * Role-based access control primitives.
 *
 *   viewer — read profiles/transactions
 *   editor — viewer + create/edit/delete transactions
 *   admin  — editor + manage profiles, spaces, members, and workspace settings
 *
 * Where a role comes from (workspace → space → profile) is decided by
 * `resolveProfileRole` below; `lib/workspaces.ts` runs the same rules in SQL
 * (`accessibleProfileIds`) and must stay in step with it.
 */

export const WORKSPACE_ROLES = ["viewer", "editor", "admin"] as const;
export const SPACE_ROLES = ["viewer", "editor"] as const;
export const PROFILE_ACCESS_LEVELS = ["none", "read", "write"] as const;

const RANK: Record<WorkspaceRole, number> = { viewer: 1, editor: 2, admin: 3 };

/** True when `role` grants at least `min` (null role = no access). */
export function atLeastRole(role: WorkspaceRole | null | undefined, min: WorkspaceRole): boolean {
  return role != null && RANK[role] >= RANK[min];
}

/** The higher of two (possibly absent) roles. */
export function maxRole(
  a: WorkspaceRole | null | undefined,
  b: WorkspaceRole | null | undefined,
): WorkspaceRole | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

/** The lower of two roles. */
export function minRole(a: WorkspaceRole, b: WorkspaceRole): WorkspaceRole {
  return RANK[a] <= RANK[b] ? a : b;
}

/** Roles that satisfy `min` — for SQL `IN (...)` filters. */
export function rolesAtLeast(min: WorkspaceRole): WorkspaceRole[] {
  return WORKSPACE_ROLES.filter((r) => RANK[r] >= RANK[min]);
}

/** Space roles that satisfy `min` (none for `admin` — a space can't grant it). */
export function spaceRolesAtLeast(min: WorkspaceRole): SpaceRole[] {
  return SPACE_ROLES.filter((r) => RANK[r] >= RANK[min]);
}

/** What an override level means as a role: `none` hides the profile. */
export const OVERRIDE_ROLE: Record<ProfileAccessLevel, WorkspaceRole | null> = {
  none: null,
  read: "viewer",
  write: "editor",
};

/** Override levels that satisfy `min` (none for `admin` — overrides top out at write). */
export function accessLevelsAtLeast(min: WorkspaceRole): ProfileAccessLevel[] {
  return PROFILE_ACCESS_LEVELS.filter((l) => atLeastRole(OVERRIDE_ROLE[l], min));
}

/** The override level a space role corresponds to, for showing defaults in the UI. */
export function accessLevelForRole(role: WorkspaceRole | null): ProfileAccessLevel {
  if (role == null) return "none";
  return role === "viewer" ? "read" : "write";
}

/**
 * Everything that can give a user a role on one profile. Every field is the
 * raw row value, or null when there's no row.
 */
export type ProfileRoleInputs = {
  /** `workspace_members.role` in the profile's workspace — null when not a member. */
  workspaceRole: WorkspaceRole | null;
  /** `profile_overrides.access` for this profile (Plus/Pro). */
  override: ProfileAccessLevel | null;
  /** `space_members.role` in the profile's space. */
  spaceRole: SpaceRole | null;
  /** A legacy `profile_access` grant — sharing one profile with a non-member. */
  grantRole: WorkspaceRole | null;
};

/**
 * A user's effective role on a profile. In order:
 *
 *  1. A workspace **admin** (the owner always is one) gets admin — admins see
 *     every space, there are no private spaces.
 *  2. A member with a per-profile **override** gets exactly what it says, in
 *     either direction: `none` hides the profile even inside their space.
 *  3. Otherwise the higher of their **space role** (members only) and any legacy
 *     **per-profile grant** — grants only ever add, as they always did.
 *  4. Otherwise nothing.
 *
 * Space roles and overrides only count for workspace members, so a stale row
 * left behind for someone who has since been removed can never grant access.
 */
export function resolveProfileRole(inputs: ProfileRoleInputs): WorkspaceRole | null {
  const { workspaceRole, override, spaceRole, grantRole } = inputs;
  if (workspaceRole === "admin") return "admin";
  const member = workspaceRole != null;
  if (member && override != null) return OVERRIDE_ROLE[override];
  return maxRole(member ? spaceRole : null, grantRole);
}
