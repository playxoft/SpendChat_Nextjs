import "server-only";
import { cache } from "react";
import { and, asc, count, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  splitExpensePayers,
  splitExpenses,
  splitGroups,
  splitMembers,
  splitSettlements,
  splitShares,
  users,
  type SplitGroup,
  type SplitMember,
  type SplitMemberStatus,
} from "@/db/schema";
import { parseOrThrow } from "@/lib/api-response";
import type { SessionUser } from "@/lib/auth";
import { findUserById } from "@/lib/directory";
import { emailKey } from "@/lib/email-key";
import {
  ApiError,
  badRequest,
  conflict,
  forbidden,
  isUniqueViolation,
  notFound,
  tooManyRequests,
  validationError,
} from "@/lib/errors";
import { generateInviteToken } from "@/lib/invite-links";
import { emailNewInvitees } from "@/services/split-invites";
import {
  actorEventsToday,
  lockActor,
  logActorEvents,
  SPLIT_ADDS_PER_DAY,
  SPLIT_GROUPS_PER_DAY,
  SPLIT_INVITE_COOLDOWN_DAYS,
  SPLIT_PENDING_PER_INVITEE,
} from "@/services/split-rate";
import { logger } from "@/lib/logger";
import { SPLIT_GROUP_MAX_PEOPLE } from "@/lib/plans";
import {
  canManageGroup,
  canSeeEmail,
  memberLabel,
  SPLIT_DELETED_MEMBER_NAME,
  type SplitViewer,
} from "@/lib/split-access";
import {
  netBalances,
  suggestSettlements,
  type MemberBalance,
  type SettlementSuggestion,
} from "@/lib/split-math";
import {
  addSplitMembersSchema,
  createSplitGroupSchema,
  SPLIT_MEMBER_NAME_MAX,
  updateSplitGroupSchema,
} from "@/lib/validation";

/**
 * Split groups: people sharing expenses — a trip, a flat, a dinner — **outside
 * every workspace**. Nothing here has a workspace, a plan or a transaction; the
 * only bridge into a workspace is "add my share" (`split-ledger.ts`). Shared by
 * the web actions and the REST API.
 *
 * Access (rules in `lib/split-access.ts`): only a *joined* member can see a
 * group — anyone else gets a 404, so a group's existence never leaks. The
 * creator manages it; members add expenses and settle up. Someone added by
 * email is `invited` until they join: an account holder sees an in-app
 * invitation (never an email), someone without one gets one email and a join
 * link. **The creator can't tell which** — every add answers `invited`, every
 * pending row has a copyable link — so adding people is no way to learn
 * whether an address has an account (review of PR #96, S1).
 *
 * The 50-person cap (`SPLIT_GROUP_MAX_PEOPLE`, the creator included, the same
 * on every plan) counts `invited` + `joined` rows, and every add takes the
 * group row `FOR UPDATE` first, so two concurrent adds can't both squeeze in.
 */

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;

const idSchema = z.string().uuid();

/** People who count toward the cap and appear in the group. */
const ACTIVE: SplitMemberStatus[] = ["invited", "joined"];

const GROUP_NOT_FOUND = "Group not found";

/** 409 `split_group_full` — no plan lifts this one, so it isn't a `plan_limit`. */
function groupFull(used: number): ApiError {
  return new ApiError(
    409,
    "split_group_full",
    `A group holds up to ${SPLIT_GROUP_MAX_PEOPLE} people, you included`,
    { max: SPLIT_GROUP_MAX_PEOPLE, used },
  );
}

/** 409 `settle_first` — leaving or removing someone who still owes or is owed. */
export function settleFirst(message: string): ApiError {
  return new ApiError(409, "settle_first", message);
}

/** A uuid from a URL/body, or a 404 — a malformed id is just a group that isn't there. */
export function parseSplitId(raw: unknown, what = GROUP_NOT_FOUND): string {
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) throw notFound(what);
  return parsed.data;
}

export type JoinedContext = { group: SplitGroup; me: SplitMember; viewer: SplitViewer };

/**
 * How a write holds the group while it checks and changes membership-dependent
 * state. `update` (adding, removing, leaving) excludes everything else on the
 * group; `share` (expenses, settlements) only excludes those — so an expense
 * can't name someone in the instant they're being removed, while two expenses
 * still go in side by side.
 */
export type GroupLock = "update" | "share";

/**
 * The group and the caller's *joined* row, or a 404 — for strangers, people
 * who left, and invitees who haven't joined yet alike. With `lock` (inside a
 * transaction) the group row is locked *before* membership is read, so the
 * answer can't change before the write that depends on it commits.
 */
export async function requireJoined(
  userId: string,
  rawGroupId: unknown,
  db?: DbOrTx,
  lock?: GroupLock,
): Promise<JoinedContext> {
  const groupId = parseSplitId(rawGroupId);
  // A plain read (no transaction, no lock) is shared across one RSC render —
  // the group page asks three times. React's `cache` is a pass-through
  // everywhere else, so no write path ever sees a stale answer.
  if (!db && !lock) return joinedRead(userId, groupId);
  const exec = db ?? getDb();
  if (lock) {
    await exec.select({ id: splitGroups.id }).from(splitGroups).where(eq(splitGroups.id, groupId)).for(lock);
  }
  return loadJoined(userId, groupId, exec);
}

const joinedRead = cache((userId: string, groupId: string) => loadJoined(userId, groupId, getDb()));

async function loadJoined(userId: string, groupId: string, db: DbOrTx): Promise<JoinedContext> {
  const [row] = await db
    .select({ group: splitGroups, me: splitMembers })
    .from(splitMembers)
    .innerJoin(splitGroups, eq(splitGroups.id, splitMembers.groupId))
    .where(
      and(
        eq(splitMembers.groupId, groupId),
        eq(splitMembers.userId, userId),
        eq(splitMembers.status, "joined"),
      ),
    )
    .limit(1);
  if (!row) throw notFound(GROUP_NOT_FOUND);
  return {
    group: row.group,
    me: row.me,
    viewer: { userId, memberId: row.me.id, isCreator: row.group.createdBy === userId },
  };
}

/** The creator's context, or 403 for a member (and 404 for anyone else). */
export async function requireCreator(
  userId: string,
  rawGroupId: unknown,
  db?: DbOrTx,
  lock?: GroupLock,
): Promise<JoinedContext> {
  const ctx = await requireJoined(userId, rawGroupId, db, lock);
  if (!canManageGroup(ctx.viewer)) throw forbidden("Only the person who created the group can do that");
  return ctx;
}

/* ------------------------------------------------------------------------- */
/* Balances                                                                   */
/* ------------------------------------------------------------------------- */

type Totals = Record<string, number>;

function toTotals(rows: { memberId: string; total: number }[]): Totals {
  return Object.fromEntries(rows.map((r) => [r.memberId, r.total]));
}

const sumMinor = (
  col:
    | typeof splitExpensePayers.amountMinor
    | typeof splitShares.amountMinor
    | typeof splitSettlements.amountMinor,
) =>
  sql<number>`coalesce(sum(${col}), 0)::bigint`.mapWith(Number);

/**
 * Per-member ledger sums for some members — four `GROUP BY` queries, never a
 * load of every expense. Members may span groups (the groups list).
 */
async function ledgerTotals(memberIds: string[], db: DbOrTx) {
  if (memberIds.length === 0) return { paid: {}, owed: {}, sent: {}, received: {} };
  const [paid, owed, sent, received] = await Promise.all([
    db
      // Each payer is credited with what they paid (one row for a single payer).
      .select({ memberId: splitExpensePayers.memberId, total: sumMinor(splitExpensePayers.amountMinor) })
      .from(splitExpensePayers)
      .where(inArray(splitExpensePayers.memberId, memberIds))
      .groupBy(splitExpensePayers.memberId),
    db
      .select({ memberId: splitShares.memberId, total: sumMinor(splitShares.amountMinor) })
      .from(splitShares)
      // 0 rows (kept for a workspace link) owe nothing; leave them out.
      .where(and(inArray(splitShares.memberId, memberIds), gt(splitShares.amountMinor, 0)))
      .groupBy(splitShares.memberId),
    db
      .select({ memberId: splitSettlements.fromMemberId, total: sumMinor(splitSettlements.amountMinor) })
      .from(splitSettlements)
      .where(inArray(splitSettlements.fromMemberId, memberIds))
      .groupBy(splitSettlements.fromMemberId),
    db
      .select({ memberId: splitSettlements.toMemberId, total: sumMinor(splitSettlements.amountMinor) })
      .from(splitSettlements)
      .where(inArray(splitSettlements.toMemberId, memberIds))
      .groupBy(splitSettlements.toMemberId),
  ]);
  return {
    paid: toTotals(paid),
    owed: toTotals(owed),
    sent: toTotals(sent),
    received: toTotals(received),
  };
}

/** Net balance of every given member (positive = is owed). */
export async function memberBalances(
  memberIds: string[],
  db: DbOrTx = getDb(),
): Promise<MemberBalance[]> {
  return netBalances(memberIds, await ledgerTotals(memberIds, db));
}

/**
 * Every row of a group: the creator first, then in join order. Without `db`
 * it's a plain read, shared across one RSC render like `requireJoined`.
 */
export function groupMembers(groupId: string, db?: DbOrTx): Promise<SplitMember[]> {
  return db ? loadMembers(groupId, db) : membersRead(groupId);
}

const membersRead = cache((groupId: string) => loadMembers(groupId, getDb()));

function loadMembers(groupId: string, db: DbOrTx): Promise<SplitMember[]> {
  return db
    .select()
    .from(splitMembers)
    .where(eq(splitMembers.groupId, groupId))
    .orderBy(
      sql`${splitMembers.invitedBy} is not null`,
      asc(splitMembers.createdAt),
      asc(splitMembers.id),
    );
}

/* ------------------------------------------------------------------------- */
/* Reads                                                                      */
/* ------------------------------------------------------------------------- */

export type SplitGroupSummary = {
  id: string;
  name: string;
  icon: string | null;
  currency: string;
  isCreator: boolean;
  /** `invited` + `joined` — what the 50-person cap counts. */
  peopleCount: number;
  /** The caller's balance in this group (positive = is owed). */
  myNetMinor: number;
  createdAt: Date;
  /** The newest expense or payment — the chat list's preview line. Web only. */
  lastActivity: SplitActivity | null;
};

/** One line of "what happened last" in a group, for the groups list. */
export type SplitActivity =
  | {
      kind: "expense";
      title: string;
      amountMinor: number;
      /** The main payer (whoever paid the most). */
      payerName: string;
      payerIsYou: boolean;
      /** Everyone who paid, the most first — one entry when one person paid. */
      payers: { name: string; isYou: boolean }[];
      at: Date;
    }
  | {
      kind: "payment";
      amountMinor: number;
      fromName: string;
      fromIsYou: boolean;
      toName: string;
      toIsYou: boolean;
      at: Date;
    };

/**
 * The newest expense and payment of each group, whichever came later. Two
 * `DISTINCT ON` reads however many groups there are, plus one for the names.
 */
async function lastActivities(
  groupIds: string[],
  myMemberIds: Set<string>,
  db: DbOrTx,
): Promise<Map<string, SplitActivity>> {
  const [expenses, payments] = await Promise.all([
    db
      .selectDistinctOn([splitExpenses.groupId], {
        id: splitExpenses.id,
        groupId: splitExpenses.groupId,
        title: splitExpenses.title,
        amountMinor: splitExpenses.amountMinor,
        payer: splitExpenses.paidByMemberId,
        at: splitExpenses.createdAt,
      })
      .from(splitExpenses)
      .where(inArray(splitExpenses.groupId, groupIds))
      .orderBy(splitExpenses.groupId, desc(splitExpenses.createdAt), desc(splitExpenses.id)),
    db
      .selectDistinctOn([splitSettlements.groupId], {
        groupId: splitSettlements.groupId,
        amountMinor: splitSettlements.amountMinor,
        from: splitSettlements.fromMemberId,
        to: splitSettlements.toMemberId,
        at: splitSettlements.createdAt,
      })
      .from(splitSettlements)
      .where(inArray(splitSettlements.groupId, groupIds))
      .orderBy(splitSettlements.groupId, desc(splitSettlements.createdAt), desc(splitSettlements.id)),
  ]);
  const paid = expenses.length
    ? await db
        .select()
        .from(splitExpensePayers)
        .where(
          inArray(
            splitExpensePayers.expenseId,
            expenses.map((e) => e.id),
          ),
        )
    : [];
  const memberIds = [
    ...new Set([
      ...expenses.map((e) => e.payer),
      ...paid.map((p) => p.memberId),
      ...payments.flatMap((p) => [p.from, p.to]),
    ]),
  ];
  const names = new Map(
    memberIds.length
      ? (
          await db
            .select({ id: splitMembers.id, displayName: splitMembers.displayName })
            .from(splitMembers)
            .where(inArray(splitMembers.id, memberIds))
        ).map((m) => [m.id, memberLabel(m)])
      : [],
  );
  const out = new Map<string, SplitActivity>();
  for (const e of expenses) {
    out.set(e.groupId, {
      kind: "expense",
      title: e.title,
      amountMinor: e.amountMinor,
      payerName: names.get(e.payer) ?? "",
      payerIsYou: myMemberIds.has(e.payer),
      payers: (paid.some((p) => p.expenseId === e.id)
        ? paid.filter((p) => p.expenseId === e.id)
        : [{ memberId: e.payer, amountMinor: e.amountMinor }]
      )
        .sort(
          (a, b) =>
            b.amountMinor - a.amountMinor ||
            (a.memberId === e.payer ? -1 : b.memberId === e.payer ? 1 : a.memberId < b.memberId ? -1 : 1),
        )
        .map((p) => ({ name: names.get(p.memberId) ?? "", isYou: myMemberIds.has(p.memberId) })),
      at: e.at,
    });
  }
  for (const p of payments) {
    const current = out.get(p.groupId);
    if (current && current.at >= p.at) continue;
    out.set(p.groupId, {
      kind: "payment",
      amountMinor: p.amountMinor,
      fromName: names.get(p.from) ?? "",
      fromIsYou: myMemberIds.has(p.from),
      toName: names.get(p.to) ?? "",
      toIsYou: myMemberIds.has(p.to),
      at: p.at,
    });
  }
  return out;
}

/** The groups the caller has joined, newest first, each with their balance. */
export async function listGroups(userId: string): Promise<SplitGroupSummary[]> {
  const db = getDb();
  const rows = await db
    .select({ group: splitGroups, memberId: splitMembers.id })
    .from(splitMembers)
    .innerJoin(splitGroups, eq(splitGroups.id, splitMembers.groupId))
    .where(and(eq(splitMembers.userId, userId), eq(splitMembers.status, "joined")))
    .orderBy(desc(splitGroups.createdAt), desc(splitGroups.id));
  if (rows.length === 0) return [];

  const groupIds = rows.map((r) => r.group.id);
  const [counts, balances, activity] = await Promise.all([
    db
      .select({ groupId: splitMembers.groupId, n: count() })
      .from(splitMembers)
      .where(and(inArray(splitMembers.groupId, groupIds), inArray(splitMembers.status, ACTIVE)))
      .groupBy(splitMembers.groupId),
    memberBalances(rows.map((r) => r.memberId), db),
    lastActivities(groupIds, new Set(rows.map((r) => r.memberId)), db),
  ]);
  const people = new Map(counts.map((c) => [c.groupId, c.n]));
  const net = new Map(balances.map((b) => [b.memberId, b.netMinor]));
  return rows.map(({ group, memberId }) => ({
    id: group.id,
    name: group.name,
    icon: group.icon,
    currency: group.currency,
    isCreator: group.createdBy === userId,
    peopleCount: people.get(group.id) ?? 0,
    myNetMinor: net.get(memberId) ?? 0,
    createdAt: group.createdAt,
    lastActivity: activity.get(group.id) ?? null,
  }));
}

export type SplitMemberView = {
  id: string;
  name: string;
  /** Only for the creator, and for the member's own row. */
  email: string | null;
  status: SplitMemberStatus;
  isCreator: boolean;
  isYou: boolean;
  netMinor: number;
  /**
   * Creator only, for everyone still invited (with or without an account —
   * the same for both, so it says nothing about which): the join link's token.
   */
  inviteToken: string | null;
};

export type SplitGroupDetail = {
  group: {
    id: string;
    name: string;
    icon: string | null;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
  };
  me: { memberId: string; isCreator: boolean };
  /** Active people first (join order), then former members who still have a balance. */
  members: SplitMemberView[];
  /** Who should pay whom to settle every balance. */
  suggestions: SettlementSuggestion[];
  peopleCount: number;
  maxPeople: number;
  /** Any expense or settlement yet — the currency is fixed from then on. */
  hasActivity: boolean;
};

/** Project member rows into what this viewer may see. */
export function viewMembers(
  rows: SplitMember[],
  balances: MemberBalance[],
  ctx: JoinedContext,
): SplitMemberView[] {
  const net = new Map(balances.map((b) => [b.memberId, b.netMinor]));
  return rows
    .map((m) => {
      const creatorView = ctx.viewer.isCreator;
      return {
        id: m.id,
        name: memberLabel(m),
        email: canSeeEmail(ctx.viewer, m) ? m.email : null,
        status: m.status,
        isCreator: m.userId !== null && m.userId === ctx.group.createdBy,
        isYou: m.id === ctx.me.id,
        netMinor: net.get(m.id) ?? 0,
        inviteToken: creatorView && m.status === "invited" ? m.inviteToken : null,
      };
    })
    .filter((m) => m.status !== "left" || m.netMinor !== 0);
}

async function hasActivity(groupId: string, db: DbOrTx): Promise<boolean> {
  const [row] = await db.execute<{ any: boolean }>(sql`
    select exists (select 1 from ${splitExpenses} where ${splitExpenses.groupId} = ${groupId})
        or exists (select 1 from ${splitSettlements} where ${splitSettlements.groupId} = ${groupId})
       as any`).then((r) => r.rows);
  return Boolean(row?.any);
}

/** Everything the group page shows above the expense list. */
export async function getGroupDetail(userId: string, rawGroupId: unknown): Promise<SplitGroupDetail> {
  const db = getDb();
  const ctx = await requireJoined(userId, rawGroupId);
  const rows = await groupMembers(ctx.group.id);
  const [balances, activity] = await Promise.all([
    memberBalances(rows.map((m) => m.id), db),
    hasActivity(ctx.group.id, db),
  ]);
  const members = viewMembers(rows, balances, ctx);
  return {
    group: {
      id: ctx.group.id,
      name: ctx.group.name,
      icon: ctx.group.icon,
      currency: ctx.group.currency,
      createdAt: ctx.group.createdAt,
      updatedAt: ctx.group.updatedAt,
    },
    me: { memberId: ctx.me.id, isCreator: ctx.viewer.isCreator },
    members: [
      ...members.filter((m) => m.status !== "left"),
      ...members.filter((m) => m.status === "left"),
    ],
    suggestions: suggestSettlements(balances),
    peopleCount: rows.filter((m) => ACTIVE.includes(m.status)).length,
    maxPeople: SPLIT_GROUP_MAX_PEOPLE,
    hasActivity: activity,
  };
}

/* ------------------------------------------------------------------------- */
/* Groups                                                                     */
/* ------------------------------------------------------------------------- */

export type AddedPerson = {
  memberId: string;
  /** Lowercased. Only ever returned to the creator who typed it. */
  email: string;
  /**
   * `invited` — they're in the group as invited, whatever happened next (an
   * in-app invitation for an account holder; one email for anyone else). The
   * same answer either way, so it reveals nothing about the address.
   * `already` — they were already in the group; nothing changed.
   */
  status: "invited" | "already";
};

type Person = { email: string; name: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Add people inside the caller's transaction, with the group row already
 * locked. Re-adding someone who left reactivates their row — same id, so their
 * history reconnects, and the same `invite_emailed_at`, so no second email.
 *
 * Refused, before anything is written (so a refusal spends no quota):
 * - two addresses that are one inbox (`emailKey`), or the creator's own;
 * - someone who declined or left this group in the last 30 days;
 * - an inbox the creator already has 3 open invitations out to;
 * - more than `SPLIT_ADDS_PER_DAY` new people from this creator in 24 hours;
 * - a group past 50 people.
 * None of these depend on whether an address has an account.
 */
export async function insertPeople(
  tx: Tx,
  group: SplitGroup,
  creatorEmail: string | null,
  people: Person[],
  invitedBy: string,
): Promise<{ added: AddedPerson[]; pendingIds: string[] }> {
  if (people.length === 0) return { added: [], pendingIds: [] };
  const keyed = people.map((p) => ({ ...p, key: emailKey(p.email) }));
  if (creatorEmail && keyed.some((p) => p.key === emailKey(creatorEmail))) {
    throw badRequest("You're already in the group");
  }
  if (new Set(keyed.map((p) => p.key)).size !== keyed.length) {
    throw validationError("Two of these addresses go to the same inbox", {
      members: "Two of these addresses go to the same inbox",
    });
  }
  const keys = keyed.map((p) => p.key);
  const emails = keyed.map((p) => p.email);
  await lockActor(tx, invitedBy);
  const [existing, accounts, [active], addsToday] = await Promise.all([
    tx
      .select()
      .from(splitMembers)
      .where(and(eq(splitMembers.groupId, group.id), inArray(splitMembers.emailKey, keys))),
    tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(sql`lower(${users.email})`, emails)),
    tx
      .select({ n: count() })
      .from(splitMembers)
      .where(and(eq(splitMembers.groupId, group.id), inArray(splitMembers.status, ACTIVE))),
    actorEventsToday(tx, invitedBy, "member_added"),
  ]);
  const byKey = new Map(existing.map((m) => [m.emailKey, m]));
  const accountByEmail = new Map(accounts.map((a) => [a.email?.toLowerCase(), a.id]));
  const joining = keyed.filter((p) => {
    const row = byKey.get(p.key);
    return !row || row.status === "left";
  });

  const now = Date.now();
  const cooling = joining.filter((p) => {
    const until = byKey.get(p.key)?.inviteCooldownUntil;
    return until != null && until.getTime() > now;
  });
  if (cooling.length) {
    throw new ApiError(
      409,
      "invite_cooldown",
      "Someone in the list recently left or turned down this group, so they can't be invited back yet",
      {
        emails: cooling.map((p) => p.email),
        until: new Date(Math.max(...cooling.map((p) => byKey.get(p.key)!.inviteCooldownUntil!.getTime()))).toISOString(),
      },
    );
  }

  if (joining.length) {
    const open = await tx
      .select({ key: splitMembers.emailKey, n: count() })
      .from(splitMembers)
      .where(
        and(
          eq(splitMembers.invitedBy, invitedBy),
          eq(splitMembers.status, "invited"),
          inArray(
            splitMembers.emailKey,
            joining.map((p) => p.key),
          ),
          ne(splitMembers.groupId, group.id),
        ),
      )
      .groupBy(splitMembers.emailKey);
    const busy = new Set(open.filter((o) => o.n >= SPLIT_PENDING_PER_INVITEE).map((o) => o.key));
    const swamped = joining.filter((p) => busy.has(p.key));
    if (swamped.length) {
      throw new ApiError(
        409,
        "conflict",
        `Someone in the list already has ${SPLIT_PENDING_PER_INVITEE} open invitations from you — wait until they answer one`,
        { emails: swamped.map((p) => p.email) },
      );
    }
  }

  if (addsToday + joining.length > SPLIT_ADDS_PER_DAY) {
    throw tooManyRequests(
      `You can add up to ${SPLIT_ADDS_PER_DAY} people a day across your groups — try again tomorrow`,
    );
  }
  const used = active?.n ?? 0;
  if (used + joining.length > SPLIT_GROUP_MAX_PEOPLE) throw groupFull(used);

  const added: AddedPerson[] = [];
  const pendingIds: string[] = [];
  for (const person of keyed) {
    const row = byKey.get(person.key);
    if (row && row.status !== "left") {
      added.push({ memberId: row.id, email: person.email, status: "already" });
      continue;
    }
    const accountId = row?.userId ?? accountByEmail.get(person.email) ?? null;
    const values = {
      email: person.email,
      emailKey: person.key,
      displayName: person.name,
      status: "invited" as const,
      invitedBy,
      inviteToken: generateInviteToken(),
      userId: accountId,
      joinedAt: null,
      inviteCooldownUntil: null,
    };
    const [saved] = row
      ? await tx.update(splitMembers).set(values).where(eq(splitMembers.id, row.id)).returning()
      : await tx
          .insert(splitMembers)
          .values({ ...values, groupId: group.id })
          .returning();
    added.push({ memberId: saved!.id, email: person.email, status: "invited" });
    if (!accountId) pendingIds.push(saved!.id);
  }
  await logActorEvents(tx, invitedBy, "member_added", joining.length);
  return { added, pendingIds };
}

function rethrowAlreadyMember(err: unknown): never {
  // A person whose account is already bound to another row of the group (they
  // changed their address since) — the (group, user) unique index says so.
  if (isUniqueViolation(err)) throw conflict("That person is already in the group");
  throw err;
}

/** The label the creator's own row gets: their account name, else a neutral word. */
function creatorLabel(name: string | null | undefined): string {
  return name?.trim().slice(0, SPLIT_MEMBER_NAME_MAX) || "Organiser";
}

export type AddPeopleResult = { added: AddedPerson[] };

/**
 * After an add has committed — so a refused add never spends email quota —
 * send the new no-account people their one invite email (abuse rule D1,
 * `services/split-invites.ts`). Deliberately reports nothing back: whether an
 * email went is exactly what would tell the creator who has an account.
 */
async function deliverInvites(senderId: string, groupId: string, pendingIds: string[]): Promise<void> {
  await emailNewInvitees(senderId, groupId, pendingIds);
}

/**
 * Create a group with the caller as its creator (a `joined` row) and,
 * optionally, the first people to invite. Returns the new group's id and what
 * happened to each person.
 */
export async function createGroup(
  user: Pick<SessionUser, "id">,
  input: unknown,
): Promise<{ id: string } & AddPeopleResult> {
  const data = parseOrThrow(createSplitGroupSchema, input);
  const account = await findUserById(user.id);
  const creatorEmail = account?.email?.trim().toLowerCase() ?? null;
  const db = getDb();
  const result = await db
    .transaction(async (tx) => {
      // A daily cap on new groups, counted in the rate log so deleting a
      // group doesn't hand the slot back.
      await lockActor(tx, user.id);
      if ((await actorEventsToday(tx, user.id, "group_created")) >= SPLIT_GROUPS_PER_DAY) {
        throw tooManyRequests(`You can start up to ${SPLIT_GROUPS_PER_DAY} groups a day — try again tomorrow`);
      }
      await logActorEvents(tx, user.id, "group_created", 1);
      const [group] = await tx
        .insert(splitGroups)
        .values({
          name: data.name,
          icon: data.icon?.trim() ? data.icon.trim() : null,
          currency: data.currency,
          createdBy: user.id,
        })
        .returning();
      await tx.insert(splitMembers).values({
        groupId: group!.id,
        userId: user.id,
        email: creatorEmail,
        emailKey: creatorEmail ? emailKey(creatorEmail) : null,
        displayName: creatorLabel(account?.name),
        status: "joined",
        joinedAt: new Date(),
      });
      const people = await insertPeople(tx, group!, creatorEmail, data.members, user.id);
      return { id: group!.id, ...people };
    })
    .catch(rethrowAlreadyMember);
  await deliverInvites(user.id, result.id, result.pendingIds);
  logger.info(`Split group created with ${result.added.length} people invited`, {
    event: "split.group_created",
    groupId: result.id,
    invited: result.added.length,
  });
  return { id: result.id, added: result.added };
}

/** Add people to a group (creator only). The cap is checked under the group's row lock. */
export async function addMembers(
  userId: string,
  rawGroupId: unknown,
  input: unknown,
): Promise<AddPeopleResult & { groupId: string }> {
  const data = parseOrThrow(addSplitMembersSchema, input);
  const db = getDb();
  const result = await db
    .transaction(async (tx) => {
      // The group row is locked first: the count in `insertPeople` and the
      // inserts after it run while no other add can, so the cap can't be raced.
      const { group, me } = await requireCreator(userId, rawGroupId, tx, "update");
      return { groupId: group.id, ...(await insertPeople(tx, group, me.email, data.members, userId)) };
    })
    .catch(rethrowAlreadyMember);
  await deliverInvites(userId, result.groupId, result.pendingIds);
  const fresh = result.added.filter((a) => a.status === "invited").length;
  logger.info(`Split group gained ${fresh} people`, {
    event: "split.members_added",
    groupId: result.groupId,
    added: fresh,
  });
  return { groupId: result.groupId, added: result.added };
}

/**
 * Rename / re-icon, or change the currency while the group is still empty
 * (creator). The group row is locked first, so an expense can't land in the
 * old currency between the emptiness check and the change.
 */
export async function updateGroup(userId: string, rawGroupId: unknown, input: unknown): Promise<void> {
  const data = parseOrThrow(updateSplitGroupSchema, input);
  const db = getDb();
  await db.transaction(async (tx) => {
    const { group } = await requireCreator(userId, rawGroupId, tx, "update");
    if (data.currency !== undefined && data.currency !== group.currency) {
      if (await hasActivity(group.id, tx)) {
        throw conflict("The currency can't change once the group has expenses or payments");
      }
    }
    await tx
      .update(splitGroups)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.icon !== undefined ? { icon: data.icon?.trim() ? data.icon.trim() : null } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        updatedAt: new Date(),
      })
      .where(eq(splitGroups.id, group.id));
  });
}

/**
 * Delete a group and everything in it (creator). Deleted in dependency order
 * inside one transaction rather than leaning on the cascade: shares, payers
 * and settlements point at member rows with `restrict`, which exists to stop a
 * member's history being deleted any other way.
 */
export async function deleteGroup(userId: string, rawGroupId: unknown): Promise<void> {
  const db = getDb();
  const groupId = await db.transaction(async (tx) => {
    // Locked first, so no expense, payment or add can land mid-delete.
    const { group } = await requireCreator(userId, rawGroupId, tx, "update");
    await deleteGroupsInTx(tx, [group.id]);
    return group.id;
  });
  logger.info("Split group deleted", { event: "split.group_deleted", groupId });
}

/** The ordered delete behind `deleteGroup`, also used by account deletion. */
export async function deleteGroupsInTx(tx: Tx, groupIds: string[]): Promise<void> {
  if (groupIds.length === 0) return;
  await tx.delete(splitSettlements).where(inArray(splitSettlements.groupId, groupIds));
  await tx.delete(splitExpenses).where(inArray(splitExpenses.groupId, groupIds)); // shares cascade
  await tx.delete(splitMembers).where(inArray(splitMembers.groupId, groupIds));
  await tx.delete(splitGroups).where(inArray(splitGroups.id, groupIds));
}

/**
 * Account deletion, inside its transaction: the groups this person created go
 * with them; their rows in other people's groups lose everything that
 * identifies them but stay, so everyone else's balances still add up.
 */
export async function forgetSplitUser(tx: Tx, userId: string): Promise<void> {
  const owned = await tx
    .select({ id: splitGroups.id })
    .from(splitGroups)
    .where(eq(splitGroups.createdBy, userId))
    .for("update");
  await deleteGroupsInTx(
    tx,
    owned.map((g) => g.id),
  );
  await tx
    .update(splitMembers)
    .set({
      userId: null,
      email: null,
      emailKey: null,
      displayName: SPLIT_DELETED_MEMBER_NAME,
      status: "left",
      inviteToken: null,
    })
    .where(eq(splitMembers.userId, userId));
}

/** When someone who declined or left may be invited back into the group. */
function cooldownUntil(): Date {
  return new Date(Date.now() + SPLIT_INVITE_COOLDOWN_DAYS * DAY_MS);
}

/**
 * Retire a row (remove / leave): history stays, the join link stops working.
 * Leaving by choice also starts the re-invite cooldown; a removal doesn't —
 * that was the creator's call to make and to undo.
 */
async function retireMember(db: DbOrTx, memberId: string, byChoice: boolean): Promise<void> {
  await db
    .update(splitMembers)
    .set({ status: "left", inviteToken: null, ...(byChoice ? { inviteCooldownUntil: cooldownUntil() } : {}) })
    .where(eq(splitMembers.id, memberId));
}

/** Remove someone (creator). Only once they're settled up. */
export async function removeMember(
  userId: string,
  rawGroupId: unknown,
  rawMemberId: unknown,
): Promise<void> {
  const db = getDb();
  const memberId = parseSplitId(rawMemberId, "That person isn't in this group");
  await db.transaction(async (tx) => {
    const { group, me } = await requireCreator(userId, rawGroupId, tx, "update");
    if (memberId === me.id) {
      throw badRequest("You can't remove yourself — delete the group instead");
    }
    const [row] = await tx
      .select()
      .from(splitMembers)
      .where(and(eq(splitMembers.id, memberId), eq(splitMembers.groupId, group.id)));
    if (!row || row.status === "left") throw notFound("That person isn't in this group");
    const [balance] = await memberBalances([row.id], tx);
    if (balance!.netMinor !== 0) {
      // Neutral on purpose: this message lands in log lines, and names don't.
      throw settleFirst("That person still has a balance — settle up first");
    }
    await retireMember(tx, row.id, false);
  });
  logger.info("Split group member removed", { event: "split.member_removed", memberId });
}

/** Leave a group (any member but the creator). Only once settled up. */
export async function leaveGroup(userId: string, rawGroupId: unknown): Promise<void> {
  const db = getDb();
  const groupId = await db.transaction(async (tx) => {
    const { group, me, viewer } = await requireJoined(userId, rawGroupId, tx, "update");
    if (viewer.isCreator) throw badRequest("You created this group — delete it instead of leaving");
    const [balance] = await memberBalances([me.id], tx);
    if (balance!.netMinor !== 0) throw settleFirst("You still have a balance here — settle up first");
    await retireMember(tx, me.id, true);
    return group.id;
  });
  logger.info("Split group member left", { event: "split.member_left", groupId });
}

/* ------------------------------------------------------------------------- */
/* Invitations (in the app)                                                   */
/* ------------------------------------------------------------------------- */

/**
 * The caller's pending rows: bound to their account, or — for an address that
 * had no account when it was added — still unbound but for their verified
 * email. The second arm covers a sign-up that raced the add.
 */
function pendingForUser(user: Pick<SessionUser, "id" | "email">) {
  const email = user.email?.trim().toLowerCase();
  return and(
    eq(splitMembers.status, "invited"),
    email
      ? or(eq(splitMembers.userId, user.id), and(isNull(splitMembers.userId), eq(splitMembers.email, email)))
      : eq(splitMembers.userId, user.id),
  );
}

export type SplitInvitation = {
  /** The pending row's id — what accept/decline take. */
  memberId: string;
  groupId: string;
  groupName: string;
  groupIcon: string | null;
  currency: string;
  inviterName: string | null;
  peopleCount: number;
  invitedAt: Date;
};

/** Invitations per page (web and API). */
export const SPLIT_INVITATIONS_PAGE = 20;

/** A page of the caller's pending invitations, newest first, and how many there are. */
export async function listInvitations(
  user: Pick<SessionUser, "id" | "email">,
  page: { limit: number; offset: number } = { limit: SPLIT_INVITATIONS_PAGE, offset: 0 },
): Promise<{ items: SplitInvitation[]; total: number }> {
  const db = getDb();
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({ member: splitMembers, group: splitGroups })
      .from(splitMembers)
      .innerJoin(splitGroups, eq(splitGroups.id, splitMembers.groupId))
      .where(pendingForUser(user))
      .orderBy(desc(splitMembers.createdAt), desc(splitMembers.id))
      .limit(Math.min(Math.max(page.limit, 1), 100))
      .offset(Math.max(page.offset, 0)),
    db.select({ n: count() }).from(splitMembers).where(pendingForUser(user)),
  ]);
  const total = totalRow?.n ?? 0;
  if (rows.length === 0) return { items: [], total };
  const groupIds = rows.map((r) => r.group.id);
  const [counts, inviters] = await Promise.all([
    db
      .select({ groupId: splitMembers.groupId, n: count() })
      .from(splitMembers)
      .where(and(inArray(splitMembers.groupId, groupIds), inArray(splitMembers.status, ACTIVE)))
      .groupBy(splitMembers.groupId),
    // The inviter's label *in that group* — what the group calls them, never an email.
    db
      .select({ groupId: splitMembers.groupId, userId: splitMembers.userId, name: splitMembers.displayName })
      .from(splitMembers)
      .where(
        and(
          inArray(splitMembers.groupId, groupIds),
          inArray(
            splitMembers.userId,
            rows.map((r) => r.member.invitedBy).filter((id): id is string => id !== null),
          ),
        ),
      ),
  ]);
  const people = new Map(counts.map((c) => [c.groupId, c.n]));
  const items = rows.map(({ member, group }) => {
    const inviter = inviters.find(
      (i) => i.groupId === group.id && i.userId !== null && i.userId === member.invitedBy,
    );
    return {
      memberId: member.id,
      groupId: group.id,
      groupName: group.name,
      groupIcon: group.icon,
      currency: group.currency,
      inviterName: inviter?.name ?? null,
      peopleCount: people.get(group.id) ?? 0,
      invitedAt: member.createdAt,
    };
  });
  return { items, total };
}

/** The nav badge stops counting here and shows "9+". */
export const SPLIT_INVITATION_BADGE_MAX = 9;

/**
 * How many invitations wait for the caller — the nav badge, on every app page.
 * Counts at most `SPLIT_INVITATION_BADGE_MAX + 1` rows, so it stays one cheap
 * indexed read however many invitations someone was sent.
 */
export async function countInvitations(user: Pick<SessionUser, "id" | "email">): Promise<number> {
  const db = getDb();
  const capped = db
    .select({ one: sql<number>`1`.as("one") })
    .from(splitMembers)
    .where(pendingForUser(user))
    .limit(SPLIT_INVITATION_BADGE_MAX + 1)
    .as("capped");
  const [row] = await db.select({ n: count() }).from(capped);
  return row?.n ?? 0;
}

/**
 * Join from an in-app invitation. One conditional UPDATE: the row must still
 * be pending *and* belong to the caller (by account or verified email), so a
 * withdrawn invitation, someone else's row, or a double click all match nothing.
 */
export async function acceptInvitation(
  user: Pick<SessionUser, "id" | "email">,
  rawMemberId: unknown,
): Promise<{ groupId: string }> {
  const memberId = parseSplitId(rawMemberId, "That invitation is no longer open");
  const db = getDb();
  const [joined] = await db
    .update(splitMembers)
    .set({ status: "joined", userId: user.id, joinedAt: new Date(), inviteToken: null })
    .where(and(eq(splitMembers.id, memberId), pendingForUser(user)))
    .returning({ groupId: splitMembers.groupId })
    .catch(rethrowAlreadyMember);
  if (!joined) throw notFound("That invitation is no longer open");
  logger.info("Split invitation accepted in the app", {
    event: "split.invitation_accepted",
    groupId: joined.groupId,
    memberId,
  });
  return { groupId: joined.groupId };
}

/** Say no. Always allowed (you can't be made to join); a balance stays on record. */
export async function declineInvitation(
  user: Pick<SessionUser, "id" | "email">,
  rawMemberId: unknown,
): Promise<void> {
  const memberId = parseSplitId(rawMemberId, "That invitation is no longer open");
  const db = getDb();
  const [declined] = await db
    .update(splitMembers)
    .set({ status: "left", inviteToken: null, inviteCooldownUntil: cooldownUntil() })
    .where(and(eq(splitMembers.id, memberId), pendingForUser(user)))
    .returning({ groupId: splitMembers.groupId });
  if (!declined) throw notFound("That invitation is no longer open");
  logger.info("Split invitation declined", {
    event: "split.invitation_declined",
    groupId: declined.groupId,
    memberId,
  });
}
