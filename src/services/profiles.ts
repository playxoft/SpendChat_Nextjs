import "server-only";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "@/db";
import { files, profiles, transactionAttachments, transactions } from "@/db/schema";
import { ensureBootstrap } from "@/lib/auth";
import { conflict, validationError } from "@/lib/errors";
import { parseOrThrow, withId } from "@/lib/api-response";
import { deleteObjects } from "@/lib/r2";
import {
  accessibleProfileIds,
  requireProfileRole,
  requireWorkspaceRole,
} from "@/lib/workspaces";
import {
  deleteProfileSchema,
  profileInputSchema,
  reorderProfilesSchema,
  updateProfileSchema,
} from "@/lib/validation";
import type { Profile } from "@/db/schema";

/**
 * Profile business logic shared by the web actions and the REST API. Profiles
 * live in workspaces; RBAC:
 *   viewer  — sees the profile (and its transactions)
 *   editor  — viewer + move transactions between profiles
 *   admin   — editor + create/rename/delete/reorder profiles
 */

const DUPLICATE = "A profile with that name already exists";

/** The handle Drizzle hands a `db.transaction()` callback. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Postgres `foreign_key_violation` — what a concurrent write surfaces as.
 * Drizzle wraps a driver error in its own query error, so the `cause` chain is
 * walked rather than just the thrown value.
 */
function isForeignKeyViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e != null && depth < 5; depth++) {
    if (typeof e === "object" && (e as { code?: unknown }).code === "23503") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * The profile was deleted by someone else between the access check and the
 * delete. Thrown rather than returned so the transaction rolls back: the
 * caller reports "not found", and a disposal that had already run inside it
 * (transactions re-filed under another profile) must not be left committed
 * behind that answer.
 */
class ProfileGone extends Error {}

/** Profiles the user can at least view in the workspace, in sidebar order. */
export async function listProfiles(userId: string, workspaceId: string): Promise<Profile[]> {
  await ensureBootstrap(userId);
  const db = getDb();
  return db
    .select()
    .from(profiles)
    .where(inArray(profiles.id, accessibleProfileIds(userId, workspaceId)))
    .orderBy(asc(profiles.sortOrder), asc(profiles.createdAt));
}

export async function createProfile(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<Profile> {
  const data = parseOrThrow(profileInputSchema, input);
  await ensureBootstrap(userId);
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${profiles.sortOrder}), -1) + 1` })
    .from(profiles)
    .where(eq(profiles.workspaceId, workspaceId));

  try {
    const [row] = await db
      .insert(profiles)
      .values({
        userId,
        workspaceId,
        name: data.name,
        icon: data.icon || null,
        color: data.color || null,
        sortOrder: next ?? 0,
      })
      .returning();
    return row!;
  } catch {
    throw conflict(DUPLICATE);
  }
}

/** Update a profile (requires admin on that profile). Null when none matched. */
export async function updateProfile(
  userId: string,
  id: string,
  input: unknown,
): Promise<Profile | null> {
  const data = parseOrThrow(updateProfileSchema, withId(input, id));
  await requireProfileRole(userId, data.id, "admin");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.icon !== undefined) patch.icon = data.icon || null;
  if (data.color !== undefined) patch.color = data.color || null;

  const db = getDb();
  try {
    const rows = await db
      .update(profiles)
      .set(patch)
      .where(eq(profiles.id, data.id))
      .returning();
    return rows[0] ?? null;
  } catch {
    throw conflict(DUPLICATE);
  }
}

/** What a delete would take with it, so the confirm step can say the numbers. */
export type ProfileDeletionImpact = {
  /** Transactions filed under the profile — deletable or movable. */
  transactions: number;
  /** Vault files stored under it. These always go with the profile. */
  files: number;
  /** Receipts on those transactions. They follow the transactions' fate. */
  attachments: number;
};

/**
 * Counts for the delete confirmation (requires admin, like the delete itself).
 *
 * `files` is here because a profile delete cascades its vault away whichever
 * option the user picks — the dialog has to say so rather than let a folder of
 * documents disappear behind a sentence about transactions.
 *
 * `attachments` is separate from `files` rather than folded into it because the
 * two behave differently: the vault always goes, while receipts follow their
 * transactions (destroyed on `delete`, re-filed on `move`). Counting them at
 * all matters — a profile can hold no vault rows and forty receipts, and those
 * forty are visible to the user in the vault's "Transaction attachments"
 * folder, so a dialog that reports `files: 0` is under-reporting what it is
 * about to destroy. Counted through the parent transaction, exactly like the
 * sweep in `deleteProfile`, so both agree on what belongs to this profile.
 */
export async function getProfileDeletionImpact(
  userId: string,
  id: string,
): Promise<ProfileDeletionImpact> {
  if (!z.string().uuid().safeParse(id).success) {
    throw validationError("Invalid profile");
  }
  await requireProfileRole(userId, id, "admin");
  const db = getDb();

  const [[txns], [vault], [atts]] = await Promise.all([
    db.select({ total: count() }).from(transactions).where(eq(transactions.profileId, id)),
    db.select({ total: count() }).from(files).where(eq(files.profileId, id)),
    db
      .select({ total: count() })
      .from(transactionAttachments)
      .innerJoin(transactions, eq(transactionAttachments.transactionId, transactions.id))
      .where(eq(transactions.profileId, id)),
  ]);
  return {
    transactions: txns?.total ?? 0,
    files: vault?.total ?? 0,
    attachments: atts?.total ?? 0,
  };
}

/**
 * Re-file every transaction of `fromId` under `toId`, receipts included.
 * Callers do the access checks; this is the write half, always inside a
 * transaction.
 *
 * The attachment rows are matched **through their parent transaction**, not
 * through their own denormalized `profile_id`, and updated *before* the
 * transactions move (afterwards there is nothing left in `fromId` to join
 * against). A row whose column had already drifted — an older
 * single-transaction move left it behind — is picked up by the join and healed
 * on the way past, instead of staying behind on a profile its transaction no
 * longer lives in and being destroyed with it.
 */
async function reprofileTransactions(tx: Tx, fromId: string, toId: string): Promise<number> {
  await tx
    .update(transactionAttachments)
    .set({ profileId: toId })
    .from(transactions)
    .where(
      and(
        eq(transactionAttachments.transactionId, transactions.id),
        eq(transactions.profileId, fromId),
      ),
    );
  const moved = await tx
    .update(transactions)
    .set({ profileId: toId, updatedAt: new Date() })
    .where(eq(transactions.profileId, fromId))
    .returning({ id: transactions.id });
  return moved.length;
}

/**
 * Point any attachment row still naming this profile at the profile its
 * transaction actually lives in.
 *
 * `transaction_attachments.profile_id` is denormalized *and* `ON DELETE
 * cascade`, so a row stranded by an older single-transaction profile change is
 * destroyed — row and, once the sweep below reads it, the R2 object too — when
 * the profile it still names is deleted. The transaction survives in its new
 * profile with its receipt gone from both the database and storage, which is
 * unrecoverable. One statement here means the delete can't do that to a live
 * transaction, whether or not the backfill migration has been applied.
 */
async function healStrandedAttachments(tx: Tx, profileId: string): Promise<void> {
  await tx
    .update(transactionAttachments)
    .set({ profileId: sql`${transactions.profileId}` })
    .from(transactions)
    .where(
      and(
        eq(transactionAttachments.transactionId, transactions.id),
        eq(transactionAttachments.profileId, profileId),
        ne(transactions.profileId, profileId),
      ),
    );
}

/**
 * Delete a profile (requires admin on it), with the caller deciding what
 * happens to the transactions filed under it — `delete`, `move` to another
 * profile, or `reject` (the default: refuse while any remain). Throws for a
 * non-UUID id or the workspace's last remaining profile. Returns whether a row
 * was removed.
 *
 * Whatever the choice, the profile's **vault files** go with it (the `files` /
 * `folders` / `file_tags` / `file_shares` rows all cascade). The R2 objects
 * behind those rows don't — nothing cascades in object storage — so every key
 * is read *before* the delete and swept after: once the rows are gone the bytes
 * are unreachable and would bill forever.
 *
 * **The whole database half runs in one transaction**, because it is several
 * statements that are only safe together. `transactions.profile_id` is ON
 * DELETE restrict, so emptying the profile and deleting it are separate
 * statements; autocommitted, an editor who files one transaction into the
 * profile while a bulk delete of 50k rows is in flight makes the profile delete
 * violate the foreign key — leaving the 50k rows destroyed, the profile intact,
 * the sweep skipped (so their objects orphan forever) and the caller told the
 * operation failed. Rolled back together, that same race costs nothing but a
 * retry. The sweep runs only after the commit, since deleting bytes is the one
 * step no rollback can undo.
 */
export async function deleteProfile(
  userId: string,
  id: string,
  options?: unknown,
): Promise<boolean> {
  if (!z.string().uuid().safeParse(id).success) {
    throw validationError("Invalid profile");
  }
  const disposal = parseOrThrow(deleteProfileSchema, options ?? {});
  const { workspaceId } = await requireProfileRole(userId, id, "admin");

  // Access checks read their own rows and don't have to be inside the
  // transaction; doing them first keeps it short.
  if (disposal.transactions === "move") {
    const toId = disposal.toProfileId!;
    if (toId === id) throw validationError("Invalid profiles");
    const to = await requireProfileRole(userId, toId, "editor");
    if (to.workspaceId !== workspaceId) throw validationError("Invalid profiles");
  }

  const db = getDb();
  let doomedKeys: (string | null)[];
  try {
    doomedKeys = await db.transaction(async (tx) => {
      const [{ total }] = await tx
        .select({ total: count() })
        .from(profiles)
        .where(eq(profiles.workspaceId, workspaceId));
      if (total <= 1) throw conflict("You need at least one profile");

      if (disposal.transactions === "move") {
        await reprofileTransactions(tx, id, disposal.toProfileId!);
      } else if (disposal.transactions === "reject") {
        const [{ used }] = await tx
          .select({ used: count() })
          .from(transactions)
          .where(eq(transactions.profileId, id));
        if (used > 0) {
          throw conflict("Move this profile's transactions to another profile first");
        }
      }

      await healStrandedAttachments(tx, id);

      // Keys to sweep, read while the rows are still there. Attachments are
      // selected **through their parent transaction** rather than through their
      // own `profile_id`: that column is denormalized and can be stale, and a
      // sweep keyed on it deletes the bytes behind a transaction that is still
      // alive in another profile. Joined to the parent it is exact in all three
      // modes — after `move` the transactions are already re-filed so nothing
      // matches, on `delete` they are still here and every key is collected,
      // and `reject` only gets this far when there were none.
      const doomedAttachments = await tx
        .select({
          r2Key: transactionAttachments.r2Key,
          thumbnailKey: transactionAttachments.thumbnailKey,
        })
        .from(transactionAttachments)
        .innerJoin(transactions, eq(transactionAttachments.transactionId, transactions.id))
        .where(eq(transactions.profileId, id));
      const doomedFiles = await tx
        .select({ r2Key: files.r2Key, thumbnailKey: files.thumbnailKey })
        .from(files)
        .where(eq(files.profileId, id));

      // `transactions.profile_id` is ON DELETE restrict — the rows have to go
      // explicitly (their attachment rows cascade off them), or the delete below
      // fails. Only reachable on the `delete` path; the others left none behind.
      if (disposal.transactions === "delete") {
        await tx.delete(transactions).where(eq(transactions.profileId, id));
      }

      const deleted = await tx
        .delete(profiles)
        .where(eq(profiles.id, id))
        .returning({ id: profiles.id });
      if (deleted.length === 0) throw new ProfileGone();

      return [...doomedAttachments, ...doomedFiles].flatMap((row) => [
        row.r2Key,
        row.thumbnailKey,
      ]);
    });
  } catch (err) {
    if (err instanceof ProfileGone) return false;
    // The profile only still has referencing rows if something was written to
    // it after this transaction counted them. Nothing was lost — the rollback
    // saw to that — so say what happened instead of a 500.
    if (isForeignKeyViolation(err)) {
      throw conflict("Something was added to this profile while it was being deleted — try again");
    }
    throw err;
  }

  await deleteObjects(doomedKeys);
  return true;
}

/**
 * Move every transaction from one profile to another (requires editor on
 * both; both must be in the same workspace). Returns the count moved.
 *
 * Attachment rows carry a denormalized `profile_id` (that's what scopes an
 * attachment read), so they're re-pointed in the same breath — leaving them
 * behind would strand every receipt on the old profile and destroy them the
 * moment it's deleted. Both statements share a transaction so a failure can't
 * commit half of that.
 */
export async function moveProfileTransactions(
  userId: string,
  fromId: string,
  toId: string,
): Promise<{ moved: number }> {
  const isUuid = z.string().uuid();
  if (!isUuid.safeParse(fromId).success || !isUuid.safeParse(toId).success || fromId === toId) {
    throw validationError("Invalid profiles");
  }
  const [from, to] = await Promise.all([
    requireProfileRole(userId, fromId, "editor"),
    requireProfileRole(userId, toId, "editor"),
  ]);
  if (from.workspaceId !== to.workspaceId) throw validationError("Invalid profiles");

  const db = getDb();
  const moved = await db.transaction((tx) => reprofileTransactions(tx, fromId, toId));
  return { moved };
}

/**
 * Persist the sidebar order (requires admin in the workspace, like every other
 * profile-management op). `ids` is the full ordered list; only profiles of
 * this workspace are touched.
 */
export async function reorderProfiles(
  userId: string,
  workspaceId: string,
  ids: string[],
): Promise<void> {
  const data = parseOrThrow(reorderProfilesSchema, { ids });
  await requireWorkspaceRole(userId, workspaceId, "admin");
  const db = getDb();
  await Promise.all(
    data.ids.map((id, i) =>
      db
        .update(profiles)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(profiles.id, id), eq(profiles.workspaceId, workspaceId))),
    ),
  );
}
