import "server-only";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { files, profiles, transactionAttachments, transactions } from "@/db/schema";
import { ensureBootstrap } from "@/lib/auth";
import { conflict, validationError } from "@/lib/errors";
import { parseOrThrow, withId } from "@/lib/api-response";
import { deleteObject } from "@/lib/r2";
import {
  accessibleProfileIds,
  requireProfileRole,
  requireWorkspaceRole,
} from "@/lib/workspaces";
import {
  deleteProfileSchema,
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

/** What a delete would take with it, so the confirm step can say the numbers. */
export type ProfileDeletionImpact = {
  /** Transactions filed under the profile — deletable or movable. */
  transactions: number;
  /** Vault files stored under it. These always go with the profile. */
  files: number;
};

/**
 * Counts for the delete confirmation (requires admin, like the delete itself).
 *
 * `files` is here because a profile delete cascades its vault away whichever
 * option the user picks — the dialog has to say so rather than let a folder of
 * documents disappear behind a sentence about transactions.
 */
export async function getProfileDeletionImpact(
  userId: string,
  id: string,
): Promise<ProfileDeletionImpact> {
  if (!z.string().uuid().safeParse(id).success) {
    throw validationError("Invalid profile");
  }
  await requireProfileRole(userId, id, "admin");
  const db = getDb();

  const [[txns], [vault]] = await Promise.all([
    db.select({ total: count() }).from(transactions).where(eq(transactions.profileId, id)),
    db.select({ total: count() }).from(files).where(eq(files.profileId, id)),
  ]);
  return { transactions: txns?.total ?? 0, files: vault?.total ?? 0 };
}

/**
 * Delete a profile (requires admin on it), with the caller deciding what
 * happens to the transactions filed under it — `delete`, `move` to another
 * profile, or `reject` (the default: refuse while any remain). Throws for a
 * non-UUID id or the workspace's last remaining profile. Returns whether a row
 * was removed.
 *
 * Whatever the choice, the profile's **vault files** go with it (the `files` /
 * `folders` / `file_tags` / `file_shares` rows all cascade). The R2 objects
 * behind those rows don't — nothing cascades in object storage — so every key
 * is read *before* the delete and swept after: once the rows are gone the bytes
 * are unreachable and would bill forever.
 */
export async function deleteProfile(
  userId: string,
  id: string,
  options?: unknown,
): Promise<boolean> {
  if (!z.string().uuid().safeParse(id).success) {
    throw validationError("Invalid profile");
  }
  const disposal = parseOrThrow(deleteProfileSchema, options ?? {});
  const { workspaceId } = await requireProfileRole(userId, id, "admin");
  const db = getDb();

  const [{ total }] = await db
    .select({ total: count() })
    .from(profiles)
    .where(eq(profiles.workspaceId, workspaceId));
  if (total <= 1) throw conflict("You need at least one profile");

  if (disposal.transactions === "move") {
    // Re-files the attachments too, so they survive with their transactions.
    await moveProfileTransactions(userId, id, disposal.toProfileId!);
  } else if (disposal.transactions === "reject") {
    const [{ used }] = await db
      .select({ used: count() })
      .from(transactions)
      .where(eq(transactions.profileId, id));
    if (used > 0) throw conflict("Move this profile's transactions to another profile first");
  }

  // Everything still pointing at the profile dies with it: whatever attachments
  // remain (the `delete` path's, since `move` re-pointed the rest) plus the
  // whole vault. Collect the keys while the rows are still readable.
  const [doomedAttachments, doomedFiles] = await Promise.all([
    db
      .select({
        r2Key: transactionAttachments.r2Key,
        thumbnailKey: transactionAttachments.thumbnailKey,
      })
      .from(transactionAttachments)
      .where(eq(transactionAttachments.profileId, id)),
    db
      .select({ r2Key: files.r2Key, thumbnailKey: files.thumbnailKey })
      .from(files)
      .where(eq(files.profileId, id)),
  ]);

  // `transactions.profile_id` is ON DELETE RESTRICT — the rows have to go
  // explicitly (their attachment rows cascade off them), or the delete below
  // fails. Only reachable on the `delete` path; the others left none behind.
  if (disposal.transactions === "delete") {
    await db.delete(transactions).where(eq(transactions.profileId, id));
  }

  const deleted = await db
    .delete(profiles)
    .where(eq(profiles.id, id))
    .returning({ id: profiles.id });
  if (deleted.length === 0) return false;

  for (const row of [...doomedAttachments, ...doomedFiles]) {
    await deleteObject(row.r2Key);
    if (row.thumbnailKey) await deleteObject(row.thumbnailKey);
  }
  return true;
}

/**
 * Move every transaction from one profile to another (requires editor on
 * both; both must be in the same workspace). Returns the count moved.
 *
 * Attachment rows carry a denormalized `profile_id` (that's what scopes an
 * attachment read), so they're re-pointed in the same breath — leaving them
 * behind would strand every receipt on the old profile and destroy them the
 * moment it's deleted.
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
  await db
    .update(transactionAttachments)
    .set({ profileId: toId })
    .where(eq(transactionAttachments.profileId, fromId));
  return { moved: moved.length };
}

/**
 * Persist the sidebar order (requires admin in the workspace, like every other
 * profile-management op). `ids` is the full ordered list; only profiles of
 * this workspace are touched.
 */
export async function reorderProfiles(
  userId: string,
  workspaceId: string,
  ids: string[],
): Promise<void> {
  const data = parseOrThrow(reorderProfilesSchema, { ids });
  await requireWorkspaceRole(userId, workspaceId, "admin");
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
