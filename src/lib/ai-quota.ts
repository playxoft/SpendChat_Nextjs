import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
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
 * **The count and the insert are one statement on purpose.** Reading the count
 * and then inserting leaves a window every concurrent request passes through:
 * fire fifty in parallel and all fifty see a count under the limit, so a cap of
 * 30/hour buys nothing against the one caller it exists to stop. `assertStorage
 * Quota` accepts that same race knowingly, but there the overshoot is bounded by
 * a 5 MB per-file cap; here it is bounded by nothing and is billed to the
 * operator. So the gate is an `INSERT ... SELECT ... WHERE (count) < limit`:
 * Postgres evaluates the subquery and writes the row in a single statement, and
 * an empty result — no row inserted — *is* the rejection. Concurrent callers
 * serialize on the table, so the (N+1)th genuinely loses.
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
  const inserted = await db.execute(sql`
    insert into ai_usage_log (user_id, workspace_id, kind)
    select ${userId}::uuid, ${workspaceId}::uuid, ${kind}
    where (
      select count(*) from ai_usage_log
      where user_id = ${userId}::uuid
        and created_at >= now() - interval '1 hour'
    ) < ${AI_REQUESTS_PER_HOUR}
    returning id
  `);
  if (inserted.rows.length === 0) throw tooManyRequests(limitMessage);
}
