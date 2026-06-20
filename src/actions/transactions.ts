"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { categories, profiles, transactions } from "@/db/schema";
import { ensureBootstrap, getUserSettings, requireUser } from "@/lib/auth";
import { toMinorUnits } from "@/lib/money";
import {
  transactionInputSchema,
  updateTransactionSchema,
  type TransactionInput,
} from "@/lib/validation";
import type { BulkDraft } from "@/lib/bulk-parser";

export type ActionResult =
  | { ok: true; count?: number }
  | { ok: false; error: string };

function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

function revalidateApp() {
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
}

/** Confirm a category id belongs to the user; returns null otherwise. */
async function ownedCategoryId(userId: string, categoryId?: string | null) {
  if (!categoryId) return null;
  const db = getDb();
  const cat = await db.query.categories.findFirst({
    where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
    columns: { id: true },
  });
  return cat?.id ?? null;
}

/**
 * Resolve the profile a transaction belongs to. Validates ownership of the
 * requested profile, falling back to the user's first (default) profile.
 */
async function resolveProfileId(userId: string, profileId?: string | null): Promise<string> {
  const db = getDb();
  if (profileId) {
    const owned = await db.query.profiles.findFirst({
      where: and(eq(profiles.id, profileId), eq(profiles.userId, userId)),
      columns: { id: true },
    });
    if (owned) return owned.id;
  }
  const first = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .orderBy(asc(profiles.sortOrder), asc(profiles.createdAt))
    .limit(1);
  if (first[0]) return first[0].id;
  // No profile yet (shouldn't happen post-bootstrap) — create the default.
  await ensureBootstrap(userId);
  const created = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return created[0]!.id;
}

/** Pick the title, accepting the deprecated `note` alias. */
function pickTitle(data: { title?: string; note?: string }): string | null {
  const t = (data.title ?? "").trim() || (data.note ?? "").trim();
  return t ? t : null;
}

export async function addTransaction(input: TransactionInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = transactionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const settings = await getUserSettings(user.id);
  const data = parsed.data;
  const categoryId = await ownedCategoryId(user.id, data.categoryId);
  const profileId = await resolveProfileId(user.id, data.profileId);

  const db = getDb();
  await db.insert(transactions).values({
    userId: user.id,
    type: data.type,
    amountMinor: toMinorUnits(data.amount, settings.currency),
    categoryId,
    profileId,
    title: pickTitle(data),
    description: data.description?.trim() ? data.description.trim() : null,
    occurredOn: data.occurredOn,
  });

  revalidateApp();
  return { ok: true, count: 1 };
}

export async function updateTransaction(
  input: z.input<typeof updateTransactionSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateTransactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const settings = await getUserSettings(user.id);
  const data = parsed.data;
  const categoryId = await ownedCategoryId(user.id, data.categoryId);
  const profileId = await resolveProfileId(user.id, data.profileId);

  const db = getDb();
  await db
    .update(transactions)
    .set({
      type: data.type,
      amountMinor: toMinorUnits(data.amount, settings.currency),
      categoryId,
      profileId,
      title: pickTitle(data),
      description: data.description?.trim() ? data.description.trim() : null,
      occurredOn: data.occurredOn,
      updatedAt: new Date(),
    })
    .where(and(eq(transactions.id, data.id), eq(transactions.userId, user.id)));

  revalidateApp();
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid transaction" };
  }
  const db = getDb();
  await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)));

  revalidateApp();
  return { ok: true };
}

export async function addBulkTransactions(drafts: BulkDraft[]): Promise<ActionResult> {
  const user = await requireUser();
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return { ok: false, error: "Nothing to import" };
  }
  if (drafts.length > 500) {
    return { ok: false, error: "Too many rows (max 500 at a time)" };
  }

  const settings = await getUserSettings(user.id);
  const db = getDb();

  // Map category names (per kind) to owned ids.
  const userCats = await db
    .select({ id: categories.id, name: categories.name, kind: categories.kind })
    .from(categories)
    .where(eq(categories.userId, user.id));
  const catMap = new Map<string, string>();
  for (const c of userCats) catMap.set(`${c.kind}:${c.name.toLowerCase()}`, c.id);

  // Resolve a profile per draft, defaulting to the user's first profile.
  const defaultProfileId = await resolveProfileId(user.id, undefined);
  const ownedProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, user.id));
  const profileIds = new Set(ownedProfiles.map((p) => p.id));

  const values = [];
  for (const d of drafts) {
    const parsed = transactionInputSchema
      .pick({ type: true, amount: true, occurredOn: true })
      .safeParse(d);
    if (!parsed.success) continue;
    const categoryId = d.categoryName
      ? (catMap.get(`${d.type}:${d.categoryName.toLowerCase()}`) ?? null)
      : null;
    const profileId =
      d.profileId && profileIds.has(d.profileId) ? d.profileId : defaultProfileId;
    values.push({
      userId: user.id,
      type: d.type,
      amountMinor: toMinorUnits(d.amount, settings.currency),
      categoryId,
      profileId,
      title: pickTitle({ title: d.title, note: d.note }),
      description: d.description?.trim() ? d.description.trim() : null,
      occurredOn: d.occurredOn,
    });
  }

  if (values.length === 0) return { ok: false, error: "No valid rows to import" };

  await db.insert(transactions).values(values);
  revalidateApp();
  return { ok: true, count: values.length };
}
