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
 * `pg_advisory_xact_lock` is what actually serializes them. It is keyed on the
 * user, so callers queue only behind themselves and never behind the rest of
 * the workspace, and it is released when the transaction ends — including on
 * rollback, so a failure can't strand the lock. The count and the insert then
 * run with the guarantee the naive version only claimed.
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
    // Taken first, so every concurrent caller for this user is behind it before
    // any of them counts. `hashtext` maps the uuid onto the int4 key the lock
    // takes; a collision with another user costs a moment's waiting, never a
    // wrong answer, because the count below is still filtered by `userId`.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

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
