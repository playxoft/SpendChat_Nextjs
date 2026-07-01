"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { transactions, userSettings } from "@/db/schema";
import { ensureBootstrap, requireUser } from "@/lib/auth";
import { inputModeSchema, settingsSchema, type SettingsInput } from "@/lib/validation";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateSettings(input: SettingsInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  }
  await ensureBootstrap(user.id);

  const db = getDb();
  await db
    .update(userSettings)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(userSettings.userId, user.id));

  revalidatePath("/settings");
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
  return { ok: true };
}

export async function updateCurrency(currency: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!settingsSchema.shape.currency.safeParse(currency).success) {
    return { ok: false, error: "Unsupported currency" };
  }
  await ensureBootstrap(user.id);
  const db = getDb();
  await db
    .update(userSettings)
    .set({ currency, updatedAt: new Date() })
    .where(eq(userSettings.userId, user.id));
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
  revalidatePath("/settings");
  return { ok: true };
}

/** Change how the transaction composer lays out its inputs. */
export async function updateInputMode(mode: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = inputModeSchema.safeParse(mode);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input layout" };
  }
  await ensureBootstrap(user.id);
  const db = getDb();
  await db
    .update(userSettings)
    .set({ inputMode: parsed.data, updatedAt: new Date() })
    .where(eq(userSettings.userId, user.id));
  revalidatePath("/app");
  revalidatePath("/settings");
  return { ok: true };
}

/** Wipe every transaction for the user (danger zone). */
export async function deleteAllTransactions(confirm: string): Promise<ActionResult> {
  const user = await requireUser();
  if (confirm !== "DELETE") return { ok: false, error: "Type DELETE to confirm" };
  const db = getDb();
  await db.delete(transactions).where(eq(transactions.userId, user.id));
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
  return { ok: true };
}
