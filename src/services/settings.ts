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
import { findUserById } from "@/lib/directory";
import { sendEmail } from "@/lib/email";
import { assertEmailSendAllowed } from "@/lib/email-quota";
import { siteConfig } from "@/lib/site";
import { badRequest, validationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { parseOrThrow } from "@/lib/api-response";
import {
  patchSettingsSchema,
  inputModeSchema,
  updateAccountNameSchema,
  voiceLanguagesSchema,
} from "@/lib/validation";
import { normalizeVoiceLanguages } from "@/lib/voice-languages";
import type { UserSettings } from "@/db/schema";

/**
 * User-settings business logic shared by the web actions and the REST API.
 * These settings follow the user across workspaces (theme, input mode); currency
 * and number format live on the workspace (`services/workspaces.ts`). Returns
 * the updated row (for the API) or throws `ApiError`; scoped to `userId`.
 */

/** Partial update of user settings (REST `PATCH /settings`): theme, input mode,
 * voice languages. Voice codes go through the same catalogue normalization as
 * the web picker — unknown codes are dropped, an empty list restores the
 * default — so the stored value can never be one the prompt won't accept. */
export async function patchSettings(userId: string, input: unknown): Promise<UserSettings> {
  const { voiceLanguages, ...data } = parseOrThrow(patchSettingsSchema, input);
  await ensureBootstrap(userId);
  const db = getDb();
  await db
    .update(userSettings)
    .set({
      ...data,
      ...(voiceLanguages !== undefined
        ? { voiceLanguages: normalizeVoiceLanguages(voiceLanguages) }
        : {}),
      updatedAt: new Date(),
    })
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
 * Set the languages voice entry expects. Zod checks the shape; the catalogue
 * decides which codes are real, dedupes them and caps the count — so an unknown
 * or repeated code is dropped rather than rejected, and clearing the list falls
 * back to the default instead of storing an empty one.
 */
export async function updateVoiceLanguages(
  userId: string,
  languages: unknown,
): Promise<UserSettings> {
  const parsed = voiceLanguagesSchema.safeParse(languages);
  if (!parsed.success) throw validationError("Invalid language selection");
  const codes = normalizeVoiceLanguages(parsed.data);
  await ensureBootstrap(userId);
  const db = getDb();
  await db
    .update(userSettings)
    .set({ voiceLanguages: codes, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
  logger.info(`Voice languages set to ${codes.length} language(s)`, {
    event: "settings.voice_languages_updated",
    userId,
    count: codes.length,
  });
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

/**
 * Update the user's own display name (`users.name`). Once set here, the hourly
 * session refresh (`syncUserProfile`) no longer overwrites it from the Google
 * token — the `coalesce` there keeps the user's value.
 */
export async function updateAccountName(userId: string, input: unknown): Promise<{ name: string }> {
  const { name } = parseOrThrow(updateAccountNameSchema, input);
  const db = getDb();
  await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, userId));
  logger.info("Account display name updated", { event: "account.name_updated", userId });
  return { name };
}

/**
 * Point the user's avatar at `url` (an object we just stored in R2) or clear it
 * (`null`, on removal). Returns the *previous* image URL so the caller can
 * best-effort delete the now-orphaned R2 object. Read-then-write because
 * Postgres `UPDATE … RETURNING` yields the new value, not the old.
 */
export async function setUserImage(
  userId: string,
  url: string | null,
): Promise<{ previousUrl: string | null }> {
  const db = getDb();
  const [existing] = await db
    .select({ image: users.image })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  await db.update(users).set({ image: url, updatedAt: new Date() }).where(eq(users.id, userId));
  logger.info(url ? "Account avatar updated" : "Account avatar removed", {
    event: url ? "account.avatar_updated" : "account.avatar_removed",
    userId,
  });
  return { previousUrl: existing?.image ?? null };
}

/** Security notice body — no user data is interpolated, so no escaping needed. */
function passwordChangedEmail() {
  return {
    subject: `Your ${siteConfig.name} password was changed`,
    html:
      `<p>Your <b>${siteConfig.name}</b> password was just changed.</p>` +
      `<p>If this was you, no action is needed. If you didn't change it, ` +
      `<a href="${siteConfig.url}/forgot-password">reset your password</a> right ` +
      `away to secure your account.</p>`,
  };
}

/**
 * Email the user that their password was created/changed. Called after the
 * Firebase Web-SDK password operation succeeds client-side — the recipient is
 * always the authenticated user's own address (never a caller-chosen one).
 * Best-effort: the password is already changed, so a missing email or a spent
 * hourly quota must not surface as a failure.
 */
export async function notifyPasswordChanged(userId: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user?.email) return;
  try {
    await assertEmailSendAllowed(
      userId,
      "password_changed",
      "Too many security emails in the last hour — try again later",
    );
  } catch {
    logger.warn("Password-changed email skipped after hitting the hourly cap", {
      event: "account.password_email_skipped",
      userId,
    });
    return;
  }
  sendEmail({ to: user.email, ...passwordChangedEmail() });
  logger.info("Password-changed notification queued", {
    event: "account.password_changed",
    userId,
  });
}
