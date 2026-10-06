import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetAlertEmails, emailSendLog } from "@/db/schema";
import { tooManyRequests } from "@/lib/errors";

/** Max user-triggered emails (invites, notifications) one user may send per hour. */
export const EMAIL_SENDS_PER_HOUR = 20;

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

// ── Budget alerts: the workspace's own pool ───────────────────────────────

/**
 * Budget-alert emails one workspace may send per calendar month (UTC), across
 * all its budgets and recipients. Alerts are already once per budget × threshold
 * × month; this is the backstop for the one loop that rule can't see — deleting
 * and re-creating a budget — and it bounds a big workspace's worst month. Past
 * it the alerts still show in the app, and their emails stay unsent until the
 * pool refills on the 1st (the next check after that sends them). What this
 * guards is the pool, not delivery: a send that fails after its slot was taken
 * isn't retried.
 */
export const BUDGET_ALERT_EMAILS_PER_MONTH = 30;

/**
 * Advisory-lock namespace for the pool — distinct from every other one in the
 * app (1 AI rate, 2 email rate, 3 invites, 4 AI allowance, 5 workspace
 * creation, 80 budget creation).
 */
const BUDGET_ALERT_LOCK_NAMESPACE = 81;

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * How many alert emails the workspace has left this month — taking the pool's
 * lock for the rest of the caller's transaction, so what it then records with
 * `recordBudgetAlertEmails` can't be double-spent by a racing check.
 *
 * The **blocking** lock, unlike `assertEmailSendAllowed`'s try-lock: this runs
 * after the response with nobody waiting, so a second check queues for a few
 * milliseconds instead of failing. Losing a race can't cost an alert.
 */
export async function budgetAlertEmailsLeft(
  tx: Tx,
  workspaceId: string,
  now: Date = new Date(),
): Promise<number> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${BUDGET_ALERT_LOCK_NAMESPACE}, hashtext(${workspaceId}))`,
  );
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await tx
    .select({ sent: sql<number>`count(*)::int` })
    .from(budgetAlertEmails)
    .where(and(eq(budgetAlertEmails.workspaceId, workspaceId), gte(budgetAlertEmails.createdAt, monthStart)));
  return Math.max(0, BUDGET_ALERT_EMAILS_PER_MONTH - (row?.sent ?? 0));
}

/** Take `count` emails from the pool, in the transaction that read `budgetAlertEmailsLeft`. */
export async function recordBudgetAlertEmails(tx: Tx, workspaceId: string, count: number): Promise<void> {
  if (count <= 0) return;
  await tx
    .insert(budgetAlertEmails)
    .values(Array.from({ length: count }, () => ({ workspaceId })));
}
