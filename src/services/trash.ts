import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type Db } from "@/db";
import {
  files,
  folders,
  profiles,
  spaces,
  transactionAttachments,
  transactions,
  users,
} from "@/db/schema";
import { parseOrThrow } from "@/lib/api-response";
import { assertCanRestoreProfile, getWorkspaceEntitlements } from "@/lib/entitlements";
import { forbidden } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { deleteObjects } from "@/lib/r2";
import {
  forgetAccessibleProfiles,
  listTrashedTransactions,
  type TrashCursor,
  type TrashedTransactionRow,
} from "@/lib/queries";
import {
  EMPTY_TRASH_COUNTS,
  describeTrashCounts,
  purgeAt,
  restoredName,
  type TrashCounts,
  type TrashedFileDTO,
  type TrashedFolderDTO,
  type TrashedProfileDTO,
} from "@/lib/trash";
import { notTrashed, trashedOnly } from "@/lib/trash-scope";
import { FOLDER_NAME_MAX, PROFILE_NAME_MAX, trashSelectionSchema } from "@/lib/validation";
import { accessibleProfileIds, getWorkspaceRole, readOnlyWorkspaceError } from "@/lib/workspaces";
import { destroyProfiles } from "./storage-keys";

/**
 * The trash: list, restore, delete for good, empty — shared by the web actions
 * (`src/actions/trash.ts`) and `/api/v1/trash/*`. The batch "destroy"
 * primitives at the bottom are also what the daily purge (`lib/trash-purge.ts`)
 * runs, with a cutoff instead of a selection.
 *
 * Who can do what follows the delete that put an item here:
 *  - **see** a trashed transaction, file or folder: viewer on its profile;
 *  - **restore / delete for good**: editor on its profile, in a workspace
 *    that isn't view-only (the editor scope of `accessibleProfileIds` already
 *    says so — a view-only workspace yields no writable profile);
 *  - **profiles**: workspace admins only, like deleting one.
 *
 * Every multi-statement change runs in one `db.transaction`; stored objects are
 * deleted only after it commits, so a rollback never leaves rows pointing at
 * bytes that are gone.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Keys = (string | null)[];

/** `uuid[]` literal for raw SQL — a JS array in a `sql` template would bind as
 * a parameter *list* (its `IN` form), which `::uuid[]` can't cast. */
function uuidList(ids: readonly string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

/** Ids of the profiles the caller can write in this workspace (live, editor+). */
async function writableProfileIdList(userId: string, workspaceId: string): Promise<string[]> {
  const rows = await accessibleProfileIds(userId, workspaceId, "editor");
  return rows.map((r) => r.id);
}

// ── Listing ────────────────────────────────────────────────────────────────

export type TrashedTransactionPage = {
  rows: (TrashedTransactionRow & { canRestore: boolean })[];
  nextCursor: TrashCursor | null;
};

/** One page of trashed transactions the caller can see, newest deletion first. */
export async function listTrashTransactions(
  userId: string,
  workspaceId: string,
  opts: { limit?: number; before?: TrashCursor } = {},
): Promise<TrashedTransactionPage> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const [rows, writable] = await Promise.all([
    listTrashedTransactions(userId, workspaceId, { limit, before: opts.before }),
    writableProfileIdList(userId, workspaceId),
  ]);
  const canWrite = new Set(writable);
  const last = rows.at(-1);
  return {
    rows: rows.map((r) => ({ ...r, canRestore: canWrite.has(r.profileId) })),
    nextCursor: rows.length === limit && last ? { deletedAt: last.deletedAt, id: last.id } : null,
  };
}

/** The most trashed vault files the trash page lists at once (like the vault). */
export const TRASH_FILES_LIMIT = 500;

/**
 * The vault's trash: the folders and files that were deleted **as such** —
 * a folder carries the subfolders and files that went to the trash with it
 * (they're restored with it and aren't listed on their own). An item is listed
 * on its own when it has no parent, its parent is live, or its parent went to
 * the trash at a different moment (it was deleted first, by itself).
 */
export async function listTrashVault(
  userId: string,
  workspaceId: string,
): Promise<{ folders: TrashedFolderDTO[]; files: TrashedFileDTO[] }> {
  const db = getDb();
  const [viewable, writable] = await Promise.all([
    accessibleProfileIds(userId, workspaceId),
    writableProfileIdList(userId, workspaceId),
  ]);
  const profileIds = viewable.map((r) => r.id);
  if (profileIds.length === 0) return { folders: [], files: [] };
  const canWrite = new Set(writable);

  const parent = alias(folders, "parent");
  const deleter = alias(users, "deleter");
  // Every trashed folder in reach (folder trees are small), with the instant it
  // was trashed as text — compared as text, never through a JS `Date`.
  const trashedFolders = await db
    .select({
      id: folders.id,
      profileId: folders.profileId,
      parentId: folders.parentId,
      name: folders.name,
      color: folders.color,
      deletedAt: folders.deletedAt,
      instant: sql<string>`${folders.deletedAt}::text`,
      parentInstant: sql<string | null>`${parent.deletedAt}::text`,
      deletedByName: deleter.name,
      profileName: profiles.name,
      profileIcon: profiles.icon,
    })
    .from(folders)
    .leftJoin(parent, eq(parent.id, folders.parentId))
    .leftJoin(deleter, eq(deleter.id, folders.deletedBy))
    .leftJoin(profiles, eq(profiles.id, folders.profileId))
    .where(and(trashedOnly(folders), inArray(folders.profileId, profileIds)))
    .orderBy(desc(folders.deletedAt), desc(folders.id));

  // Trashed files per (folder, instant): what each trashed folder carries.
  const perFolder = await db
    .select({
      folderId: files.folderId,
      instant: sql<string>`${files.deletedAt}::text`,
      n: count(),
      bytes: sql<string>`coalesce(sum(${files.sizeBytes}), 0)`,
    })
    .from(files)
    .where(and(trashedOnly(files), inArray(files.profileId, profileIds)))
    .groupBy(files.folderId, sql`${files.deletedAt}::text`);
  const batchKey = (folderId: string | null, instant: string) => `${folderId}|${instant}`;
  const fileTotals = new Map(
    perFolder.map((r) => [batchKey(r.folderId, r.instant), { n: r.n, bytes: Number(r.bytes) }]),
  );

  const children = new Map<string, typeof trashedFolders>();
  for (const f of trashedFolders) {
    if (!f.parentId) continue;
    const list = children.get(f.parentId) ?? [];
    list.push(f);
    children.set(f.parentId, list);
  }
  const isRoot = (f: (typeof trashedFolders)[number]) =>
    !f.parentId || f.parentInstant === null || f.parentInstant !== f.instant;

  const folderDtos: TrashedFolderDTO[] = trashedFolders.filter(isRoot).map((root) => {
    // Walk the batch: descendants stamped with the root's instant.
    let subfolders = 0;
    let fileCount = 0;
    let bytes = 0;
    const queue = [root];
    while (queue.length) {
      const f = queue.shift()!;
      const totals = fileTotals.get(batchKey(f.id, root.instant));
      if (totals) {
        fileCount += totals.n;
        bytes += totals.bytes;
      }
      for (const c of children.get(f.id) ?? []) {
        if (c.instant === root.instant) {
          subfolders++;
          queue.push(c);
        }
      }
    }
    return {
      id: root.id,
      profileId: root.profileId,
      profileName: root.profileName,
      profileIcon: root.profileIcon,
      name: root.name,
      color: root.color,
      folders: subfolders,
      files: fileCount,
      sizeBytes: bytes,
      deletedAt: root.deletedAt!.toISOString(),
      deletedByName: root.deletedByName,
      purgeAt: purgeAt(root.deletedAt!).toISOString(),
      canRestore: canWrite.has(root.profileId),
    };
  });

  // Files deleted on their own: no folder, a live folder, or a folder that went
  // to the trash at another moment.
  const folder = alias(folders, "folder");
  const fileRows = await db
    .select({
      id: files.id,
      profileId: files.profileId,
      folderId: files.folderId,
      name: files.name,
      contentType: files.contentType,
      sizeBytes: files.sizeBytes,
      deletedAt: files.deletedAt,
      deletedByName: deleter.name,
      profileName: profiles.name,
      profileIcon: profiles.icon,
    })
    .from(files)
    .leftJoin(folder, eq(folder.id, files.folderId))
    .leftJoin(deleter, eq(deleter.id, files.deletedBy))
    .leftJoin(profiles, eq(profiles.id, files.profileId))
    .where(
      and(
        trashedOnly(files),
        inArray(files.profileId, profileIds),
        or(isNull(folder.id), isNull(folder.deletedAt), ne(folder.deletedAt, files.deletedAt)),
      ),
    )
    .orderBy(desc(files.deletedAt), desc(files.id))
    .limit(TRASH_FILES_LIMIT);

  return {
    folders: folderDtos,
    files: fileRows.map((f) => ({
      id: f.id,
      profileId: f.profileId,
      profileName: f.profileName,
      profileIcon: f.profileIcon,
      folderId: f.folderId,
      name: f.name,
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      deletedAt: f.deletedAt!.toISOString(),
      deletedByName: f.deletedByName,
      purgeAt: purgeAt(f.deletedAt!).toISOString(),
      canRestore: canWrite.has(f.profileId),
    })),
  };
}

/** Trashed profiles of the workspace — admins only; anyone else gets none. */
export async function listTrashProfiles(
  userId: string,
  workspaceId: string,
): Promise<TrashedProfileDTO[]> {
  if ((await getWorkspaceRole(userId, workspaceId)) !== "admin") return [];
  const db = getDb();
  const deleter = alias(users, "deleter");
  const rows = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      icon: profiles.icon,
      color: profiles.color,
      spaceId: profiles.spaceId,
      spaceName: spaces.name,
      deletedAt: profiles.deletedAt,
      deletedByName: deleter.name,
      // Builder subqueries (not raw `sql`), so both sides render qualified.
      transactions: sql<number>`(${db
        .select({ n: sql`count(*)::int` })
        .from(transactions)
        .where(and(eq(transactions.profileId, profiles.id), notTrashed(transactions)))})`,
      files: sql<number>`(${db
        .select({ n: sql`count(*)::int` })
        .from(files)
        .where(and(eq(files.profileId, profiles.id), notTrashed(files)))})`,
      sizeBytes: sql<string>`(${db
        .select({ n: sql`coalesce(sum(${files.sizeBytes}), 0)` })
        .from(files)
        .where(eq(files.profileId, profiles.id))})`,
    })
    .from(profiles)
    .leftJoin(spaces, eq(spaces.id, profiles.spaceId))
    .leftJoin(deleter, eq(deleter.id, profiles.deletedBy))
    .where(and(eq(profiles.workspaceId, workspaceId), trashedOnly(profiles)))
    .orderBy(desc(profiles.deletedAt), desc(profiles.id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    spaceId: r.spaceId,
    spaceName: r.spaceName,
    transactions: Number(r.transactions),
    files: Number(r.files),
    sizeBytes: Number(r.sizeBytes),
    deletedAt: r.deletedAt!.toISOString(),
    deletedByName: r.deletedByName,
    purgeAt: purgeAt(r.deletedAt!).toISOString(),
  }));
}

/** Everything the caller can act on in the trash, counted — for "Empty trash". */
export async function countTrash(userId: string, workspaceId: string): Promise<TrashCounts> {
  const db = getDb();
  const [writable, role] = await Promise.all([
    writableProfileIdList(userId, workspaceId),
    getWorkspaceRole(userId, workspaceId),
  ]);
  const [txns, fileRows, folderRows, profileRows] = await Promise.all([
    writable.length
      ? db
          .select({ n: count() })
          .from(transactions)
          .where(and(trashedOnly(transactions), inArray(transactions.profileId, writable)))
      : [{ n: 0 }],
    writable.length
      ? db
          .select({ n: count() })
          .from(files)
          .where(and(trashedOnly(files), inArray(files.profileId, writable)))
      : [{ n: 0 }],
    writable.length
      ? db
          .select({ n: count() })
          .from(folders)
          .where(and(trashedOnly(folders), inArray(folders.profileId, writable)))
      : [{ n: 0 }],
    role === "admin"
      ? db
          .select({ n: count() })
          .from(profiles)
          .where(and(eq(profiles.workspaceId, workspaceId), trashedOnly(profiles)))
      : [{ n: 0 }],
  ]);
  return {
    transactions: txns[0]?.n ?? 0,
    files: fileRows[0]?.n ?? 0,
    folders: folderRows[0]?.n ?? 0,
    profiles: profileRows[0]?.n ?? 0,
  };
}

// ── Restore ────────────────────────────────────────────────────────────────

export type TrashResult = { counts: TrashCounts; skipped: number };

/**
 * Restore a selection from the trash. Ids the caller can't act on (or that are
 * no longer in the trash) are skipped and counted, never an error — except a
 * profile restore that would break a plan limit, which throws `plan_limit` so
 * the caller can offer the upgrade.
 *
 * - transactions come back as they were; a category or tag deleted meanwhile
 *   stays gone (the row is uncategorized / untagged). Their receipts never left.
 * - a file goes back into its folder if that folder is live, else to the top.
 * - a folder brings back everything that went to the trash *with* it; one
 *   whose parent is still in the trash lands at the top. A name taken
 *   meanwhile is renamed ("Taxes (restored)").
 * - a profile (admins) brings back everything in it, if its space has room and
 *   the people it brings back fit the member cap.
 */
export async function restoreFromTrash(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<TrashResult> {
  const sel = parseOrThrow(trashSelectionSchema, input);
  const db = getDb();
  const counts: TrashCounts = { ...EMPTY_TRASH_COUNTS };
  const asked =
    sel.transactionIds.length + sel.fileIds.length + sel.folderIds.length + sel.profileIds.length;
  // What was asked for and came back — a folder's contents are extra.
  let done = 0;

  // Profiles first: one that breaks a plan limit throws before anything else in
  // the selection is restored, so the error never hides a partial success. And
  // rows inside a profile restored here are then in reach below.
  if (sel.profileIds.length) {
    const role = await getWorkspaceRole(userId, workspaceId);
    if (role === "admin") {
      for (const profileId of new Set(sel.profileIds)) {
        if (await restoreProfile(workspaceId, profileId)) {
          counts.profiles++;
          done++;
        }
      }
      // This request may already have memoized "the profiles you can see".
      if (counts.profiles > 0) forgetAccessibleProfiles(userId, workspaceId);
    }
  }

  const writable = await writableProfileIdList(userId, workspaceId);

  if (sel.transactionIds.length && writable.length) {
    const restored = await db
      .update(transactions)
      .set({ deletedAt: null, deletedBy: null })
      .where(
        and(
          inArray(transactions.id, [...new Set(sel.transactionIds)]),
          inArray(transactions.profileId, writable),
          trashedOnly(transactions),
        ),
      )
      .returning({ id: transactions.id });
    counts.transactions = restored.length;
    done += restored.length;
  }

  if (sel.fileIds.length && writable.length) {
    // Back into its folder when that folder is live; otherwise the top level.
    const restored = await db.execute<{ id: string }>(sql`
      update ${files} as f
      set deleted_at = null,
          deleted_by = null,
          folder_id = case
            when f.folder_id is not null and exists (
              select 1 from ${folders} p where p.id = f.folder_id and p.deleted_at is null
            ) then f.folder_id
            else null
          end
      where f.id in (${uuidList([...new Set(sel.fileIds)])})
        and f.profile_id in (${uuidList(writable)})
        and f.deleted_at is not null
      returning f.id`);
    counts.files = restored.rows.length;
    done += restored.rows.length;
  }

  for (const folderId of new Set(sel.folderIds)) {
    if (!writable.length) break;
    const restored = await db.transaction((tx) => restoreFolder(tx, folderId, writable));
    if (restored) {
      counts.folders += restored.folders;
      counts.files += restored.files;
      done++;
    }
  }

  if (done > 0) {
    logger.info(`Restored ${describeTrashCounts(counts)} from the trash`, {
      event: "trash.restored",
      ...counts,
    });
  }
  return { counts, skipped: Math.max(0, asked - done) };
}

/**
 * Restore one trashed folder and the batch that went with it, inside `tx`.
 * The batch is every descendant stamped with the folder's own `deleted_at`,
 * compared in SQL as the stored value — never through a JS `Date`, which
 * would drop precision and miss rows.
 */
async function restoreFolder(
  tx: Tx,
  folderId: string,
  writable: string[],
): Promise<{ folders: number; files: number } | null> {
  const [root] = await tx
    .select({
      id: folders.id,
      profileId: folders.profileId,
      parentId: folders.parentId,
      name: folders.name,
      instant: sql<string>`${folders.deletedAt}::text`,
    })
    .from(folders)
    .where(
      and(eq(folders.id, folderId), trashedOnly(folders), inArray(folders.profileId, writable)),
    )
    .for("update")
    .limit(1);
  if (!root) return null;

  const batch = await tx.execute<{ id: string }>(sql`
    with recursive sub as (
      select id from ${folders} where id = ${root.id}::uuid
      union all
      select c.id from ${folders} c
        join sub on c.parent_id = sub.id
       where c.deleted_at = ${root.instant}::timestamptz
    )
    select id from sub`);
  const ids = batch.rows.map((r) => r.id);

  // Its parent may still be in the trash; then it comes back at the top level.
  let parentId = root.parentId;
  if (parentId) {
    const [parent] = await tx
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, parentId), notTrashed(folders)))
      .limit(1);
    if (!parent) parentId = null;
  }
  // Folder names are unique among live siblings, case-insensitively.
  const siblings = await tx
    .select({ name: folders.name })
    .from(folders)
    .where(
      and(
        eq(folders.profileId, root.profileId),
        notTrashed(folders),
        parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId),
      ),
    );
  const taken = new Set(siblings.map((s) => s.name.toLowerCase()));
  const name = restoredName(root.name, FOLDER_NAME_MAX, (n) => taken.has(n.toLowerCase()));

  await tx
    .update(folders)
    .set({ deletedAt: null, deletedBy: null })
    .where(inArray(folders.id, ids));
  await tx.update(folders).set({ parentId, name }).where(eq(folders.id, root.id));
  const restoredFiles = await tx.execute<{ id: string }>(sql`
    update ${files} set deleted_at = null, deleted_by = null
    where folder_id in (${uuidList(ids)})
      and deleted_at = ${root.instant}::timestamptz
    returning id`);
  return { folders: ids.length, files: restoredFiles.rows.length };
}

/**
 * Bring a trashed profile back (admin; the caller checked). Everything in it
 * reappears exactly as it was — rows that were already in the trash on their
 * own stay there. Checks the plan first: its space must have room, and anyone
 * who could only reach the workspace through it must fit the member cap. A
 * name taken meanwhile is renamed.
 */
async function restoreProfile(workspaceId: string, profileId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: profiles.id, spaceId: profiles.spaceId, name: profiles.name })
    .from(profiles)
    .where(
      and(eq(profiles.id, profileId), eq(profiles.workspaceId, workspaceId), trashedOnly(profiles)),
    )
    .limit(1);
  if (!row) return false;
  await assertCanRestoreProfile(workspaceId, row);

  return db.transaction(async (tx) => {
    const live = await tx
      .select({ name: profiles.name })
      .from(profiles)
      .where(and(eq(profiles.workspaceId, workspaceId), notTrashed(profiles)));
    const taken = new Set(live.map((p) => p.name));
    const name = restoredName(row.name, PROFILE_NAME_MAX, (n) => taken.has(n));
    const restored = await tx
      .update(profiles)
      .set({ deletedAt: null, deletedBy: null, name })
      .where(and(eq(profiles.id, row.id), trashedOnly(profiles)))
      .returning({ id: profiles.id });
    return restored.length > 0;
  });
}

// ── Delete for good ────────────────────────────────────────────────────────

/** A batch destroyed: how many of each, and the stored objects to sweep. */
type Destroyed = { counts: TrashCounts; keys: Keys };

/**
 * Destroy up to `limit` trashed transactions matching `where`, in one
 * transaction: lock them (skipping rows another purge or delete holds), read
 * their receipts' keys **through the parent row** while they exist, delete
 * them (receipts cascade). The delete re-states the trash predicate, so a row
 * restored before the lock was taken is never destroyed.
 */
export async function destroyTrashedTransactions(where: SQL, limit: number): Promise<Destroyed> {
  return getDb().transaction(async (tx) => {
    const doomed = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(trashedOnly(transactions), where))
      .orderBy(asc(transactions.id))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (doomed.length === 0) return { counts: { ...EMPTY_TRASH_COUNTS }, keys: [] };
    const ids = doomed.map((r) => r.id);
    const stored = await tx
      .select({
        r2Key: transactionAttachments.r2Key,
        thumbnailKey: transactionAttachments.thumbnailKey,
      })
      .from(transactionAttachments)
      .innerJoin(transactions, eq(transactionAttachments.transactionId, transactions.id))
      .where(inArray(transactions.id, ids));
    const removed = await tx
      .delete(transactions)
      .where(and(inArray(transactions.id, ids), trashedOnly(transactions)))
      .returning({ id: transactions.id });
    return {
      counts: { ...EMPTY_TRASH_COUNTS, transactions: removed.length },
      keys: stored.flatMap((s) => [s.r2Key, s.thumbnailKey]),
    };
  });
}

/** As `destroyTrashedTransactions`, for vault files deleted on their own. */
export async function destroyTrashedFiles(where: SQL, limit: number): Promise<Destroyed> {
  return getDb().transaction(async (tx) => {
    const doomed = await tx
      .select({ id: files.id, r2Key: files.r2Key, thumbnailKey: files.thumbnailKey })
      .from(files)
      .where(and(trashedOnly(files), where))
      .orderBy(asc(files.id))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (doomed.length === 0) return { counts: { ...EMPTY_TRASH_COUNTS }, keys: [] };
    const removed = await tx
      .delete(files)
      .where(and(inArray(files.id, doomed.map((d) => d.id)), trashedOnly(files)))
      .returning({ id: files.id });
    const gone = new Set(removed.map((r) => r.id));
    return {
      counts: { ...EMPTY_TRASH_COUNTS, files: removed.length },
      keys: doomed.filter((d) => gone.has(d.id)).flatMap((d) => [d.r2Key, d.thumbnailKey]),
    };
  });
}

/**
 * Destroy up to `limit` trashed folders matching `where` and **everything
 * under them** (the folder cascade), collecting the stored objects of every
 * file in their subtrees first — whatever those files' own state, so even a
 * file that raced its way into a folder as it went to the trash is swept, not
 * stranded in the bucket.
 */
export async function destroyTrashedFolders(where: SQL, limit: number): Promise<Destroyed> {
  return getDb().transaction(async (tx) => {
    const doomed = await tx
      .select({ id: folders.id })
      .from(folders)
      .where(and(trashedOnly(folders), where))
      .orderBy(asc(folders.id))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (doomed.length === 0) return { counts: { ...EMPTY_TRASH_COUNTS }, keys: [] };
    const roots = doomed.map((d) => d.id);
    const stored = await tx.execute<{ r2_key: string; thumbnail_key: string | null }>(sql`
      with recursive sub as (
        select id from ${folders} where id in (${uuidList(roots)})
        union
        select c.id from ${folders} c join sub on c.parent_id = sub.id
      )
      select f.r2_key, f.thumbnail_key from ${files} f where f.folder_id in (select id from sub)`);
    const removed = await tx
      .delete(folders)
      .where(and(inArray(folders.id, roots), trashedOnly(folders)))
      .returning({ id: folders.id });
    return {
      counts: { ...EMPTY_TRASH_COUNTS, folders: removed.length, files: stored.rows.length },
      keys: stored.rows.flatMap((r) => [r.r2_key, r.thumbnail_key]),
    };
  });
}

/** Destroy up to `limit` trashed profiles matching `where`, with everything in them. */
export async function destroyTrashedProfiles(where: SQL, limit: number): Promise<Destroyed> {
  return getDb().transaction(async (tx) => {
    const doomed = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(trashedOnly(profiles), where))
      .orderBy(asc(profiles.id))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (doomed.length === 0) return { counts: { ...EMPTY_TRASH_COUNTS }, keys: [] };
    const keys = await destroyProfiles(
      tx,
      doomed.map((d) => d.id),
    );
    return { counts: { ...EMPTY_TRASH_COUNTS, profiles: doomed.length }, keys };
  });
}

function addCounts(into: TrashCounts, more: TrashCounts): void {
  into.transactions += more.transactions;
  into.files += more.files;
  into.folders += more.folders;
  into.profiles += more.profiles;
}

/**
 * Delete a selection from the trash for good. Same reach as a restore; ids the
 * caller can't act on are skipped. The stored objects go after each batch
 * commits (best-effort; `deleteObjects` never throws and logs strays).
 */
export async function deleteFromTrash(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<TrashResult> {
  const sel = parseOrThrow(trashSelectionSchema, input);
  const writable = await writableProfileIdList(userId, workspaceId);
  const counts: TrashCounts = { ...EMPTY_TRASH_COUNTS };
  const asked =
    sel.transactionIds.length + sel.fileIds.length + sel.folderIds.length + sel.profileIds.length;
  let done = 0;

  const run = async (batch: Promise<Destroyed>, roots: (c: TrashCounts) => number) => {
    const { counts: c, keys } = await batch;
    await deleteObjects(keys);
    addCounts(counts, c);
    done += roots(c);
  };

  if (writable.length) {
    if (sel.transactionIds.length) {
      await run(
        destroyTrashedTransactions(
          and(
            inArray(transactions.id, sel.transactionIds),
            inArray(transactions.profileId, writable),
          )!,
          sel.transactionIds.length,
        ),
        (c) => c.transactions,
      );
    }
    if (sel.fileIds.length) {
      await run(
        destroyTrashedFiles(
          and(inArray(files.id, sel.fileIds), inArray(files.profileId, writable))!,
          sel.fileIds.length,
        ),
        (c) => c.files,
      );
    }
    if (sel.folderIds.length) {
      await run(
        destroyTrashedFolders(
          and(inArray(folders.id, sel.folderIds), inArray(folders.profileId, writable))!,
          sel.folderIds.length,
        ),
        (c) => c.folders,
      );
    }
  }
  if (sel.profileIds.length) {
    if ((await getWorkspaceRole(userId, workspaceId)) === "admin") {
      await run(
        destroyTrashedProfiles(
          and(inArray(profiles.id, sel.profileIds), eq(profiles.workspaceId, workspaceId))!,
          sel.profileIds.length,
        ),
        (c) => c.profiles,
      );
    }
  }

  if (done > 0) {
    logger.info(`Deleted ${describeTrashCounts(counts)} from the trash for good`, {
      event: "trash.deleted_forever",
      ...counts,
    });
  }
  return { counts, skipped: Math.max(0, asked - done) };
}

/** How much one "Empty trash" request destroys at most; the rest is `remaining`. */
export const EMPTY_TRASH_BATCH = { transactions: 2_000, files: 500, folders: 200, profiles: 20 };

/**
 * Empty the caller's trash in this workspace: every trashed transaction, file
 * and folder they can edit, and (admins) every trashed profile. Bounded per
 * request so a 50,000-row trash can't run one request into the Worker's
 * limits — `remaining` says how much is left, and the client calls again.
 * Nobody without write access anywhere gets anything emptied (403).
 */
export async function emptyTrash(
  userId: string,
  workspaceId: string,
): Promise<{ counts: TrashCounts; remaining: number }> {
  const [writable, role, ent] = await Promise.all([
    writableProfileIdList(userId, workspaceId),
    getWorkspaceRole(userId, workspaceId),
    getWorkspaceEntitlements(workspaceId),
  ]);
  const admin = role === "admin";
  if (writable.length === 0 && !admin) {
    if (ent.readOnly) throw readOnlyWorkspaceError();
    throw forbidden("You don't have permission to do that");
  }
  const counts: TrashCounts = { ...EMPTY_TRASH_COUNTS };
  const run = async (batch: Promise<Destroyed>) => {
    const { counts: c, keys } = await batch;
    await deleteObjects(keys);
    addCounts(counts, c);
  };

  if (admin) {
    await run(destroyTrashedProfiles(eq(profiles.workspaceId, workspaceId), EMPTY_TRASH_BATCH.profiles));
  }
  if (writable.length) {
    await run(
      destroyTrashedTransactions(
        inArray(transactions.profileId, writable),
        EMPTY_TRASH_BATCH.transactions,
      ),
    );
    await run(destroyTrashedFolders(inArray(folders.profileId, writable), EMPTY_TRASH_BATCH.folders));
    await run(destroyTrashedFiles(inArray(files.profileId, writable), EMPTY_TRASH_BATCH.files));
  }

  const left = await countTrash(userId, workspaceId);
  const remaining = left.transactions + left.files + left.folders + left.profiles;
  logger.info(`Emptied the trash: ${describeTrashCounts(counts) || "nothing"} deleted for good`, {
    event: "trash.emptied",
    ...counts,
    remaining,
  });
  return { counts, remaining };
}
