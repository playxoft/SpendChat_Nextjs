import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  profileAccess,
  profiles,
  transactions,
  users,
  userSettings,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { ensureBootstrap, getUserSettings } from "@/lib/auth";
import { requireWorkspaceRole } from "@/lib/workspaces";
import { badRequest, validationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { parseOrThrow } from "@/lib/api-response";
import { patchSettingsSchema, inputModeSchema } from "@/lib/validation";
import type { UserSettings } from "@/db/schema";

/**
 * User-settings business logic shared by the web actions and the REST API.
 * These settings follow the user across workspaces (theme, input mode); currency
 * and number format live on the workspace (`services/workspaces.ts`). Returns
 * the updated row (for the API) or throws `ApiError`; scoped to `userId`.
 */

/** Partial update of user settings (REST `PATCH /settings`): theme, input mode. */
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
/**
 * Clear transactions in the current workspace — a workspace-admin action.
 * Deletes **every** transaction in the selected profiles (regardless of who
 * authored it), so a profile is fully wiped. `profileIds` empty = every profile
 * in the workspace; otherwise only the chosen ones (any id not in the workspace
 * is ignored). Categories and settings are kept.
 */
export async function deleteAllTransactions(
  userId: string,
  workspaceId: string,
  confirm: string,
  profileIds: string[] = [],
): Promise<{ deleted: number }> {
  if (confirm !== "DELETE") throw badRequest("Type DELETE to confirm");
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();

  const wsProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.workspaceId, workspaceId));
  const allowed = new Set(wsProfiles.map((p) => p.id));
  const targets =
    profileIds.length === 0
      ? [...allowed]
      : [...new Set(profileIds)].filter((id) => allowed.has(id));
  if (targets.length === 0) throw badRequest("Select at least one profile to clear");

  const deleted = await db
    .delete(transactions)
    .where(inArray(transactions.profileId, targets))
    .returning({ id: transactions.id });
  logger.info(`Cleared ${deleted.length} transactions across ${targets.length} profile(s)`, {
    event: "settings.transactions_cleared",
    workspaceId,
    userId,
    profileCount: targets.length,
    deleted: deleted.length,
  });
  return { deleted: deleted.length };
}

/**
 * Erase everything the user owns in SpendChat: the transactions they wrote,
 * their owned workspaces (including all profiles, categories, and transactions
 * inside — even ones authored by members, all via the workspace cascade), their
 * memberships/grants, and settings. Categories they authored in *other* people's
 * workspaces stay (they belong to that workspace). Requires the exact "DELETE"
 * confirmation. The Firebase account itself is deleted client-side — after this
 * wipe, signing in again starts from a fresh bootstrap.
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
  await db.delete(userSettings).where(eq(userSettings.userId, userId));
  // The identity row last (the Firebase account itself is deleted client-side).
  await db.delete(users).where(eq(users.id, userId));
  logger.info(`Account deleted, removing ${ownedIds.length} owned workspace(s)`, {
    event: "account.deleted",
    userId,
    workspaces: ownedIds.length,
  });
}
