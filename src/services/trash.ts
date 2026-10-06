import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
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
import { assertCanRestoreProfiles, getWorkspaceEntitlements } from "@/lib/entitlements";
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
import {
  lockFolderSubtree,
  rescueLiveUnderTrash,
  trashedReach,
  uuidList,
  type Tx,
} from "./vault-tree";

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

type Keys = (string | null)[];

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
): Promise<{ folders: TrashedFolderDTO[]; files: TrashedFileDTO[]; filesCapped: boolean }> {
  const db = getDb();
  const [viewable, writable] = await Promise.all([
    accessibleProfileIds(userId, workspaceId),
    writableProfileIdList(userId, workspaceId),
  ]);
  const profileIds = viewable.map((r) => r.id);
  if (profileIds.length === 0) return { folders: [], files: [], filesCapped: false };
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
      deletedById: folders.deletedBy,
      deletedByName: deleter.name,
      profileName: profiles.name,
      profileIcon: profiles.icon,
    })
    .from(folders)
    .leftJoin(parent, eq(parent.id, folders.parentId))
    .leftJoin(deleter, eq(deleter.id, folders.deletedBy))
    // trash: a display join; `profileIds` are the caller's live profiles.
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
      deletedBy: { id: root.deletedById, name: root.deletedByName },
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
      deletedById: files.deletedBy,
      deletedByName: deleter.name,
      profileName: profiles.name,
      profileIcon: profiles.icon,
    })
    .from(files)
    .leftJoin(folder, eq(folder.id, files.folderId))
    .leftJoin(deleter, eq(deleter.id, files.deletedBy))
    // trash: a display join; `profileIds` are the caller's live profiles.
    .leftJoin(profiles, eq(profiles.id, files.profileId))
    .where(
      and(
        trashedOnly(files),
        inArray(files.profileId, profileIds),
        or(isNull(folder.id), isNull(folder.deletedAt), ne(folder.deletedAt, files.deletedAt)),
      ),
    )
    .orderBy(desc(files.deletedAt), desc(files.id))
    // One more than shown, to say whether the list is cut short.
    .limit(TRASH_FILES_LIMIT + 1);
  const filesCapped = fileRows.length > TRASH_FILES_LIMIT;

  return {
    folders: folderDtos,
    filesCapped,
    files: fileRows.slice(0, TRASH_FILES_LIMIT).map((f) => ({
      id: f.id,
      profileId: f.profileId,
      profileName: f.profileName,
      profileIcon: f.profileIcon,
      folderId: f.folderId,
      name: f.name,
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      deletedAt: f.deletedAt!.toISOString(),
      deletedBy: { id: f.deletedById, name: f.deletedByName },
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
      deletedById: profiles.deletedBy,
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
      // Everything stored under it, trash included (the documented meaning):
      // its vault files and the receipts of its transactions, every state.
      // trash: all states on purpose — this is what deleting it for good frees.
      fileBytes: sql<string>`(${db
        .select({ n: sql`coalesce(sum(${files.sizeBytes}), 0)` })
        .from(files)
        .where(eq(files.profileId, profiles.id))})`,
      receiptBytes: sql<string>`(${db
        .select({ n: sql`coalesce(sum(${transactionAttachments.sizeBytes}), 0)` })
        .from(transactionAttachments)
        .innerJoin(transactions, eq(transactions.id, transactionAttachments.transactionId))
        .where(eq(transactions.profileId, profiles.id))})`,
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
    sizeBytes: Number(r.fileBytes) + Number(r.receiptBytes),
    deletedAt: r.deletedAt!.toISOString(),
    deletedBy: { id: r.deletedById, name: r.deletedByName },
    purgeAt: purgeAt(r.deletedAt!).toISOString(),
  }));
}

/** Everything the caller can act on in the trash, counted — for "Empty trash". */
export async function countTrash(userId: string, workspaceId: string): Promise<TrashCounts> {
  const db = getDb();
  const [writable, role, ent] = await Promise.all([
    writableProfileIdList(userId, workspaceId),
    getWorkspaceRole(userId, workspaceId),
    getWorkspaceEntitlements(workspaceId),
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
    role === "admin" && !ent.readOnly
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

export type TrashResult = {
  counts: TrashCounts;
  skipped: number;
  /** The transactions that came back (for a client to put them back on screen). */
  transactionIds: string[];
};

/**
 * Restore a selection from the trash. Ids the caller can't act on (or that are
 * no longer in the trash) are skipped and counted, never an error — except a
 * profile restore that would break a plan limit, which throws `plan_limit` so
 * the caller can offer the upgrade.
 *
 * - profiles (admins) first, **all checked against the plan together** before
 *   any comes back: their spaces must have room (summed per space) and the
 *   people they bring back must fit the member cap. So a refusal leaves the
 *   whole request undone, profiles and everything else in it.
 * - transactions come back as they were; a category or tag deleted meanwhile
 *   stays gone (the row is uncategorized / untagged). Their receipts never left.
 * - a file goes back into its folder if that folder is live, else to the top.
 * - a folder brings back everything that went to the trash *with* it; one
 *   whose parent is still in the trash lands at the top. A name taken
 *   meanwhile is renamed ("Taxes (restored)").
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

  if (sel.profileIds.length) {
    const role = await getWorkspaceRole(userId, workspaceId);
    if (role === "admin") {
      counts.profiles = await restoreProfiles(workspaceId, [...new Set(sel.profileIds)]);
      done += counts.profiles;
      // This request may already have memoized "the profiles you can see".
      if (counts.profiles > 0) forgetAccessibleProfiles(userId, workspaceId);
    }
  }

  // Rows inside a profile restored just now are in reach from here on.
  const writable = await writableProfileIdList(userId, workspaceId);
  let transactionIds: string[] = [];

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
    transactionIds = restored.map((r) => r.id);
    counts.transactions = restored.length;
    done += restored.length;
  }

  if (sel.fileIds.length && writable.length) {
    const restored = await db.transaction((tx) =>
      restoreFiles(tx, [...new Set(sel.fileIds)], writable),
    );
    counts.files = restored;
    done += restored;
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
  return { counts, skipped: Math.max(0, asked - done), transactionIds };
}

/** How many trashed transactions one "restore all" request brings back at most. */
export const RESTORE_ALL_BATCH = 5_000;

/**
 * Restore trashed transactions **by filter**, server-side — what makes a big
 * "Delete all transactions" (or any large trash) practical to undo: the client
 * names the batch, not tens of thousands of ids. Every trashed transaction the
 * caller can edit, optionally narrowed to some profiles and/or to one deletion
 * (`deletedAt` — every row of one delete shares that instant, to the
 * millisecond the column stores). Bounded per request: call again while
 * `remaining > 0`.
 */
export async function restoreAllTransactions(
  userId: string,
  workspaceId: string,
  filter: { profileIds?: string[]; deletedAt?: Date } = {},
): Promise<{ restored: number; remaining: number; transactionIds: string[] }> {
  const writable = await writableProfileIdList(userId, workspaceId);
  const scope = filter.profileIds?.length
    ? writable.filter((id) => filter.profileIds!.includes(id))
    : writable;
  if (scope.length === 0) return { restored: 0, remaining: 0, transactionIds: [] };
  const where = and(
    trashedOnly(transactions),
    inArray(transactions.profileId, scope),
    filter.deletedAt ? eq(transactions.deletedAt, filter.deletedAt) : undefined,
  );
  const db = getDb();
  const restored = await db.transaction(async (tx) => {
    // trash: `where` is trashedOnly(transactions) and the filter, above.
    const batch = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(where)
      .orderBy(asc(transactions.id))
      .limit(RESTORE_ALL_BATCH)
      .for("update");
    if (batch.length === 0) return [];
    return tx
      .update(transactions)
      .set({ deletedAt: null, deletedBy: null })
      .where(and(inArray(transactions.id, batch.map((r) => r.id)), trashedOnly(transactions)))
      .returning({ id: transactions.id });
  });
  // trash: the same trash-only `where`, for what's left.
  const [{ n }] = await db.select({ n: count() }).from(transactions).where(where);
  if (restored.length > 0) {
    logger.info(`Restored ${restored.length} transactions from the trash`, {
      event: "trash.restored",
      transactions: restored.length,
      remaining: n,
    });
  }
  return { restored: restored.length, remaining: n, transactionIds: restored.map((r) => r.id) };
}

/**
 * Restore trashed files, each back into its folder when that folder is live,
 * else to the top level. The live folders are locked `FOR SHARE` first, so a
 * folder being trashed at the same moment either waits for this restore (and
 * then takes the file with it) or is already in the trash (and the file lands
 * at the top) — never a live file left inside a trashed folder.
 */
async function restoreFiles(tx: Tx, ids: string[], writable: string[]): Promise<number> {
  const candidates = await tx
    .select({ id: files.id, folderId: files.folderId })
    .from(files)
    .where(and(inArray(files.id, ids), inArray(files.profileId, writable), trashedOnly(files)))
    .orderBy(asc(files.id))
    .for("update");
  if (candidates.length === 0) return 0;
  const targets = [...new Set(candidates.map((c) => c.folderId).filter((f): f is string => !!f))];
  const live = new Set(
    targets.length
      ? (
          await tx
            .select({ id: folders.id })
            .from(folders)
            .where(and(inArray(folders.id, targets), notTrashed(folders)))
            .orderBy(asc(folders.id))
            .for("share")
        ).map((f) => f.id)
      : [],
  );
  const intoFolder = candidates.filter((c) => c.folderId && live.has(c.folderId)).map((c) => c.id);
  const toTop = candidates.filter((c) => !c.folderId || !live.has(c.folderId)).map((c) => c.id);
  let restored = 0;
  if (intoFolder.length) {
    restored += (
      await tx
        .update(files)
        .set({ deletedAt: null, deletedBy: null })
        .where(inArray(files.id, intoFolder))
        .returning({ id: files.id })
    ).length;
  }
  if (toTop.length) {
    restored += (
      await tx
        .update(files)
        .set({ deletedAt: null, deletedBy: null, folderId: null })
        .where(inArray(files.id, toTop))
        .returning({ id: files.id })
    ).length;
  }
  return restored;
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
  // Locked `FOR SHARE` (like any move into a folder), so the parent can't go to
  // the trash under it between this check and the commit.
  let parentId = root.parentId;
  if (parentId) {
    const [parent] = await tx
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, parentId), notTrashed(folders)))
      .for("share")
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
 * Bring trashed profiles back (admin; the caller checked) and return how many
 * came back. Everything in each reappears exactly as it was — rows that were
 * already in the trash on their own stay there. The plan is checked for all of
 * them together first (`assertCanRestoreProfiles`), so a refusal restores none.
 * A name taken meanwhile is renamed.
 */
async function restoreProfiles(workspaceId: string, profileIds: string[]): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: profiles.id, spaceId: profiles.spaceId, name: profiles.name })
    .from(profiles)
    .where(
      and(
        inArray(profiles.id, profileIds),
        eq(profiles.workspaceId, workspaceId),
        trashedOnly(profiles),
      ),
    );
  if (rows.length === 0) return 0;
  await assertCanRestoreProfiles(workspaceId, rows);

  return db.transaction(async (tx) => {
    const live = await tx
      .select({ name: profiles.name })
      .from(profiles)
      .where(and(eq(profiles.workspaceId, workspaceId), notTrashed(profiles)));
    const taken = new Set(live.map((p) => p.name));
    let restored = 0;
    for (const row of rows) {
      const name = restoredName(row.name, PROFILE_NAME_MAX, (n) => taken.has(n));
      const done = await tx
        .update(profiles)
        .set({ deletedAt: null, deletedBy: null, name })
        .where(and(eq(profiles.id, row.id), trashedOnly(profiles)))
        .returning({ id: profiles.id });
      if (done.length > 0) {
        taken.add(name);
        restored++;
      }
    }
    return restored;
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
      // trash: `ids` are the trashed rows locked just above.
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
 * Destroy up to `limit` trashed folders matching `where` and everything under
 * them that is in the trash too.
 *
 * Inside one transaction: the roots are locked (skipping any another purge or
 * delete holds), then their whole subtree is locked `FOR UPDATE`
 * (`lockFolderSubtree`), so nothing can be created in or moved into it until
 * this commits. Anything **live** found under a trashed folder — a folder or
 * file that raced in, or older data — is moved to the top level first
 * (`rescueLiveUnderTrash`): deleting a trashed folder never destroys something
 * nobody deleted. Then the files are deleted with `RETURNING` their keys, so
 * only the stored objects of rows that really went are swept, and the roots
 * cascade the (now all-trashed) folders under them.
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
    const tree = await lockFolderSubtree(tx, roots);
    await rescueLiveUnderTrash(tx, tree);
    // After the rescue every folder still under a root is a trashed one.
    const reach = trashedReach(tree, roots);
    const gone = await tx
      .delete(files)
      .where(inArray(files.folderId, reach))
      .returning({ r2Key: files.r2Key, thumbnailKey: files.thumbnailKey });
    const removed = await tx
      .delete(folders)
      .where(and(inArray(folders.id, roots), trashedOnly(folders)))
      .returning({ id: folders.id });
    return {
      counts: { ...EMPTY_TRASH_COUNTS, folders: removed.length, files: gone.length },
      keys: gone.flatMap((r) => [r.r2Key, r.thumbnailKey]),
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
): Promise<{ counts: TrashCounts; skipped: number }> {
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
      // A view-only workspace changes nothing — not even a delete for good
      // through the admin path, which doesn't go through a profile role.
      if ((await getWorkspaceEntitlements(workspaceId)).readOnly) throw readOnlyWorkspaceError();
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
  // In a view-only workspace nobody empties anything: `writable` is already
  // empty there, and the admin branch (profiles) is skipped too.
  const admin = role === "admin" && !ent.readOnly;
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
