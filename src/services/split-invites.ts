import "server-only";
import { and, count, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { splitGroups, splitMembers } from "@/db/schema";
import { parseOrThrow } from "@/lib/api-response";
import { ensureBootstrap, type SessionUser } from "@/lib/auth";
import { redactEmail, sendEmail } from "@/lib/email";
import { siteUrl, splitInviteEmail } from "@/lib/email-templates";
import { recipientHash } from "@/lib/email-key";
import { forbidden, isUniqueViolation, conflict, notFound } from "@/lib/errors";
import { splitInviteEmailPath } from "@/lib/invite-links";
import { logger } from "@/lib/logger";
import { memberLabel } from "@/lib/split-access";
import { inviteTokenSchema } from "@/lib/validation";
import { reserveInviteEmails } from "@/services/split-rate";

/**
 * Split invites for people without an account: the one email (abuse rule D1)
 * and the join link behind it (`/invite/split/<token>`). Account holders never
 * come through here — they get an in-app invitation (`services/split.ts`).
 *
 * **D1, in code:**
 * - *One email per group per address, ever.* The send is claimed on the
 *   member row with `UPDATE … SET invite_emailed_at = $now WHERE
 *   invite_emailed_at IS NULL RETURNING`, so a retry, a double click, a
 *   remove-and-re-add or a second "send" can never send twice. Member rows are
 *   never deleted while the group exists, so the marker can't be lost either.
 * - *A cap per inbox, from every sender together:* at most
 *   `SPLIT_EMAILS_PER_RECIPIENT` split invites per 7 days, counted on a
 *   SHA-256 of the normalised address (`lib/email-key.ts` — `+tag` and Gmail
 *   dots collapse), so one person can't be flooded from many accounts.
 * - *A daily cap per sender* (`SPLIT_INVITE_EMAILS_PER_DAY`). Both are
 *   reserved for the whole batch in one go (`reserveInviteEmails`), in
 *   `split_rate_log` — **not** in the shared hourly email pool, which a
 *   workspace invite's 429 would expose: only people without an account are
 *   emailed, so counting these there would leak who has one. Rows past either
 *   cap are un-claimed — compared on the exact timestamp this call wrote, so a
 *   concurrent claim is never undone — and the person is still in the group;
 *   the creator has their link.
 * - *Only after every check passed:* callers run this after the add has
 *   committed, so a refused add (not the creator, group full) spends nothing.
 *
 * Imports nothing from `services/split.ts` (which calls into here).
 */

const NO_LONGER_ACTIVE = "This invite has already been used or was withdrawn";

/** What each email needs about its group. */
async function groupForEmail(groupId: string) {
  const db = getDb();
  const [group] = await db.select().from(splitGroups).where(eq(splitGroups.id, groupId));
  if (!group) return null;
  const [[people], [creator]] = await Promise.all([
    db
      .select({ n: count() })
      .from(splitMembers)
      .where(and(eq(splitMembers.groupId, groupId), inArray(splitMembers.status, ["invited", "joined"]))),
    db
      .select({ displayName: splitMembers.displayName })
      .from(splitMembers)
      .where(and(eq(splitMembers.groupId, groupId), eq(splitMembers.userId, group.createdBy))),
  ]);
  return {
    group,
    peopleCount: people?.n ?? 0,
    inviterName: creator ? memberLabel(creator) : null,
  };
}

/**
 * Email the given pending rows their one invite, as far as the sender's quota
 * allows. Only rows that are still `invited`, have no account and were never
 * emailed qualify. Returns the ids that were emailed.
 */
export async function emailNewInvitees(
  senderId: string,
  groupId: string,
  memberIds: string[],
): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set();
  const db = getDb();
  // Millisecond precision on purpose: the un-claim below compares on this
  // exact value, and a JS Date can't carry the microseconds `now()` would.
  const claimedAt = new Date();
  const claimed = await db
    .update(splitMembers)
    .set({ inviteEmailedAt: claimedAt })
    .where(
      and(
        inArray(splitMembers.id, memberIds),
        eq(splitMembers.groupId, groupId),
        eq(splitMembers.status, "invited"),
        isNull(splitMembers.userId),
        isNull(splitMembers.inviteEmailedAt),
      ),
    )
    .returning({ id: splitMembers.id, email: splitMembers.email, token: splitMembers.inviteToken });
  const sendable = await Promise.all(
    claimed
      .filter((c): c is { id: string; email: string; token: string } => Boolean(c.email && c.token))
      .map(async (c) => ({ ...c, recipientKey: await recipientHash(c.email) })),
  );

  // The sender's daily allowance and each inbox's weekly one, together.
  const sending = await reserveInviteEmails(senderId, sendable);

  const sendingIds = new Set(sending.map((r) => r.id));
  const overflow = claimed.filter((c) => !sendingIds.has(c.id));
  if (overflow.length) {
    await db
      .update(splitMembers)
      .set({ inviteEmailedAt: null })
      .where(
        and(
          inArray(
            splitMembers.id,
            overflow.map((o) => o.id),
          ),
          eq(splitMembers.inviteEmailedAt, claimedAt),
        ),
      );
    logger.warn(`Split invite emails over a cap: ${overflow.length} not sent`, {
      event: "split.invite_email_capped",
      groupId,
      skipped: overflow.length,
    });
  }
  if (sending.length === 0) return new Set();

  const info = await groupForEmail(groupId);
  if (!info) return new Set();
  for (const row of sending) {
    sendEmail({
      to: row.email,
      ...splitInviteEmail({
        groupName: info.group.name,
        groupIcon: info.group.icon,
        inviterName: info.inviterName,
        peopleCount: info.peopleCount,
        currency: info.group.currency,
        joinUrl: siteUrl(splitInviteEmailPath(row.token)),
        recipientEmail: row.email,
      }),
    });
    logger.info(`Split invite emailed to ${redactEmail(row.email)}`, {
      event: "split.invite_emailed",
      groupId,
      memberId: row.id,
    });
  }
  return sendingIds;
}

/* ------------------------------------------------------------------------- */
/* The join link                                                              */
/* ------------------------------------------------------------------------- */

/** What the join page shows a token holder. */
export type SplitInvitePreview = {
  groupId: string;
  groupName: string;
  groupIcon: string | null;
  currency: string;
  inviterName: string | null;
  peopleCount: number;
  /**
   * The invited address, lowercased. The page shows it in full only to that
   * account (and masks it for anyone else holding the link).
   */
  email: string;
};

async function pendingRowByToken(token: string) {
  const db = getDb();
  const [row] = await db
    .select({ member: splitMembers, group: splitGroups })
    .from(splitMembers)
    .innerJoin(splitGroups, eq(splitGroups.id, splitMembers.groupId))
    .where(and(eq(splitMembers.inviteToken, token), eq(splitMembers.status, "invited")))
    .limit(1);
  return row ?? null;
}

/**
 * Resolve a join link, or null when it's unknown — used, withdrawn (leaving or
 * removal nulls the token) or made up. No auth: the page renders this to a
 * signed-out visitor. The token is the secret; nothing is reachable without it.
 */
export async function getSplitInviteByToken(rawToken: unknown): Promise<SplitInvitePreview | null> {
  const parsed = inviteTokenSchema.safeParse(rawToken);
  if (!parsed.success) return null;
  const row = await pendingRowByToken(parsed.data);
  if (!row?.member.email) return null;
  const info = await groupForEmail(row.group.id);
  return {
    groupId: row.group.id,
    groupName: row.group.name,
    groupIcon: row.group.icon,
    currency: row.group.currency,
    inviterName: info?.inviterName ?? null,
    peopleCount: info?.peopleCount ?? 0,
    email: row.member.email,
  };
}

/**
 * Join from the link, as the signed-in user. **Bound to the invited email**:
 * a different account holding the link (a forwarded email, a link pasted in a
 * group chat) is refused, and so is any account other than the one the row
 * was bound to. One conditional UPDATE does the join, so a second click — or
 * a removal in between — matches nothing.
 */
export async function acceptSplitInviteByToken(
  user: Pick<SessionUser, "id" | "email">,
  rawToken: unknown,
): Promise<{ groupId: string }> {
  const token = parseOrThrow(inviteTokenSchema, rawToken);
  const row = await pendingRowByToken(token);
  if (!row) throw notFound(NO_LONGER_ACTIVE);
  const email = user.email?.trim().toLowerCase();
  if (!email || email !== row.member.email) {
    throw forbidden("This invite was sent to a different email address");
  }
  if (row.member.userId !== null && row.member.userId !== user.id) {
    throw forbidden("This invite was sent to a different account");
  }

  // A brand-new account: create its defaults (and bind its other invitations).
  await ensureBootstrap(user.id);
  const db = getDb();
  const [joined] = await db
    .update(splitMembers)
    .set({ status: "joined", userId: user.id, joinedAt: new Date(), inviteToken: null })
    .where(
      and(
        eq(splitMembers.id, row.member.id),
        eq(splitMembers.status, "invited"),
        eq(splitMembers.inviteToken, token),
        eq(splitMembers.email, email),
        or(isNull(splitMembers.userId), eq(splitMembers.userId, user.id)),
      ),
    )
    .returning({ groupId: splitMembers.groupId })
    .catch((err: unknown) => {
      if (isUniqueViolation(err)) throw conflict("You're already in this group");
      throw err;
    });
  if (!joined) throw notFound(NO_LONGER_ACTIVE);
  logger.info("Split invite accepted from its join link", {
    event: "split.invite_accepted",
    groupId: joined.groupId,
    memberId: row.member.id,
  });
  return { groupId: joined.groupId };
}
