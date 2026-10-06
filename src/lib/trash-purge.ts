import "server-only";
import { lt } from "drizzle-orm";
import { files, folders, profiles, transactions } from "@/db/schema";
import { logger } from "@/lib/logger";
import { deleteObjects } from "@/lib/r2";
import {
  EMPTY_TRASH_COUNTS,
  TRASH_DAYS,
  describeTrashCounts,
  trashCutoff,
  type TrashCounts,
} from "@/lib/trash";
import {
  destroyTrashedFiles,
  destroyTrashedFolders,
  destroyTrashedProfiles,
  destroyTrashedTransactions,
} from "@/services/trash";

export type PurgeReport = {
  counts: TrashCounts;
  /** Stored objects (originals + previews) handed to R2 for deletion. */
  objects: number;
  durationMs: number;
  /** False when the run stopped at its time budget with more still due. */
  complete: boolean;
};

/** Rows destroyed per database transaction. */
const DEFAULT_BATCH = 500;
/** Profiles are whole trees (thousands of rows each), so they go a few at a time. */
const PROFILE_BATCH = 10;
/**
 * Wall-clock budget for one run. A cron Worker gets 15 minutes; staying well
 * inside it leaves room for the R2 sweeps and means a huge backlog is simply
 * finished by the next day's run instead of being cut off mid-batch.
 */
const DEFAULT_BUDGET_MS = 5 * 60_000;

/**
 * The daily trash purge (decision D6): destroy everything that has been in the
 * trash longer than `TRASH_DAYS` — whole trashed profiles, then transactions,
 * folders (with everything under them) and files — along with their stored
 * objects in R2.
 *
 * Runs from the Worker's cron via the internal route
 * (`app/api/internal/cron/trash-purge`), inside `withRequestContext`.
 *
 * - **Batched**: each batch is one database transaction (`FOR UPDATE SKIP
 *   LOCKED`, so a concurrent "delete forever" is never waited on), and its R2
 *   objects are deleted only after it commits — a rollback never leaves rows
 *   pointing at bytes that are gone. `deleteObjects` sends up to 1,000 keys per
 *   call and logs anything it couldn't remove (`r2.delete_stranded`).
 * - **Idempotent**: every batch re-selects by `deleted_at < cutoff`, and every
 *   delete re-states the trash predicate, so a re-run (or an overlapping one)
 *   finds nothing twice, and an item restored before its batch locked it is
 *   never destroyed.
 * - **Bounded**: it stops at `budgetMs`; whatever is left is still due and the
 *   next run takes it.
 *
 * Logs exactly one prose summary line per run (`trash.purged`).
 */
export async function purgeExpiredTrash(
  opts: { now?: Date; batchSize?: number; budgetMs?: number } = {},
): Promise<PurgeReport> {
  const started = Date.now();
  const cutoff = trashCutoff(opts.now ?? new Date());
  const batch = Math.max(1, opts.batchSize ?? DEFAULT_BATCH);
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const counts: TrashCounts = { ...EMPTY_TRASH_COUNTS };
  let objects = 0;
  let complete = true;

  // Profiles first: destroying one takes its own expired rows with it, so the
  // passes after it have less to do.
  const passes: { kind: keyof TrashCounts; limit: number; run: (limit: number) => ReturnType<typeof destroyTrashedTransactions> }[] = [
    {
      kind: "profiles",
      limit: Math.min(batch, PROFILE_BATCH),
      run: (limit) => destroyTrashedProfiles(lt(profiles.deletedAt, cutoff), limit),
    },
    {
      kind: "transactions",
      limit: batch,
      run: (limit) => destroyTrashedTransactions(lt(transactions.deletedAt, cutoff), limit),
    },
    {
      kind: "folders",
      limit: batch,
      run: (limit) => destroyTrashedFolders(lt(folders.deletedAt, cutoff), limit),
    },
    {
      kind: "files",
      limit: batch,
      run: (limit) => destroyTrashedFiles(lt(files.deletedAt, cutoff), limit),
    },
  ];

  outer: for (const pass of passes) {
    for (;;) {
      if (Date.now() - started >= budgetMs) {
        complete = false;
        break outer;
      }
      const { counts: done, keys } = await pass.run(pass.limit);
      const real = keys.filter((k): k is string => !!k);
      await deleteObjects(real);
      objects += real.length;
      counts.transactions += done.transactions;
      counts.files += done.files;
      counts.folders += done.folders;
      counts.profiles += done.profiles;
      // A short batch means nothing more of this kind is due (or the rest is
      // locked by someone deleting it right now).
      if (done[pass.kind] < pass.limit) break;
    }
  }

  const durationMs = Date.now() - started;
  const what = describeTrashCounts(counts) || "nothing";
  const meta = { event: "trash.purged", ...counts, objects, durationMs, complete, trashDays: TRASH_DAYS };
  if (complete) {
    logger.info(
      `Trash purge removed ${what} older than ${TRASH_DAYS} days and ${objects} stored objects in ${durationMs}ms`,
      meta,
    );
  } else {
    logger.warn(
      `Trash purge removed ${what} and ${objects} stored objects in ${durationMs}ms, then stopped at its time budget with more still due; the next run continues`,
      meta,
    );
  }
  return { counts, objects, durationMs, complete };
}
