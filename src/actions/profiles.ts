"use server";

import { revalidatePath } from "next/cache";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { profiles, transactions } from "@/db/schema";
import { ensureBootstrap, requireUser } from "@/lib/auth";
import {
  profileInputSchema,
  reorderProfilesSchema,
  updateProfileSchema,
  type ProfileInput,
  type UpdateProfileInput,
} from "@/lib/validation";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

function revalidateApp() {
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
  revalidatePath("/settings");
}

export async function addProfile(input: ProfileInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  await ensureBootstrap(user.id);
  const db = getDb();

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${profiles.sortOrder}), -1) + 1` })
    .from(profiles)
    .where(eq(profiles.userId, user.id));

  try {
    const [row] = await db
      .insert(profiles)
      .values({
        userId: user.id,
        name: parsed.data.name,
        icon: parsed.data.icon || null,
        color: parsed.data.color || null,
        sortOrder: next ?? 0,
      })
      .returning({ id: profiles.id });
    revalidateApp();
    return { ok: true, id: row?.id };
  } catch {
    return { ok: false, error: "A profile with that name already exists" };
  }
}

export async function updateProfile(input: UpdateProfileInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { id, name, icon, color } = parsed.data;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) patch.name = name;
  if (icon !== undefined) patch.icon = icon || null;
  if (color !== undefined) patch.color = color || null;

  const db = getDb();
  try {
    await db
      .update(profiles)
      .set(patch)
      .where(and(eq(profiles.id, id), eq(profiles.userId, user.id)));
  } catch {
    return { ok: false, error: "A profile with that name already exists" };
  }
  revalidateApp();
  return { ok: true };
}

export async function deleteProfile(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid profile" };
  }
  const db = getDb();

  // Keep at least one profile.
  const [{ total }] = await db
    .select({ total: count() })
    .from(profiles)
    .where(eq(profiles.userId, user.id));
  if (total <= 1) {
    return { ok: false, error: "You need at least one profile" };
  }

  // Block deletion while transactions still reference it.
  const [{ used }] = await db
    .select({ used: count() })
    .from(transactions)
    .where(and(eq(transactions.profileId, id), eq(transactions.userId, user.id)));
  if (used > 0) {
    return {
      ok: false,
      error: "Move this profile's transactions to another profile first",
    };
  }

  await db.delete(profiles).where(and(eq(profiles.id, id), eq(profiles.userId, user.id)));
  revalidateApp();
  return { ok: true };
}

/** Move every transaction from one profile to another (both must be owned). */
export async function moveProfileTransactions(
  fromId: string,
  toId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const ids = z.string().uuid();
  if (!ids.safeParse(fromId).success || !ids.safeParse(toId).success || fromId === toId) {
    return { ok: false, error: "Invalid profiles" };
  }
  const db = getDb();
  const owned = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, user.id));
  const ownedIds = new Set(owned.map((p) => p.id));
  if (!ownedIds.has(fromId) || !ownedIds.has(toId)) {
    return { ok: false, error: "Invalid profiles" };
  }
  await db
    .update(transactions)
    .set({ profileId: toId, updatedAt: new Date() })
    .where(and(eq(transactions.profileId, fromId), eq(transactions.userId, user.id)));
  revalidateApp();
  return { ok: true };
}

/** Persist the sidebar order. `ids` is the full ordered list of the user's profiles. */
export async function reorderProfiles(ids: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = reorderProfilesSchema.safeParse({ ids });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const db = getDb();
  await Promise.all(
    parsed.data.ids.map((id, i) =>
      db
        .update(profiles)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(profiles.id, id), eq(profiles.userId, user.id))),
    ),
  );
  revalidateApp();
  return { ok: true };
}

export async function listProfiles() {
  const user = await requireUser();
  await ensureBootstrap(user.id);
  const db = getDb();
  return db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .orderBy(asc(profiles.sortOrder), asc(profiles.createdAt));
}
