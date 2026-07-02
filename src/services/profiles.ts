import "server-only";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { profiles, transactions } from "@/db/schema";
import { ensureBootstrap } from "@/lib/auth";
import { conflict, validationError } from "@/lib/errors";
import { parseOrThrow, withId } from "@/lib/api-response";
import {
  profileInputSchema,
  reorderProfilesSchema,
  updateProfileSchema,
} from "@/lib/validation";
import type { Profile } from "@/db/schema";

/**
 * Profile business logic shared by the web actions and the REST API. Returns
 * data or throws `ApiError`; all writes are scoped to `userId`.
 */

const DUPLICATE = "A profile with that name already exists";

/** List the user's profiles in sidebar order, bootstrapping the default if needed. */
export async function listProfiles(userId: string): Promise<Profile[]> {
  await ensureBootstrap(userId);
  const db = getDb();
  return db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .orderBy(asc(profiles.sortOrder), asc(profiles.createdAt));
}

export async function createProfile(userId: string, input: unknown): Promise<Profile> {
  const data = parseOrThrow(profileInputSchema, input);
  await ensureBootstrap(userId);
  const db = getDb();

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${profiles.sortOrder}), -1) + 1` })
    .from(profiles)
    .where(eq(profiles.userId, userId));

  try {
    const [row] = await db
      .insert(profiles)
      .values({
        userId,
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

/** Update an owned profile. Returns the row, or null when none matched. */
export async function updateProfile(
  userId: string,
  id: string,
  input: unknown,
): Promise<Profile | null> {
  const data = parseOrThrow(updateProfileSchema, withId(input, id));
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.icon !== undefined) patch.icon = data.icon || null;
  if (data.color !== undefined) patch.color = data.color || null;

  const db = getDb();
  try {
    const rows = await db
      .update(profiles)
      .set(patch)
      .where(and(eq(profiles.id, data.id), eq(profiles.userId, userId)))
      .returning();
    return rows[0] ?? null;
  } catch {
    throw conflict(DUPLICATE);
  }
}

/**
 * Delete an owned profile. Throws for a non-UUID id, the last remaining
 * profile, or a profile that still has transactions. Returns whether a row was
 * removed.
 */
export async function deleteProfile(userId: string, id: string): Promise<boolean> {
  if (!z.string().uuid().safeParse(id).success) {
    throw validationError("Invalid profile");
  }
  const db = getDb();

  const [{ total }] = await db
    .select({ total: count() })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  if (total <= 1) throw conflict("You need at least one profile");

  const [{ used }] = await db
    .select({ used: count() })
    .from(transactions)
    .where(and(eq(transactions.profileId, id), eq(transactions.userId, userId)));
  if (used > 0) throw conflict("Move this profile's transactions to another profile first");

  const deleted = await db
    .delete(profiles)
    .where(and(eq(profiles.id, id), eq(profiles.userId, userId)))
    .returning({ id: profiles.id });
  return deleted.length > 0;
}

/** Move every transaction from one owned profile to another. Returns the count moved. */
export async function moveProfileTransactions(
  userId: string,
  fromId: string,
  toId: string,
): Promise<{ moved: number }> {
  const isUuid = z.string().uuid();
  if (!isUuid.safeParse(fromId).success || !isUuid.safeParse(toId).success || fromId === toId) {
    throw validationError("Invalid profiles");
  }
  const db = getDb();
  const owned = new Set(
    (
      await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.userId, userId))
    ).map((p) => p.id),
  );
  if (!owned.has(fromId) || !owned.has(toId)) throw validationError("Invalid profiles");

  const moved = await db
    .update(transactions)
    .set({ profileId: toId, updatedAt: new Date() })
    .where(and(eq(transactions.profileId, fromId), eq(transactions.userId, userId)))
    .returning({ id: transactions.id });
  return { moved: moved.length };
}

/** Persist the sidebar order. `ids` is the full ordered list of the user's profiles. */
export async function reorderProfiles(userId: string, ids: string[]): Promise<void> {
  const data = parseOrThrow(reorderProfilesSchema, { ids });
  const db = getDb();
  await Promise.all(
    data.ids.map((id, i) =>
      db
        .update(profiles)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(profiles.id, id), eq(profiles.userId, userId))),
    ),
  );
}
