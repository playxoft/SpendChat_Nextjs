import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiUsageLog } from "@/db/schema";
import { tooManyRequests } from "@/lib/errors";

/**
 * Max AI model requests one user may trigger per hour.
 *
 * This counts *provider calls*, not user actions, and the two aren't 1:1. A
 * typed note costs one (parse). A dictated one costs **two** — transcribe, then
 * parse the transcript — so voice-driven entry tops out around 15/hour rather
 * than 30. That's deliberate: transcription is the more expensive call, and the
 * budget is a spend ceiling, not a feature quota. Raise this only alongside a
 * look at the provider bill.
 */
export const AI_REQUESTS_PER_HOUR = 30;

/** Advisory-lock namespace, so this can't collide with `email-quota.ts`. */
const LOCK_NAMESPACE = 1;

/**
 * Per-user hourly cap on calls that reach a paid model provider, enforced
 * *before* the request and after any permission checks (denied calls must not
 * burn quota). Server actions are invocable by any authenticated user regardless
 * of what the UI renders, so without this one account could loop the composer's
 * AI parse and spend the operator's whole API budget.
 *
 * **Why the advisory lock.** Counting and then inserting is not a cap: fire
 * fifty requests at once and all fifty read the same under-limit count, so the
 * limit holds only against a caller polite enough to go one at a time — which
 * is not the caller it exists to stop. Folding both into a single
 * `INSERT ... SELECT ... WHERE (count) < limit` looks like it fixes that and
 * does not: under READ COMMITTED the subquery reads a statement snapshot that
 * excludes other sessions' uncommitted rows, and `INSERT` takes only
 * `RowExclusiveLock`, which doesn't conflict with itself. Two concurrent
 * statements both count 29, both insert, and the user is at 31.
 *
 * A per-user advisory lock is what actually serializes them, and it is the
 * **try** form on purpose. `pg_advisory_xact_lock` blocks with no timeout, which
 * turns the exact burst this exists to stop into a queue: 500 simultaneous calls
 * would each open a transaction and hold a real Neon connection while waiting
 * for a budget that only 30 of them can have — a rate limiter that amplifies
 * into connection exhaustion for every other user of the database.
 * `pg_try_advisory_xact_lock` returns immediately instead, and losing the race
 * *is* the answer: a second request arriving while this user's own check is
 * still running is, definitionally, the concurrency the cap exists to refuse.
 * The lock is released when the transaction ends, rollback included, so a
 * failure can't strand it.
 *
 * The key is namespaced (`LOCK_NAMESPACE`, two-argument form) so this doesn't
 * collide with `email-quota.ts`, which locks on the same user id. The two
 * counters share nothing, and without the namespace a user's invite emails and
 * their AI requests would block each other for no reason.
 *
 * Mirrors `assertEmailSendAllowed` in `email-quota.ts`: the log table is both
 * the audit trail and the counter. `kind` labels the call site; the budget is
 * one pool per user, shared across kinds.
 */
export async function assertAiRequestAllowed(
  userId: string,
  workspaceId: string,
  kind: string,
  limitMessage = "That's a lot of AI requests in the last hour — try again later",
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    // Taken before anything is counted. `hashtext` maps the uuid onto the int4
    // key the lock takes; a collision with another user costs one refused
    // request, never a wrong answer, because the count below is still filtered
    // by `userId`.
    const [lock] = (
      await tx.execute<{ got: boolean }>(
        sql`select pg_try_advisory_xact_lock(${LOCK_NAMESPACE}, hashtext(${userId})) as got`,
      )
    ).rows;
    if (!lock?.got) throw tooManyRequests(limitMessage);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [row] = await tx
      .select({ used: count() })
      .from(aiUsageLog)
      .where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, oneHourAgo)));
    if ((row?.used ?? 0) >= AI_REQUESTS_PER_HOUR) {
      // Throwing rolls the transaction back, which releases the lock and
      // guarantees the rejected caller spent nothing.
      throw tooManyRequests(limitMessage);
    }
    await tx.insert(aiUsageLog).values({ userId, workspaceId, kind });
  });
}
