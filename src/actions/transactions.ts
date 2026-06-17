"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { categories, transactions } from "@/db/schema";
import { getUserSettings, requireUser } from "@/lib/auth";
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

export async function addTransaction(input: TransactionInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = transactionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const settings = await getUserSettings(user.id);
  const data = parsed.data;
  const categoryId = await ownedCategoryId(user.id, data.categoryId);

  const db = getDb();
  await db.insert(transactions).values({
    userId: user.id,
    type: data.type,
    amountMinor: toMinorUnits(data.amount, settings.currency),
    categoryId,
    note: data.note?.trim() ? data.note.trim() : null,
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

  const db = getDb();
  await db
    .update(transactions)
    .set({
      type: data.type,
      amountMinor: toMinorUnits(data.amount, settings.currency),
      categoryId,
      note: data.note?.trim() ? data.note.trim() : null,
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

  const values = [];
  for (const d of drafts) {
    const parsed = transactionInputSchema
      .pick({ type: true, amount: true, occurredOn: true })
      .safeParse(d);
    if (!parsed.success) continue;
    const categoryId = d.categoryName
      ? (catMap.get(`${d.type}:${d.categoryName.toLowerCase()}`) ?? null)
      : null;
    values.push({
      userId: user.id,
      type: d.type,
      amountMinor: toMinorUnits(d.amount, settings.currency),
      categoryId,
      note: d.note?.trim() ? d.note.trim() : null,
      occurredOn: d.occurredOn,
    });
  }

  if (values.length === 0) return { ok: false, error: "No valid rows to import" };

  await db.insert(transactions).values(values);
  revalidateApp();
  return { ok: true, count: values.length };
}
