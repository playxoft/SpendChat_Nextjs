import "server-only";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { splitRateLog } from "@/db/schema";

/**
 * Split's anti-abuse counters (`split_rate_log`), and the numbers they enforce.
 * The log is append-only and separate from the group tables, so deleting a
 * group never hands a budget back. Every check-and-record runs under an
 * advisory lock on what it counts (the actor, or the recipient's inbox), so
 * concurrent requests can't both slip under a cap.
 */

/** Groups one person may start per rolling 24 hours. */
export const SPLIT_GROUPS_PER_DAY = 20;
/**
 * Addresses one person may add to groups per rolling 24 hours, across every
 * group. Besides spam, this is what keeps any "does this address have an
 * account?" side channel too slow to be worth probing.
 */
export const SPLIT_ADDS_PER_DAY = 100;
/** Open invitations one person may have out to one inbox, across groups. */
export const SPLIT_PENDING_PER_INVITEE = 3;
/** Days before someone who declined or left can be invited back into that group. */
export const SPLIT_INVITE_COOLDOWN_DAYS = 30;
/**
 * Split invite emails one person may send per rolling 24 hours (abuse rule
 * D1). Counted here, in `split_rate_log` — deliberately **not** in the shared
 * hourly email pool (`email-quota.ts`): only people without an account are
 * emailed, so if these sends ate into that pool, a workspace invite's 429
 * would tell the sender which of the people they just added have accounts.
 * Nothing a response carries depends on this counter or the per-inbox one.
 */
export const SPLIT_INVITE_EMAILS_PER_DAY = 30;
/** Split invite emails one inbox may receive, from everyone together… */
export const SPLIT_EMAILS_PER_RECIPIENT = 3;
/** …per this many days. */
export const SPLIT_EMAILS_PER_RECIPIENT_DAYS = 7;

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * `draft_imported` is the calculator import's idempotency record:
 * `recipient_key` holds the draft's hash (`services/split-import.ts`).
 */
export type SplitRateEvent = "group_created" | "member_added" | "invite_emailed" | "draft_imported";

/** Advisory-lock namespaces (1–5 are taken by the AI, email and workspace locks). */
const ACTOR_LOCK = 7;
const RECIPIENT_LOCK = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hold this actor's counters for the rest of the transaction. Re-entrant. */
export async function lockActor(tx: Tx, actorId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${ACTOR_LOCK}, hashtext(${actorId}))`);
}

/** How many `event`s this actor logged in the last 24 hours. */
export async function actorEventsToday(tx: Tx, actorId: string, event: SplitRateEvent): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(splitRateLog)
    .where(
      and(
        eq(splitRateLog.actorId, actorId),
        eq(splitRateLog.event, event),
        gte(splitRateLog.createdAt, new Date(Date.now() - DAY_MS)),
      ),
    );
  return row?.n ?? 0;
}

/** Record `times` events for this actor (inside the locked transaction). */
export async function logActorEvents(
  tx: Tx,
  actorId: string,
  event: SplitRateEvent,
  times: number,
): Promise<void> {
  if (times <= 0) return;
  await tx.insert(splitRateLog).values(Array.from({ length: times }, () => ({ actorId, event })));
}

/**
 * Reserve invite emails for a batch: one per item, while the sender is under
 * `SPLIT_INVITE_EMAILS_PER_DAY` and the item's inbox under
 * `SPLIT_EMAILS_PER_RECIPIENT` in its window (every sender counts). Granted
 * items are logged as `invite_emailed` (actor = sender, recipient = inbox hash)
 * in the same transaction, so the reservation *is* the record. Locks: the
 * sender first, then the inboxes in a fixed order — two batches can't
 * deadlock, and neither can slip past a cap.
 */
export async function reserveInviteEmails<T extends { recipientKey: string }>(
  senderId: string,
  items: T[],
): Promise<T[]> {
  if (items.length === 0) return [];
  const db = getDb();
  return db.transaction(async (tx) => {
    await lockActor(tx, senderId);
    const keys = [...new Set(items.map((i) => i.recipientKey))].sort();
    for (const key of keys) {
      await tx.execute(sql`select pg_advisory_xact_lock(${RECIPIENT_LOCK}, hashtext(${key}))`);
    }
    let senderRoom = SPLIT_INVITE_EMAILS_PER_DAY - (await actorEventsToday(tx, senderId, "invite_emailed"));
    const since = new Date(Date.now() - SPLIT_EMAILS_PER_RECIPIENT_DAYS * DAY_MS);
    const rows = await tx
      .select({ key: splitRateLog.recipientKey, n: count() })
      .from(splitRateLog)
      .where(
        and(
          inArray(splitRateLog.recipientKey, keys),
          eq(splitRateLog.event, "invite_emailed"),
          gte(splitRateLog.createdAt, since),
        ),
      )
      .groupBy(splitRateLog.recipientKey);
    const used = new Map(rows.map((r) => [r.key, r.n]));
    const granted: T[] = [];
    for (const item of items) {
      if (senderRoom <= 0) break;
      const n = used.get(item.recipientKey) ?? 0;
      if (n >= SPLIT_EMAILS_PER_RECIPIENT) continue;
      used.set(item.recipientKey, n + 1);
      senderRoom -= 1;
      granted.push(item);
    }
    if (granted.length) {
      await tx.insert(splitRateLog).values(
        granted.map((g) => ({ event: "invite_emailed", actorId: senderId, recipientKey: g.recipientKey })),
      );
    }
    return granted;
  });
}
