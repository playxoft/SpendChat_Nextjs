import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { aiUsageLog } from "@/db/schema";
import { tooManyRequests } from "@/lib/errors";

/** Max AI model requests one user may trigger per hour. */
export const AI_REQUESTS_PER_HOUR = 30;

/**
 * Per-user hourly cap on calls that reach a paid model provider, enforced
 * *before* the request and after any permission checks (denied calls must not
 * burn quota). Server actions are invocable by any authenticated user regardless
 * of what the UI renders, so without this one account could loop the composer's
 * AI parse and spend the operator's whole API budget.
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
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ used: count() })
    .from(aiUsageLog)
    .where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, oneHourAgo)));
  if ((row?.used ?? 0) >= AI_REQUESTS_PER_HOUR) {
    throw tooManyRequests(limitMessage);
  }
  await db.insert(aiUsageLog).values({ userId, workspaceId, kind });
}
