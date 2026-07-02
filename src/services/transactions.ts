import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, profiles, transactions } from "@/db/schema";
import { ensureBootstrap, getUserSettings } from "@/lib/auth";
import { badRequest, validationError } from "@/lib/errors";
import { toMinorUnits } from "@/lib/money";
import { getTransactionById, type TransactionRow } from "@/lib/queries";
import { parseOrThrow, withId } from "@/lib/api-response";
import {
  transactionInputSchema,
  updateTransactionSchema,
  bulkTransactionsSchema,
} from "@/lib/validation";
import type { BulkDraft } from "@/lib/bulk-parser";
import { z } from "zod";

/**
 * Transaction business logic, shared by the web server actions (`src/actions`)
 * and the mobile REST API (`src/app/api/v1`). Functions take a `userId` and
 * validated/raw input, enforce ownership + the money/currency rules, and
 * either return data or throw an `ApiError`. They never touch Next.js caching
 * or auth — callers own that. Every write is scoped to `userId`.
 */

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

/** Create a transaction; returns the created row (joined). Throws on invalid input. */
export async function createTransaction(
  userId: string,
  input: unknown,
): Promise<TransactionRow> {
  const data = parseOrThrow(transactionInputSchema, input);
  const settings = await getUserSettings(userId);
  const categoryId = await ownedCategoryId(userId, data.categoryId);
  const profileId = await resolveProfileId(userId, data.profileId);

  const db = getDb();
  const [row] = await db
    .insert(transactions)
    .values({
      userId,
      type: data.type,
      amountMinor: toMinorUnits(data.amount, settings.currency),
      categoryId,
      profileId,
      title: pickTitle(data),
      description: data.description?.trim() ? data.description.trim() : null,
      occurredOn: data.occurredOn,
    })
    .returning({ id: transactions.id });

  const created = await getTransactionById(userId, row!.id);
  return created!;
}

/**
 * Update an owned transaction. Returns the updated row, or `null` when no row
 * matched (unknown id / not owned) — callers decide whether that is a 404
 * (API) or a silent no-op (web action). Throws on invalid input.
 */
export async function updateTransaction(
  userId: string,
  id: string,
  input: unknown,
): Promise<TransactionRow | null> {
  const data = parseOrThrow(updateTransactionSchema, withId(input, id));
  const settings = await getUserSettings(userId);
  const categoryId = await ownedCategoryId(userId, data.categoryId);
  const profileId = await resolveProfileId(userId, data.profileId);

  const db = getDb();
  const updated = await db
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
    .where(and(eq(transactions.id, data.id), eq(transactions.userId, userId)))
    .returning({ id: transactions.id });

  if (updated.length === 0) return null;
  return getTransactionById(userId, data.id);
}

/**
 * Delete an owned transaction. Returns whether a row was removed. Throws a
 * validation error for a non-UUID id (message matches the web action).
 */
export async function deleteTransaction(userId: string, id: string): Promise<boolean> {
  if (!z.string().uuid().safeParse(id).success) {
    throw validationError("Invalid transaction");
  }
  const db = getDb();
  const deleted = await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning({ id: transactions.id });
  return deleted.length > 0;
}

/**
 * Insert many transactions from validated API input (`{ items: [...] }`,
 * category referenced by id). Returns the number inserted.
 */
export async function createManyTransactions(
  userId: string,
  input: unknown,
): Promise<{ count: number }> {
  const { items } = parseOrThrow(bulkTransactionsSchema, input);
  const settings = await getUserSettings(userId);
  const db = getDb();

  const ownedCats = new Set(
    (
      await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.userId, userId))
    ).map((c) => c.id),
  );
  const defaultProfileId = await resolveProfileId(userId, undefined);
  const ownedProfiles = new Set(
    (
      await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.userId, userId))
    ).map((p) => p.id),
  );

  const values = items.map((d) => ({
    userId,
    type: d.type,
    amountMinor: toMinorUnits(d.amount, settings.currency),
    categoryId: d.categoryId && ownedCats.has(d.categoryId) ? d.categoryId : null,
    profileId: d.profileId && ownedProfiles.has(d.profileId) ? d.profileId : defaultProfileId,
    title: pickTitle(d),
    description: d.description?.trim() ? d.description.trim() : null,
    occurredOn: d.occurredOn,
  }));

  await db.insert(transactions).values(values);
  return { count: values.length };
}

/**
 * Import transactions from free-form drafts (CSV/table paste), resolving
 * category by *name* + kind. Used by the web bulk-add flow. Skips individually
 * invalid rows; throws (with the web action's messages) for whole-batch guards.
 */
export async function createBulkFromDrafts(
  userId: string,
  drafts: BulkDraft[],
): Promise<{ count: number }> {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    throw badRequest("Nothing to import");
  }
  if (drafts.length > 500) {
    throw badRequest("Too many rows (max 500 at a time)");
  }

  const settings = await getUserSettings(userId);
  const db = getDb();

  const userCats = await db
    .select({ id: categories.id, name: categories.name, kind: categories.kind })
    .from(categories)
    .where(eq(categories.userId, userId));
  const catMap = new Map<string, string>();
  for (const c of userCats) catMap.set(`${c.kind}:${c.name.toLowerCase()}`, c.id);

  const defaultProfileId = await resolveProfileId(userId, undefined);
  const ownedProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId));
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
      userId,
      type: d.type,
      amountMinor: toMinorUnits(d.amount, settings.currency),
      categoryId,
      profileId,
      title: pickTitle({ title: d.title, note: d.note }),
      description: d.description?.trim() ? d.description.trim() : null,
      occurredOn: d.occurredOn,
    });
  }

  if (values.length === 0) throw badRequest("No valid rows to import");

  await db.insert(transactions).values(values);
  return { count: values.length };
}
