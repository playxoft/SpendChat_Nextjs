import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { files, transactionAttachments, transactions } from "@/db/schema";

/** The transaction handle both callers pass in (matches `services/profiles.ts`). */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Every R2 key belonging to a set of profiles — vault files and transaction
 * attachments, originals and thumbnails.
 *
 * Shared by the two paths that destroy profiles wholesale (`deleteProfile` and
 * `deleteAccount`), because nothing cascades in object storage: the keys have to
 * be read while the rows still exist, or the bytes are stranded — unreachable
 * from any screen, unfindable by any later sweep, and still stored and billed.
 * The two used to carry their own copy of these queries, which is how one ended
 * up inside a transaction and the other not. **A new storage-bearing table goes
 * here**, so neither path can forget it.
 *
 * Attachments are selected **through their parent transaction** rather than
 * through their own `profile_id`: that column is denormalized and can be stale,
 * and a sweep keyed on it deletes the bytes behind a transaction that is still
 * alive in another profile.
 *
 * Nulls are kept rather than filtered — `deleteObjects` drops them, and a caller
 * that wants a count of real objects filters for itself. Callers pass a list
 * even for a single profile; one id is a one-element `in (...)`, which costs
 * nothing and saves this module a second code path.
 */
export async function collectProfileObjectKeys(
  tx: Tx,
  profileIds: readonly string[],
): Promise<(string | null)[]> {
  if (profileIds.length === 0) return [];
  const ids = [...profileIds];

  const doomedFiles = await tx
    .select({ r2Key: files.r2Key, thumbnailKey: files.thumbnailKey })
    .from(files)
    .where(ids.length === 1 ? eq(files.profileId, ids[0]!) : inArray(files.profileId, ids));

  const doomedAttachments = await tx
    .select({
      r2Key: transactionAttachments.r2Key,
      thumbnailKey: transactionAttachments.thumbnailKey,
    })
    .from(transactionAttachments)
    .innerJoin(transactions, eq(transactionAttachments.transactionId, transactions.id))
    .where(
      ids.length === 1
        ? eq(transactions.profileId, ids[0]!)
        : inArray(transactions.profileId, ids),
    );

  return [...doomedFiles, ...doomedAttachments].flatMap((r) => [r.r2Key, r.thumbnailKey]);
}
