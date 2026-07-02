import type { WorkspaceRole } from "@/db/schema";

/**
 * Role-based access control primitives. Roles apply workspace-wide
 * (workspace_members) or to a single profile (profile_access); a user's
 * effective role on a profile is the *higher* of the two.
 *
 *   viewer — read profiles/transactions
 *   editor — viewer + create/edit/delete transactions
 *   admin  — editor + manage profiles, members, and workspace settings
 */

export const WORKSPACE_ROLES = ["viewer", "editor", "admin"] as const;

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

/** Roles that satisfy `min` — for SQL `IN (...)` filters. */
export function rolesAtLeast(min: WorkspaceRole): WorkspaceRole[] {
  return WORKSPACE_ROLES.filter((r) => RANK[r] >= RANK[min]);
}
