import "server-only";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { profiles, transactions } from "@/db/schema";
import { ensureBootstrap } from "@/lib/auth";
import { conflict, validationError } from "@/lib/errors";
import { parseOrThrow, withId } from "@/lib/api-response";
import {
  accessibleProfileIds,
  requireProfileRole,
  requireWorkspaceRole,
} from "@/lib/workspaces";
import {
  profileInputSchema,
  reorderProfilesSchema,
  updateProfileSchema,
} from "@/lib/validation";
import type { Profile } from "@/db/schema";

/**
 * Profile business logic shared by the web actions and the REST API. Profiles
 * live in workspaces; RBAC:
 *   viewer  — sees the profile (and its transactions)
 *   editor  — viewer + move transactions between profiles
 *   admin   — editor + create/rename/delete/reorder profiles
 */

const DUPLICATE = "A profile with that name already exists";

/** Profiles the user can at least view in the workspace, in sidebar order. */
export async function listProfiles(userId: string, workspaceId: string): Promise<Profile[]> {
  await ensureBootstrap(userId);
  const db = getDb();
  return db
    .select()
    .from(profiles)
    .where(inArray(profiles.id, accessibleProfileIds(userId, workspaceId)))
    .orderBy(asc(profiles.sortOrder), asc(profiles.createdAt));
}

export async function createProfile(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<Profile> {
  const data = parseOrThrow(profileInputSchema, input);
  await ensureBootstrap(userId);
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${profiles.sortOrder}), -1) + 1` })
    .from(profiles)
    .where(eq(profiles.workspaceId, workspaceId));

  try {
    const [row] = await db
      .insert(profiles)
      .values({
        userId,
        workspaceId,
        name: data.name,
        icon: data.icon || null,
        color: data.color || null,
        sortOrder: next ?? 0,
      })
      .returning();
    return row!;
  } catch {
    throw conflict(DUPLICATE);
  }
}

/** Update a profile (requires admin on that profile). Null when none matched. */
export async function updateProfile(
  userId: string,
  id: string,
  input: unknown,
): Promise<Profile | null> {
  const data = parseOrThrow(updateProfileSchema, withId(input, id));
  await requireProfileRole(userId, data.id, "admin");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.icon !== undefined) patch.icon = data.icon || null;
  if (data.color !== undefined) patch.color = data.color || null;

  const db = getDb();
  try {
    const rows = await db
      .update(profiles)
      .set(patch)
      .where(eq(profiles.id, data.id))
      .returning();
    return rows[0] ?? null;
  } catch {
    throw conflict(DUPLICATE);
  }
}

/**
 * Delete a profile (requires admin on it). Throws for a non-UUID id, the
 * workspace's last remaining profile, or a profile that still has
 * transactions. Returns whether a row was removed.
 */
export async function deleteProfile(userId: string, id: string): Promise<boolean> {
  if (!z.string().uuid().safeParse(id).success) {
    throw validationError("Invalid profile");
  }
  const { workspaceId } = await requireProfileRole(userId, id, "admin");
  const db = getDb();

  const [{ total }] = await db
    .select({ total: count() })
    .from(profiles)
    .where(eq(profiles.workspaceId, workspaceId));
  if (total <= 1) throw conflict("You need at least one profile");

  const [{ used }] = await db
    .select({ used: count() })
    .from(transactions)
    .where(eq(transactions.profileId, id));
  if (used > 0) throw conflict("Move this profile's transactions to another profile first");

  const deleted = await db
    .delete(profiles)
    .where(eq(profiles.id, id))
    .returning({ id: profiles.id });
  return deleted.length > 0;
}

/**
 * Move every transaction from one profile to another (requires editor on
 * both; both must be in the same workspace). Returns the count moved.
 */
export async function moveProfileTransactions(
  userId: string,
  fromId: string,
  toId: string,
): Promise<{ moved: number }> {
  const isUuid = z.string().uuid();
  if (!isUuid.safeParse(fromId).success || !isUuid.safeParse(toId).success || fromId === toId) {
    throw validationError("Invalid profiles");
  }
  const [from, to] = await Promise.all([
    requireProfileRole(userId, fromId, "editor"),
    requireProfileRole(userId, toId, "editor"),
  ]);
  if (from.workspaceId !== to.workspaceId) throw validationError("Invalid profiles");

  const db = getDb();
  const moved = await db
    .update(transactions)
    .set({ profileId: toId, updatedAt: new Date() })
    .where(eq(transactions.profileId, fromId))
    .returning({ id: transactions.id });
  return { moved: moved.length };
}

/**
 * Persist the sidebar order (requires editor in the workspace). `ids` is the
 * full ordered list; only profiles of this workspace are touched.
 */
export async function reorderProfiles(
  userId: string,
  workspaceId: string,
  ids: string[],
): Promise<void> {
  const data = parseOrThrow(reorderProfilesSchema, { ids });
  await requireWorkspaceRole(userId, workspaceId, "editor");
  const db = getDb();
  await Promise.all(
    data.ids.map((id, i) =>
      db
        .update(profiles)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(profiles.id, id), eq(profiles.workspaceId, workspaceId))),
    ),
  );
}
