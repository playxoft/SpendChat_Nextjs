import "server-only";
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { files, folders } from "@/db/schema";
import { isDeadlock } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { restoredName } from "@/lib/trash";
import { FOLDER_NAME_MAX } from "@/lib/validation";

/** A `db.transaction()` handle. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** `uuid` list for raw SQL — a JS array in a `sql` template binds as a
 * parameter *list*, which can't be cast to `uuid[]`. */
export function uuidList(ids: readonly string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

export type TreeFolder = {
  id: string;
  parentId: string | null;
  profileId: string;
  /** The stored `deleted_at` as text (full precision — never through a JS Date), or null. */
  deletedAt: string | null;
};

/** How many times a locked walk re-reads before giving up. */
const MAX_PASSES = 20;

/**
 * Every folder under `rootIds` (them included, whatever their trash state),
 * **locked `FOR UPDATE` until the caller's transaction ends**.
 *
 * Locking is what makes a subtree a fixed set. Creating a folder, uploading a
 * file or moving anything *into* a folder takes a share lock on that folder
 * first (`requireFolderInProfile` with a transaction), so once a folder here is
 * locked nothing new can land in it until we commit — the writer waits, then
 * finds the folder gone or in the trash and 404s.
 *
 * What a single pass can still miss is a move that committed after this
 * statement's snapshot but before it reached that folder's row. So the walk
 * repeats until the set stops growing: a fresh statement sees everything that
 * committed before our locks were taken. (Reproduced in review: B moves
 * "Deeds" into Taxes/2025 while A deletes Taxes — before this, Deeds stayed
 * live under a trashed folder and the purge destroyed it.)
 *
 * Rows are locked in id order, so two walks don't deadlock *each other*. A walk
 * can still deadlock against a writer that locks the same folders in another
 * order — a move inside the subtree (share-locks its destination, then updates
 * the folder) or a restore of a trashed child (locks the child, then
 * share-locks its parent). Postgres breaks the cycle by aborting one side with
 * 40P01, so every caller runs its transaction through `retryOnDeadlock`.
 *
 * Throws if the set is still growing after `MAX_PASSES` — something is moving
 * folders into it faster than it can be locked, and returning a partial set
 * would let the caller act on a subtree that isn't fixed.
 */
export async function lockFolderSubtree(tx: Tx, rootIds: readonly string[]): Promise<TreeFolder[]> {
  if (rootIds.length === 0) return [];
  let rows: TreeFolder[] = [];
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const result = await tx.execute<{
      id: string;
      parent_id: string | null;
      profile_id: string;
      deleted_at: string | null;
    }>(
      // trash: every folder under the roots, trashed or not — the callers
      // decide by `deletedAt` what to stamp, rescue or destroy.
      sql`
      with recursive sub as (
        select id from ${folders} where id in (${uuidList(rootIds)})
        union
        select c.id from ${folders} c join sub on c.parent_id = sub.id
      )
      select f.id, f.parent_id, f.profile_id, f.deleted_at::text as deleted_at
      from ${folders} f
      where f.id in (select id from sub)
      order by f.id
      for update of f`,
    );
    const next = result.rows.map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      profileId: r.profile_id,
      deletedAt: r.deleted_at,
    }));
    const grew = next.length !== rows.length || next.some((r, i) => r.id !== rows[i]?.id);
    rows = next;
    if (!grew) return rows;
  }
  throw new Error(`Folder subtree still growing after ${MAX_PASSES} passes`);
}

/**
 * `folderId` and every folder above it, **share-locked until the caller's
 * transaction ends** — what a move checks for a cycle. While these rows are
 * locked nobody can re-parent them, so the chain read here is the chain the
 * move commits against: two crossing moves that would close a loop between
 * them block each other (or one is a deadlock victim and retries), and the
 * second then sees the first. Re-walked until it stops changing, like
 * `lockFolderSubtree`; `union` ends the walk even on a stored cycle.
 */
export async function lockFolderAncestors(tx: Tx, folderId: string): Promise<string[]> {
  let ids: string[] = [];
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const result = await tx.execute<{ id: string }>(
      // trash: the chain as stored — a cycle is a cycle whatever is trashed.
      sql`
      with recursive up as (
        select id, parent_id from ${folders} where id = ${folderId}::uuid
        union
        select p.id, p.parent_id from ${folders} p join up on p.id = up.parent_id
      )
      select f.id from ${folders} f
      where f.id in (select id from up)
      order by f.id
      for share of f`,
    );
    const next = result.rows.map((r) => r.id);
    const same = next.length === ids.length && next.every((id, i) => id === ids[i]);
    ids = next;
    if (same) return ids;
  }
  throw new Error(`Folder ancestry still changing after ${MAX_PASSES} passes`);
}

/**
 * Run a folder transaction (delete, move, restore), and run it **once more**
 * if Postgres aborted it as a deadlock victim — see `lockFolderSubtree` for the
 * cycles. The retry starts from scratch and sees what the other side
 * committed, so it lands on the right answer (a 404 for a destination that
 * went to the trash, a refused cycle). A second deadlock is thrown.
 */
export async function retryOnDeadlock<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!isDeadlock(err)) throw err;
    logger.warn("A folder change was chosen as a deadlock victim and is being retried once", {
      event: "vault.deadlock_retry",
    });
    return run();
  }
}

/**
 * The folders reachable from `rootIds` through **trashed** folders only — what
 * destroying those roots may take. A live folder under a trashed one (left by
 * a race, or older data) is not in it: see `rescueLiveUnderTrash`.
 */
export function trashedReach(tree: TreeFolder[], rootIds: readonly string[]): string[] {
  const children = new Map<string, TreeFolder[]>();
  for (const f of tree) {
    if (!f.parentId) continue;
    const list = children.get(f.parentId) ?? [];
    list.push(f);
    children.set(f.parentId, list);
  }
  const out: string[] = [];
  const queue = [...rootIds];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const c of children.get(id) ?? []) if (c.deletedAt !== null) queue.push(c.id);
  }
  return out;
}

/**
 * Before anything under trashed folders is destroyed, move whatever is still
 * **live** there to the top level of its profile — a live folder (with its own
 * subtree) or a live file whose folder is in the trash. Deleting a trashed
 * folder must never destroy something nobody deleted. A rescued folder whose
 * name is taken at the top level gets " (restored)".
 *
 * `tree` must come from `lockFolderSubtree` in the same transaction.
 */
export async function rescueLiveUnderTrash(
  tx: Tx,
  tree: TreeFolder[],
): Promise<{ folders: number; files: number }> {
  const trashed = new Set(tree.filter((f) => f.deletedAt !== null).map((f) => f.id));
  if (trashed.size === 0) return { folders: 0, files: 0 };
  const strandedFolders = tree.filter(
    (f) => f.deletedAt === null && f.parentId !== null && trashed.has(f.parentId),
  );

  for (const folder of strandedFolders) {
    // trash: a live folder found by id in the locked tree.
    const [row] = await tx
      .select({ name: folders.name })
      .from(folders)
      .where(eq(folders.id, folder.id));
    const siblings = await tx
      .select({ name: folders.name })
      .from(folders)
      .where(
        and(eq(folders.profileId, folder.profileId), isNull(folders.parentId), isNull(folders.deletedAt)),
      );
    const taken = new Set(siblings.map((s) => s.name.toLowerCase()));
    const name = restoredName(row!.name, FOLDER_NAME_MAX, (n) => taken.has(n.toLowerCase()));
    await tx.update(folders).set({ parentId: null, name }).where(eq(folders.id, folder.id));
  }

  const strandedFiles = await tx
    .update(files)
    .set({ folderId: null })
    .where(and(inArray(files.folderId, [...trashed]), isNull(files.deletedAt)))
    .returning({ id: files.id });

  const rescued = { folders: strandedFolders.length, files: strandedFiles.length };
  if (rescued.folders + rescued.files > 0) {
    logger.warn(
      `Moved ${rescued.folders} live folders and ${rescued.files} live files out from under trashed folders before deleting them`,
      { event: "trash.rescued", ...rescued },
    );
  }
  return rescued;
}
