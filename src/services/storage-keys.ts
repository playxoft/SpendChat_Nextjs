import "server-only";
import { eq, inArray, type SQL } from "drizzle-orm";
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
 * The two used to carry their own copy of these queries, which is how one of
 * them ended up inside a transaction and the other not. **Add a new
 * storage-bearing table here**, so neither path can forget it.
 *
 * Attachments are selected **through their parent transaction** rather than
 * through their own `profile_id`: that column is denormalized and can be stale,
 * and a sweep keyed on it deletes the bytes behind a transaction that is still
 * alive in another profile.
 *
 * Nulls are kept rather than filtered — `deleteObjects` drops them, and the
 * caller that wants a count of real objects filters for itself.
 */
export async function collectProfileObjectKeys(
  tx: Tx,
  match: (column: typeof files.profileId | typeof transactions.profileId) => SQL | undefined,
): Promise<(string | null)[]> {
  const doomedFiles = await tx
    .select({ r2Key: files.r2Key, thumbnailKey: files.thumbnailKey })
    .from(files)
    .where(match(files.profileId));

  const doomedAttachments = await tx
    .select({
      r2Key: transactionAttachments.r2Key,
      thumbnailKey: transactionAttachments.thumbnailKey,
    })
    .from(transactionAttachments)
    .innerJoin(transactions, eq(transactionAttachments.transactionId, transactions.id))
    .where(match(transactions.profileId));

  return [...doomedFiles, ...doomedAttachments].flatMap((r) => [r.r2Key, r.thumbnailKey]);
}

/** `collectProfileObjectKeys` for exactly one profile. */
export const forProfile = (id: string) => (col: Parameters<Parameters<typeof collectProfileObjectKeys>[1]>[0]) =>
  eq(col, id);

/** `collectProfileObjectKeys` for a set of profiles. */
export const forProfiles =
  (ids: string[]) => (col: Parameters<Parameters<typeof collectProfileObjectKeys>[1]>[0]) =>
    inArray(col, ids);
