import "server-only";
import { and, asc, count, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb, type Db } from "@/db";
import {
  fileShares,
  fileTags,
  files,
  folders,
  profiles,
  transactionAttachments,
  transactions,
} from "@/db/schema";
import { ensureBootstrap } from "@/lib/auth";
import { conflict, validationError } from "@/lib/errors";
import { parseOrThrow, withId } from "@/lib/api-response";
import { deleteObjects } from "@/lib/r2";
import { collectProfileObjectKeys, forProfile } from "./storage-keys";
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
  /** Vault files stored under it. Deleted with the profile, or moved with it. */
  files: number;
  /** Receipts on those transactions. They follow the transactions' fate. */
  attachments: number;
};

/**
 * Counts for the delete confirmation (requires admin, like the delete itself).
 *
 * All three follow the caller's disposal: `delete` destroys them, `move`
 * re-files every one under the destination profile. They stay separate numbers
 * because they're separate things to the user — transactions in the tracker,
 * receipts hanging off those transactions, documents in the vault — and a
 * dialog that says "12 transactions" while quietly taking forty receipts and a
 * folder of documents with them is not describing what it is about to do.
 *
 * Counting `files` at all matters for the same reason `attachments` does: a
 * profile can hold no vault rows and forty receipts, or no transactions and a
 * full vault, and either way the number the user is shown has to be the number
 * that moves. `attachments` is counted through the parent transaction, exactly
 * like the sweep in `deleteProfile`, so the two agree on what belongs here.
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
 * Move a profile's whole vault — tags, folders, files and share links — to
 * another profile.
 *
 * Only `deleteProfile`'s `move` disposal calls this, because only there is the
 * source profile going away: leaving its documents behind would cascade them
 * into nothing. `POST /profiles/{id}/move` deliberately does *not*, since that
 * re-files transactions between two profiles that both keep existing, and a
 * vault belongs to the profile it was filed under.
 *
 * Two unique indexes make this more than four UPDATEs — see each step.
 */
async function reprofileVault(tx: Tx, fromId: string, toId: string): Promise<void> {
  // Tags first, because files and folders reference them by id and would
  // otherwise be left pointing at rows that move out from under them.
  //
  // `file_tags` is unique on (profile_id, lower(name)), so a source tag whose
  // name already exists in the destination can't simply be re-pointed. Those
  // merge: every reference is rewritten to the destination's tag and the source
  // row dropped, so a file tagged "Receipts" stays tagged "Receipts" instead of
  // gaining a second tag of the same name.
  const destTags = alias(fileTags, "dest_tags");
  const twins = await tx
    .select({ src: fileTags.id, dst: destTags.id })
    .from(fileTags)
    .innerJoin(
      destTags,
      and(
        eq(destTags.profileId, toId),
        sql`lower(${destTags.name}) = lower(${fileTags.name})`,
      ),
    )
    .where(eq(fileTags.profileId, fromId));

  for (const { src, dst } of twins) {
    // `array_replace` alone would leave a duplicate on anything already
    // carrying the destination's tag, so the result is rebuilt distinct.
    for (const table of [files, folders]) {
      // Scoped to the source profile, like `deleteTag`'s equivalent. `src` is a
      // tag of `fromId`, so this changes nothing about which rows match — it
      // just lets the predicate lead with `profile_id` and use the index,
      // instead of scanning the whole table once per colliding tag name.
      await tx.execute(sql`
        UPDATE ${table}
        SET tag_ids = (
          SELECT COALESCE(array_agg(DISTINCT t), '{}'::uuid[])
          FROM unnest(array_replace(tag_ids, ${src}::uuid, ${dst}::uuid)) AS t
        )
        WHERE profile_id = ${fromId}::uuid AND ${src}::uuid = ANY(tag_ids)
      `);
    }
    await tx.delete(fileTags).where(eq(fileTags.id, src));
  }
  await tx.update(fileTags).set({ profileId: toId }).where(eq(fileTags.profileId, fromId));

  // The predefined "Transaction attachments" folder is unique per profile
  // (partial index on (profile_id, system_key)), so when the destination
  // already has one the source's can't move — it's dropped instead. Anything
  // under it is re-parented FIRST: `files.folder_id` and `folders.parent_id`
  // are both ON DELETE cascade, so deleting it with children still attached
  // would destroy exactly the documents this move exists to preserve.
  const [srcSystem] = await tx
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.profileId, fromId), isNotNull(folders.systemKey)))
    .limit(1);
  const [dstSystem] = await tx
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.profileId, toId), isNotNull(folders.systemKey)))
    .limit(1);
  if (srcSystem && dstSystem) {
    await tx.update(files).set({ folderId: dstSystem.id }).where(eq(files.folderId, srcSystem.id));
    await tx
      .update(folders)
      .set({ parentId: dstSystem.id })
      .where(eq(folders.parentId, srcSystem.id));
    await tx.delete(folders).where(eq(folders.id, srcSystem.id));
  }

  // The tree moves whole, so parent links stay valid and only the profile
  // changes. `updated_at` is deliberately left alone: re-filing hundreds of
  // files is bookkeeping, and stamping every row would rewrite the "Added"
  // and modified metadata the vault shows for documents nobody touched.
  await tx.update(folders).set({ profileId: toId }).where(eq(folders.profileId, fromId));
  await tx.update(files).set({ profileId: toId }).where(eq(files.profileId, fromId));
  await tx.update(fileShares).set({ profileId: toId }).where(eq(fileShares.profileId, fromId));
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
 * The profile's **vault** follows the same choice as its transactions: `move`
 * re-files the `files` / `folders` / `file_tags` / `file_shares` rows under the
 * destination (see `reprofileVault`), and anything left filed under the profile
 * when it goes cascades away with it. The R2 objects behind those rows don't —
 * nothing cascades in object storage — so every key still belonging to the
 * profile is read *before* the delete and swept after: once the rows are gone
 * the bytes are unreachable and would bill forever. On `move` that read finds
 * nothing, which is exactly right — those files still have owners.
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
        // The vault goes with them. Deleting a profile is not a decision to
        // discard its documents, and the sweep below reads what is still filed
        // under the profile — so once these rows point elsewhere, nothing of
        // theirs is collected and none of their objects are touched.
        await reprofileVault(tx, id, disposal.toProfileId!);
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
      const doomed = await collectProfileObjectKeys(tx, forProfile(id));

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

      return doomed;
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
