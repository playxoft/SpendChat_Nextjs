import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { emailSendLog } from "@/db/schema";
import { tooManyRequests } from "@/lib/errors";

/** Max user-triggered emails (invites, notifications) one user may send per hour. */
export const EMAIL_SENDS_PER_HOUR = 20;

/**
 * Per-user hourly cap on user-triggered emails, enforced *before* the send and
 * after any permission checks (denied calls must not burn quota). Recipients can
 * be arbitrary addresses, so without this a single account could pump
 * phishing/spam through our verified sending domain. Records the send in
 * `email_send_log` (the audit trail *and* the counter) and throws 429 past the cap.
 *
 * Serialized per user with `pg_advisory_xact_lock` for the reason spelled out at
 * length on `assertAiRequestAllowed`: neither a read-then-insert pair nor a
 * single conditional `INSERT` actually stops concurrent callers under READ
 * COMMITTED, and what is at stake here is the reputation of the sending domain —
 * the one thing a burst of parallel invites can burn that no later rejection
 * wins back.
 *
 * `kind` labels the send in the log ("member_invite", "password_changed", …);
 * the budget is one pool per user, shared across kinds. `limitMessage` lets each
 * caller phrase the 429 in its own terms.
 */
export async function assertEmailSendAllowed(
  userId: string,
  kind: string,
  limitMessage = "Too many emails in the last hour — try again later",
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [row] = await tx
      .select({ sent: count() })
      .from(emailSendLog)
      .where(and(eq(emailSendLog.userId, userId), gte(emailSendLog.createdAt, oneHourAgo)));
    if ((row?.sent ?? 0) >= EMAIL_SENDS_PER_HOUR) {
      throw tooManyRequests(limitMessage);
    }
    await tx.insert(emailSendLog).values({ userId, kind });
  });
}
