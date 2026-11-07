import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { badRequest } from "@/lib/errors";
import { isCurrentLegalVersion } from "@/lib/legal";

/**
 * Record that this person agreed to the current Terms + Privacy Policy
 * (`LEGAL_VERSION`) — and, with the same tick, confirmed they're
 * `AGE_RULES.minAge` or older. Only the version in force can be accepted — a
 * page left open across a policy change sends the old one and is refused, so
 * nobody is recorded as agreeing to text they weren't shown.
 *
 * Idempotent: a repeat leaves the first acceptance time alone, so the stored
 * time is when they agreed to *this* version, not the last time they clicked.
 *
 * `newsEmails`: the optional second box ("email me about new features…") was
 * ticked as well — recorded in `users.news_emails_at`. Only a tick ever turns
 * it on here; an unticked box leaves an earlier yes alone (turning it off is a
 * deliberate choice, made in Settings → Account).
 */
export async function acceptTerms(
  userId: string,
  version: unknown,
  choices: { newsEmails?: boolean } = {},
): Promise<void> {
  if (!isCurrentLegalVersion(version)) {
    throw badRequest("These terms have changed since the page loaded. Reload to see the current version.");
  }
  const now = new Date();
  const db = getDb();
  await db
    .update(users)
    .set({ termsVersion: version, termsAcceptedAt: now, updatedAt: now })
    .where(and(eq(users.id, userId), sql`${users.termsVersion} is distinct from ${version}`));
  if (choices.newsEmails === true) {
    await db
      .update(users)
      .set({ newsEmailsAt: now, updatedAt: now })
      .where(and(eq(users.id, userId), isNull(users.newsEmailsAt)));
  }
}

/**
 * Product news by email, on or off (Settings → Account). On keeps the first
 * yes's time; off clears it — the column is the consent, so there's nothing
 * left to send to.
 */
export async function setNewsEmails(userId: string, on: unknown): Promise<{ on: boolean }> {
  if (typeof on !== "boolean") throw badRequest("Expected on or off.");
  const now = new Date();
  await getDb()
    .update(users)
    .set({ newsEmailsAt: on ? sql`coalesce(${users.newsEmailsAt}, ${now.toISOString()}::timestamptz)` : null, updatedAt: now })
    .where(eq(users.id, userId));
  return { on };
}
