import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  profileAccess,
  profiles,
  transactionAttachments,
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
import { deleteObjects, keyFromPublicUrl } from "@/lib/r2";
import { collectProfileObjectKeys } from "./storage-keys";
import { assertEmailSendAllowed } from "@/lib/email-quota";
import { siteConfig } from "@/lib/site";
import { badRequest, validationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { parseOrThrow } from "@/lib/api-response";
import {
  composerDensitySchema,
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
 * Set how dense the tracker composer is (`ui_prefs.composer.density`).
 *
 * Written as a merge rather than a whole-object write, and that's the point of
 * the column: `||` is a *shallow* jsonb merge, so nesting it once per level sets
 * this one key while leaving every sibling intact — other namespaces beside
 * `composer`, and any composer preference this build doesn't know about (a
 * newer deploy's, or one rolled back). Storing a Zod-parsed object here would
 * quietly erase both, since `z.object` strips unknown keys.
 */
export async function updateComposerDensity(
  userId: string,
  density: string,
): Promise<UserSettings> {
  const parsed = composerDensitySchema.safeParse(density);
  if (!parsed.success) throw validationError("Invalid composer density");
  await ensureBootstrap(userId);
  const db = getDb();
  await db
    .update(userSettings)
    .set({
      uiPrefs: sql`
        ${userSettings.uiPrefs} || jsonb_build_object(
          'composer',
          coalesce(${userSettings.uiPrefs} -> 'composer', '{}'::jsonb)
            || jsonb_build_object('density', ${parsed.data}::text)
        )`,
      updatedAt: new Date(),
    })
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
  // No `userId` in the meta — the request context stamps identity onto every
  // log automatically (see `log-context.ts`).
  logger.info(`Voice languages set to ${codes.length} language(s)`, {
    event: "settings.voice_languages_updated",
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

  // **One transaction, for the same reason `deleteProfile` uses one.** These are
  // eight destructive statements that are only safe together: `transactions
  // .profile_id` is ON DELETE restrict, so emptying a profile and deleting it
  // are separate steps, and a workspace member who files one transaction in
  // between makes the profile delete violate the foreign key. Autocommitted,
  // that left the worst possible outcome — the rows deleted before the throw
  // already gone, the account half-alive, the sweep below skipped so every
  // object orphaned forever, and the user told the deletion failed. Rolled back
  // together it costs nothing but a retry.
  //
  // The sweep itself stays *outside*, after the commit: object storage has no
  // rollback, so deleting bytes for a transaction that then aborts would be the
  // one unrecoverable step in an otherwise recoverable operation.
  const doomedKeys = await db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerId, userId));
    const ownedIds = owned.map((w) => w.id);

    // Every R2 key this account is about to strand, read BEFORE the deletes:
    // nothing cascades in object storage, so once the rows are gone the bytes
    // are unreachable — no screen can list them, no later sweep can find them —
    // while still being stored and still being billed. For a vault that holds
    // title deeds and certificates, "unreachable" is emphatically not
    // "deleted", and an erasure request has to mean the bytes as well.
    const keys: (string | null)[] = [];

    if (ownedIds.length > 0) {
      const ownedProfiles = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(inArray(profiles.workspaceId, ownedIds));
      const profileIds = ownedProfiles.map((p) => p.id);
      if (profileIds.length > 0) {
        keys.push(...(await collectProfileObjectKeys(tx, profileIds)));
        await tx.delete(transactions).where(inArray(transactions.profileId, profileIds));
        await tx.delete(profiles).where(inArray(profiles.id, profileIds));
      }
    }

    // Attachments on transactions this user authored in *other people's*
    // workspaces. The rows cascade off the transaction delete below; the objects
    // are this account's to take with it, since the transaction was.
    const authoredElsewhere = await tx
      .select({
        r2Key: transactionAttachments.r2Key,
        thumbnailKey: transactionAttachments.thumbnailKey,
      })
      .from(transactionAttachments)
      .innerJoin(transactions, eq(transactionAttachments.transactionId, transactions.id))
      .where(eq(transactions.userId, userId));
    keys.push(...authoredElsewhere.flatMap((r) => [r.r2Key, r.thumbnailKey]));

    // The avatar: the one stored object that is a picture of the person, and
    // the one the first version of this sweep missed. It hangs off `users.image`
    // rather than a profile, so no profile-keyed query reaches it, and the row
    // holding the only pointer to it is deleted below. `keyFromPublicUrl`
    // returns null for a Google avatar seeded at sign-in, which lives in
    // someone else's bucket and is not ours to delete.
    const [me] = await tx
      .select({ image: users.image })
      .from(users)
      .where(eq(users.id, userId));
    if (me?.image) keys.push(keyFromPublicUrl(me.image));

    // Transactions the user authored in workspaces shared with them.
    await tx.delete(transactions).where(eq(transactions.userId, userId));
    if (ownedIds.length > 0) {
      // Members/invites cascade with the workspace rows.
      await tx.delete(workspaces).where(inArray(workspaces.id, ownedIds));
    }
    await tx.delete(workspaceMembers).where(eq(workspaceMembers.userId, userId));
    await tx.delete(profileAccess).where(eq(profileAccess.userId, userId));
    await tx.delete(userSettings).where(eq(userSettings.userId, userId));
    // The identity row last (the Firebase credential is deleted client-side).
    await tx.delete(users).where(eq(users.id, userId));

    return { keys, workspaces: ownedIds.length };
  });

  // After the commit, and deliberately not inside it: `deleteObjects` never
  // throws, so a bucket that is unreachable right now can't resurrect an account
  // the user has already been told is gone. A failed sweep leaves the keys for
  // the operator, not the user.
  // Logged after the commit, not inside it: a transaction that fails to commit
  // would otherwise have already announced a deletion that did not happen.
  const objects = doomedKeys.keys.filter((k): k is string => Boolean(k));
  await deleteObjects(objects);
  // `objects`, not the raw array: every row contributes a thumbnail slot whether
  // or not it has one, so the unfiltered length double-counts. This number is
  // the only thing an operator sees in BetterStack's list view, so it has to be
  // the count of objects actually swept.
  logger.info(
    `Account deleted, removing ${doomedKeys.workspaces} owned workspace(s) and ${objects.length} stored object(s)`,
    {
      event: "account.deleted",
      userId,
      workspaces: doomedKeys.workspaces,
      objects: objects.length,
    },
  );
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
