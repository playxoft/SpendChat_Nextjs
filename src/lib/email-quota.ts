import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
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
 * Counted and inserted in one statement, for the reason spelled out on
 * `assertAiRequestAllowed`: a read-then-insert cap is no cap at all against
 * concurrent requests, and what is at stake here is the reputation of the
 * sending domain — the one thing a burst of parallel invites can burn that no
 * later rejection wins back.
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
  const inserted = await db.execute(sql`
    insert into email_send_log (user_id, kind)
    select ${userId}::uuid, ${kind}
    where (
      select count(*) from email_send_log
      where user_id = ${userId}::uuid
        and created_at >= now() - interval '1 hour'
    ) < ${EMAIL_SENDS_PER_HOUR}
    returning id
  `);
  if (inserted.rows.length === 0) throw tooManyRequests(limitMessage);
}
