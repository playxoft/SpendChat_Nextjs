import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { splitMembers, users } from "@/db/schema";
import { isUniqueViolation } from "@/lib/errors";
import type { InvitedVia } from "@/lib/attribution";
import { logger } from "@/lib/logger";

/**
 * At an account's first bootstrap: bind the split invitations that were
 * waiting for its (verified) email, so they show up in the app as
 * invitations, and — when there were any — record on `users.acquisition`
 * that this sign-up came from a split invite (`invitedVia: "split"`, the rule
 * documented in `lib/attribution.ts`). Server-side on purpose: the browser's
 * first-touch record can be missing (storage blocked) or point elsewhere (an
 * earlier visit from a search), but the server knows an invitation was waiting.
 *
 * Binding only sets `user_id`; the row stays `invited` until the person
 * presses Join. Returns how many rows were bound.
 */
export async function bindSplitInvitesOnSignup(userId: string, email: string): Promise<number> {
  const db = getDb();
  const address = email.trim().toLowerCase();
  const pending = await db
    .select({ id: splitMembers.id })
    .from(splitMembers)
    .where(
      and(
        isNull(splitMembers.userId),
        eq(splitMembers.email, address),
        eq(splitMembers.status, "invited"),
      ),
    );
  let bound = 0;
  for (const row of pending) {
    try {
      const [done] = await db
        .update(splitMembers)
        .set({ userId })
        .where(and(eq(splitMembers.id, row.id), isNull(splitMembers.userId)))
        .returning({ id: splitMembers.id });
      if (done) bound += 1;
    } catch (err) {
      // The account already has a row in that group — leave this one unbound;
      // the invitations list still finds it by email.
      if (!isUniqueViolation(err)) throw err;
    }
  }
  if (bound > 0) {
    await tagInvitedSignup(userId, "split");
    logger.info(`New account had ${bound} split invitations waiting`, {
      event: "split.signup_bound",
      bound,
    });
  }
  return bound;
}

/** Merge `invitedVia` into `users.acquisition` once (first writer wins, in SQL). */
async function tagInvitedSignup(userId: string, via: InvitedVia): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({
      acquisition: sql`
        coalesce(${users.acquisition}, '{}'::jsonb) || jsonb_build_object(
          'invitedVia', ${via}::text,
          'invitedAt', ${new Date().toISOString()}::text
        )`,
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, userId), sql`${users.acquisition} ->> 'invitedVia' is null`));
}
