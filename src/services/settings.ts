import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  profileAccess,
  profiles,
  transactions,
  users,
  userSettings,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { ensureBootstrap, getUserSettings } from "@/lib/auth";
import { accessibleProfileIds } from "@/lib/workspaces";
import { badRequest, validationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
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

/**
 * Wipe the transactions the user authored in the *current* workspace — and only
 * in profiles they can still write to (editor+). `transactions.user_id` alone
 * is attribution, not access: without the workspace/role scope, a demoted or
 * removed collaborator could destroy rows inside someone else's workspace on
 * the strength of past authorship. Requires the exact "DELETE" confirmation.
 */
export async function deleteAllTransactions(
  userId: string,
  workspaceId: string,
  confirm: string,
): Promise<{ deleted: number }> {
  if (confirm !== "DELETE") throw badRequest("Type DELETE to confirm");
  const db = getDb();
  const deleted = await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        inArray(transactions.profileId, accessibleProfileIds(userId, workspaceId, "editor")),
      ),
    )
    .returning({ id: transactions.id });
  return { deleted: deleted.length };
}

/**
 * Erase everything the user owns in SpendChat: the transactions they wrote,
 * their owned workspaces (including all profiles and transactions inside,
 * even ones written by members), their memberships/grants, categories, and
 * settings. Requires the exact "DELETE" confirmation. The Neon Auth account
 * itself is managed by Neon — after this wipe, signing in again starts from a
 * fresh bootstrap.
 */
export async function deleteAccount(userId: string, confirm: string): Promise<void> {
  if (confirm !== "DELETE") throw badRequest("Type DELETE to confirm");
  const db = getDb();

  const owned = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.ownerId, userId));
  const ownedIds = owned.map((w) => w.id);

  if (ownedIds.length > 0) {
    const ownedProfiles = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(inArray(profiles.workspaceId, ownedIds));
    const profileIds = ownedProfiles.map((p) => p.id);
    if (profileIds.length > 0) {
      await db.delete(transactions).where(inArray(transactions.profileId, profileIds));
      await db.delete(profiles).where(inArray(profiles.id, profileIds));
    }
  }

  // Transactions the user authored in workspaces shared with them.
  await db.delete(transactions).where(eq(transactions.userId, userId));
  if (ownedIds.length > 0) {
    // Members/invites cascade with the workspace rows.
    await db.delete(workspaces).where(inArray(workspaces.id, ownedIds));
  }
  await db.delete(workspaceMembers).where(eq(workspaceMembers.userId, userId));
  await db.delete(profileAccess).where(eq(profileAccess.userId, userId));
  await db.delete(categories).where(eq(categories.userId, userId));
  await db.delete(userSettings).where(eq(userSettings.userId, userId));
  // The identity row last (the Firebase account itself is deleted client-side).
  await db.delete(users).where(eq(users.id, userId));
  logger.info("account.deleted", { userId, workspaces: ownedIds.length });
}
