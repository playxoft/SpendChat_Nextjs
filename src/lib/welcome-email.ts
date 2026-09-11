import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { redactEmail, sendEmail } from "@/lib/email";
import { welcomeEmail, type MoneyFormat } from "@/lib/email-templates";
import { logger } from "@/lib/logger";
import { siteConfig } from "@/lib/site";

/**
 * Send the welcome email to an account exactly once.
 *
 * Called from `ensureBootstrap` on the branch that creates the user's default
 * workspace — the moment an account first becomes usable. That branch is only
 * *usually* reached once: a first page load fans out into several parallel
 * server requests (the layout, the page, the session bridge) and two of them
 * can both observe "no workspace yet". The workspace inserts tolerate that with
 * `onConflictDoNothing`; an email can't be un-sent. So the send is gated on a
 * single conditional `UPDATE … WHERE welcomed_at IS NULL RETURNING`: under
 * READ COMMITTED the second writer blocks on the row lock, re-evaluates the
 * predicate against the committed value, matches nothing, and gets no row back.
 * Exactly one caller sends.
 *
 * Accounts with no email on file (there shouldn't be any — both sign-in
 * methods require one) are simply never claimed, so a later bootstrap could
 * still send once the address arrives. Nothing is stored about the send
 * beyond the timestamp, and this is deliberately *not* run through the
 * per-user email quota: the quota exists for sends to arbitrary addresses a
 * user typed; this goes to the account's own verified address, once.
 *
 * `money` is the new default workspace's currency/locale, so the example
 * amounts in the email are in the currency the person is about to use.
 *
 * Returns whether this call was the one that sent.
 */
export async function sendWelcomeEmailOnce(
  userId: string,
  money?: MoneyFormat,
): Promise<boolean> {
  const db = getDb();
  const [claimed] = await db
    .update(users)
    .set({ welcomedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.welcomedAt), isNotNull(users.email)))
    .returning({ email: users.email, name: users.name });
  if (!claimed?.email) return false;

  sendEmail({
    to: claimed.email,
    // "Reply to this email" is a promise in the copy; make it land somewhere.
    replyTo: siteConfig.supportEmail,
    ...welcomeEmail({ name: claimed.name, money }),
  });
  logger.info(`Welcome email queued for ${redactEmail(claimed.email)}`, {
    event: "email.welcome_queued",
    userId,
  });
  return true;
}
