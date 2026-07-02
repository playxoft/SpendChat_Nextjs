import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { transactions, userSettings } from "@/db/schema";
import { ensureBootstrap, getUserSettings } from "@/lib/auth";
import { badRequest, validationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/api-response";
import { patchSettingsSchema, settingsSchema, inputModeSchema } from "@/lib/validation";
import type { UserSettings } from "@/db/schema";

/**
 * Settings business logic shared by the web actions and the REST API. Returns
 * the updated row (for the API) or throws `ApiError`; scoped to `userId`.
 */

/** Full replace of currency/locale/theme (web settings form). */
export async function updateSettings(userId: string, input: unknown): Promise<UserSettings> {
  const data = parseOrThrow(settingsSchema, input);
  await ensureBootstrap(userId);
  const db = getDb();
  await db
    .update(userSettings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
  return getUserSettings(userId);
}

/** Partial update of any settings fields (REST `PATCH /settings`). */
export async function patchSettings(userId: string, input: unknown): Promise<UserSettings> {
  const data = parseOrThrow(patchSettingsSchema, input);
  await ensureBootstrap(userId);
  const db = getDb();
  await db
    .update(userSettings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
  return getUserSettings(userId);
}

export async function updateCurrency(userId: string, currency: string): Promise<UserSettings> {
  if (!settingsSchema.shape.currency.safeParse(currency).success) {
    throw validationError("Unsupported currency");
  }
  await ensureBootstrap(userId);
  const db = getDb();
  await db
    .update(userSettings)
    .set({ currency, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
  return getUserSettings(userId);
}

export async function updateInputMode(userId: string, mode: string): Promise<UserSettings> {
  const parsed = inputModeSchema.safeParse(mode);
  if (!parsed.success) throw validationError("Invalid input layout");
  await ensureBootstrap(userId);
  const db = getDb();
  await db
    .update(userSettings)
    .set({ inputMode: parsed.data, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
  return getUserSettings(userId);
}

/** Wipe every transaction for the user. Requires the exact "DELETE" confirmation. */
export async function deleteAllTransactions(
  userId: string,
  confirm: string,
): Promise<{ deleted: number }> {
  if (confirm !== "DELETE") throw badRequest("Type DELETE to confirm");
  const db = getDb();
  const deleted = await db
    .delete(transactions)
    .where(eq(transactions.userId, userId))
    .returning({ id: transactions.id });
  return { deleted: deleted.length };
}
