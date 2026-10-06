import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { emailSendLog } from "@/db/schema";
import { tooManyRequests } from "@/lib/errors";

/** Max user-triggered emails (invites, notifications) one user may send per hour. */
export const EMAIL_SENDS_PER_HOUR = 20;

/**
 * Split invite emails one person may send per rolling 24 hours (abuse rule
 * D1), on top of the shared hourly pool above. A full group (49 people
 * without accounts) takes two days of emails; everyone past the cap is still
 * added, and the creator shares their join link instead.
 */
export const SPLIT_INVITE_EMAILS_PER_DAY = 30;

/** `email_send_log.kind` for a split invite. */
export const SPLIT_INVITE_EMAIL_KIND = "split_invite";

/** Advisory-lock namespace, distinct from `ai-quota.ts`'s. */
const LOCK_NAMESPACE = 2;

/**
 * Per-user hourly cap on user-triggered emails, enforced *before* the send and
 * after any permission checks (denied calls must not burn quota). Recipients can
 * be arbitrary addresses, so without this a single account could pump
 * phishing/spam through our verified sending domain. Records the send in
 * `email_send_log` (the audit trail *and* the counter) and throws 429 past the cap.
 *
 * Serialized per user with a namespaced `pg_try_advisory_xact_lock` for the
 * reasons spelled out at length on `assertAiRequestAllowed`: neither a
 * read-then-insert pair nor a single conditional `INSERT` actually stops
 * concurrent callers under READ COMMITTED, and the blocking form of the lock
 * would queue a burst instead of refusing it. What is at stake here is the
 * reputation of the sending domain — the one thing a burst of parallel invites
 * can burn that no later rejection wins back.
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
    const [lock] = (
      await tx.execute<{ got: boolean }>(
        sql`select pg_try_advisory_xact_lock(${LOCK_NAMESPACE}, hashtext(${userId})) as got`,
      )
    ).rows;
    if (!lock?.got) throw tooManyRequests(limitMessage);

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

/**
 * Reserve up to `wanted` sends of one kind for a batch, and return how many
 * were granted (0…`wanted`) — never throws for the cap, so the caller can
 * still do the rest of its work (adding people) and offer another way in
 * (a link) to whoever didn't get an email.
 *
 * One transaction under the same advisory lock as `assertEmailSendAllowed`
 * (so the two can't race each other past the shared pool): count this user's
 * sends in the last hour, and — with `perDay` — this kind's in the last 24
 * hours, then record the granted sends in `email_send_log`. The lock is the
 * non-blocking kind for the same reason; a contended call is granted 0.
 */
export async function reserveEmailSends(
  userId: string,
  kind: string,
  wanted: number,
  opts: { perDay?: number } = {},
): Promise<number> {
  if (wanted <= 0) return 0;
  const db = getDb();
  return db.transaction(async (tx) => {
    const [lock] = (
      await tx.execute<{ got: boolean }>(
        sql`select pg_try_advisory_xact_lock(${LOCK_NAMESPACE}, hashtext(${userId})) as got`,
      )
    ).rows;
    if (!lock?.got) return 0;

    const now = Date.now();
    const [hour] = await tx
      .select({ sent: count() })
      .from(emailSendLog)
      .where(and(eq(emailSendLog.userId, userId), gte(emailSendLog.createdAt, new Date(now - 60 * 60 * 1000))));
    let room = EMAIL_SENDS_PER_HOUR - (hour?.sent ?? 0);
    if (opts.perDay !== undefined) {
      const [day] = await tx
        .select({ sent: count() })
        .from(emailSendLog)
        .where(
          and(
            eq(emailSendLog.userId, userId),
            eq(emailSendLog.kind, kind),
            gte(emailSendLog.createdAt, new Date(now - 24 * 60 * 60 * 1000)),
          ),
        );
      room = Math.min(room, opts.perDay - (day?.sent ?? 0));
    }
    const granted = Math.max(0, Math.min(wanted, room));
    if (granted > 0) {
      await tx.insert(emailSendLog).values(Array.from({ length: granted }, () => ({ userId, kind })));
    }
    return granted;
  });
}
