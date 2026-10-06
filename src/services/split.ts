import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
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
import { ApiError, badRequest, conflict, forbidden, isUniqueViolation, notFound } from "@/lib/errors";
import { generateInviteToken } from "@/lib/invite-links";
import { emailNewInvitees } from "@/services/split-invites";
import { logger } from "@/lib/logger";
import { SPLIT_GROUP_MAX_PEOPLE } from "@/lib/plans";
import {
  canManageGroup,
  canSeeEmail,
  memberLabel,
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
 * invitation (never an email), someone without one gets a join link.
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
  db: DbOrTx = getDb(),
  lock?: GroupLock,
): Promise<JoinedContext> {
  const groupId = parseSplitId(rawGroupId);
  if (lock) {
    await db.select({ id: splitGroups.id }).from(splitGroups).where(eq(splitGroups.id, groupId)).for(lock);
  }
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
  db: DbOrTx = getDb(),
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

const sumMinor = (col: typeof splitExpenses.amountMinor | typeof splitShares.amountMinor | typeof splitSettlements.amountMinor) =>
  sql<number>`coalesce(sum(${col}), 0)::bigint`.mapWith(Number);

/**
 * Per-member ledger sums for some members — four `GROUP BY` queries, never a
 * load of every expense. Members may span groups (the groups list).
 */
async function ledgerTotals(memberIds: string[], db: DbOrTx) {
  if (memberIds.length === 0) return { paid: {}, owed: {}, sent: {}, received: {} };
  const [paid, owed, sent, received] = await Promise.all([
    db
      .select({ memberId: splitExpenses.paidByMemberId, total: sumMinor(splitExpenses.amountMinor) })
      .from(splitExpenses)
      .where(inArray(splitExpenses.paidByMemberId, memberIds))
      .groupBy(splitExpenses.paidByMemberId),
    db
      .select({ memberId: splitShares.memberId, total: sumMinor(splitShares.amountMinor) })
      .from(splitShares)
      .where(inArray(splitShares.memberId, memberIds))
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

/** Every row of a group: the creator first, then in join order. */
export async function groupMembers(groupId: string, db: DbOrTx = getDb()): Promise<SplitMember[]> {
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
};

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
  const [counts, balances] = await Promise.all([
    db
      .select({ groupId: splitMembers.groupId, n: count() })
      .from(splitMembers)
      .where(and(inArray(splitMembers.groupId, groupIds), inArray(splitMembers.status, ACTIVE)))
      .groupBy(splitMembers.groupId),
    memberBalances(rows.map((r) => r.memberId), db),
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
  /** Creator only, pending rows: the join link's token (phase 11 builds the URL). */
  inviteToken: string | null;
  /** Creator only: whether this person was sent their one invite email. */
  invitedByEmail: boolean | null;
  /**
   * Creator only: whether "Send invite email" applies — still invited, no
   * account (account holders see an in-app invitation), never emailed.
   */
  canSendInviteEmail: boolean | null;
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
        invitedByEmail: creatorView ? m.inviteEmailedAt !== null : null,
        canSendInviteEmail: creatorView
          ? m.status === "invited" && m.userId === null && m.inviteEmailedAt === null
          : null,
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
  const ctx = await requireJoined(userId, rawGroupId, db);
  const rows = await groupMembers(ctx.group.id, db);
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
   * `in_app` — they have an account and see an invitation in the app (no email);
   * `email` — no account yet, and their one invite email is on its way;
   * `link` — no account yet, and no email went (the daily cap, or they were
   *          emailed before): the creator shares the join link;
   * `already` — they were already in the group; nothing changed.
   */
  delivery: "in_app" | "email" | "link" | "already";
};

type Person = { email: string; name: string };

/**
 * Add people inside the caller's transaction, with the group row already
 * locked. Re-adding someone who left reactivates their row — same id, so their
 * history reconnects, and the same `invite_emailed_at`, so no second email.
 */
async function insertPeople(
  tx: Tx,
  group: SplitGroup,
  creatorEmail: string | null,
  people: Person[],
  invitedBy: string,
): Promise<{ added: AddedPerson[]; pendingIds: string[] }> {
  if (people.length === 0) return { added: [], pendingIds: [] };
  if (creatorEmail && people.some((p) => p.email === creatorEmail)) {
    throw badRequest("You're already in the group");
  }
  const emails = people.map((p) => p.email);
  const [existing, accounts, [active]] = await Promise.all([
    tx
      .select()
      .from(splitMembers)
      .where(and(eq(splitMembers.groupId, group.id), inArray(splitMembers.email, emails))),
    tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(sql`lower(${users.email})`, emails)),
    tx
      .select({ n: count() })
      .from(splitMembers)
      .where(and(eq(splitMembers.groupId, group.id), inArray(splitMembers.status, ACTIVE))),
  ]);
  const byEmail = new Map(existing.map((m) => [m.email, m]));
  const accountByEmail = new Map(accounts.map((a) => [a.email?.toLowerCase(), a.id]));

  const joining = people.filter((p) => {
    const row = byEmail.get(p.email);
    return !row || row.status === "left";
  });
  const used = active?.n ?? 0;
  if (used + joining.length > SPLIT_GROUP_MAX_PEOPLE) throw groupFull(used);

  const added: AddedPerson[] = [];
  const pendingIds: string[] = [];
  for (const person of people) {
    const row = byEmail.get(person.email);
    if (row && row.status !== "left") {
      added.push({ memberId: row.id, email: person.email, delivery: "already" });
      continue;
    }
    const accountId = row?.userId ?? accountByEmail.get(person.email) ?? null;
    const values = {
      displayName: person.name,
      status: "invited" as const,
      invitedBy,
      inviteToken: generateInviteToken(),
      userId: accountId,
      joinedAt: null,
    };
    const [saved] = row
      ? await tx.update(splitMembers).set(values).where(eq(splitMembers.id, row.id)).returning()
      : await tx
          .insert(splitMembers)
          .values({ ...values, groupId: group.id, email: person.email })
          .returning();
    if (accountId) {
      added.push({ memberId: saved!.id, email: person.email, delivery: "in_app" });
    } else {
      added.push({ memberId: saved!.id, email: person.email, delivery: "link" });
      pendingIds.push(saved!.id);
    }
  }
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
  return name?.trim().slice(0, 40) || "Organiser";
}

export type AddPeopleResult = { added: AddedPerson[]; pendingIds: string[] };

/**
 * After an add has committed — so a refused add never spends email quota —
 * send the new no-account people their one invite email (abuse rule D1,
 * `services/split-invites.ts`) and report who got one.
 */
async function deliverInvites(
  senderId: string,
  groupId: string,
  result: AddPeopleResult,
): Promise<AddedPerson[]> {
  const emailed = await emailNewInvitees(senderId, groupId, result.pendingIds);
  return result.added.map((a) => (emailed.has(a.memberId) ? { ...a, delivery: "email" as const } : a));
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
        displayName: creatorLabel(account?.name),
        status: "joined",
        joinedAt: new Date(),
      });
      const people = await insertPeople(tx, group!, creatorEmail, data.members, user.id);
      return { id: group!.id, ...people };
    })
    .catch(rethrowAlreadyMember);
  const added = await deliverInvites(user.id, result.id, result);
  logger.info(`Split group created with ${result.added.length} people invited`, {
    event: "split.group_created",
    groupId: result.id,
    invited: result.added.length,
  });
  return { ...result, added };
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
  const added = await deliverInvites(userId, result.groupId, result);
  logger.info(`Split group gained ${result.added.filter((a) => a.delivery !== "already").length} people`, {
    event: "split.members_added",
    groupId: result.groupId,
    added: result.added.filter((a) => a.delivery !== "already").length,
  });
  return { ...result, added };
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
  const { group } = await requireCreator(userId, rawGroupId, db);
  await db.transaction((tx) => deleteGroupsInTx(tx, [group.id]));
  logger.info("Split group deleted", { event: "split.group_deleted", groupId: group.id });
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
    .where(eq(splitGroups.createdBy, userId));
  await deleteGroupsInTx(
    tx,
    owned.map((g) => g.id),
  );
  await tx
    .update(splitMembers)
    .set({
      userId: null,
      email: null,
      displayName: "Deleted account",
      status: "left",
      inviteToken: null,
    })
    .where(eq(splitMembers.userId, userId));
}

/** Retire a row (remove / leave): history stays, the join link stops working. */
async function retireMember(db: DbOrTx, memberId: string): Promise<void> {
  await db
    .update(splitMembers)
    .set({ status: "left", inviteToken: null })
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
      throw settleFirst(`${memberLabel(row)} still has a balance — settle up first`);
    }
    await retireMember(tx, row.id);
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
    await retireMember(tx, me.id);
    return group.id;
  });
  logger.info("Split group member left", { event: "split.member_left", groupId });
}

/**
 * Send someone their one invite email later — when the daily cap kept it from
 * going at add time (creator only). Only for a pending person without an
 * account who was never emailed: 409 otherwise, because D1 allows one email
 * per group per address, ever.
 */
export async function sendInviteEmail(
  userId: string,
  rawGroupId: unknown,
  rawMemberId: unknown,
): Promise<{ emailed: boolean }> {
  const memberId = parseSplitId(rawMemberId, "That person isn't in this group");
  const db = getDb();
  const { group } = await requireCreator(userId, rawGroupId, db);
  const [row] = await db
    .select()
    .from(splitMembers)
    .where(and(eq(splitMembers.id, memberId), eq(splitMembers.groupId, group.id)));
  if (!row || row.status !== "invited") throw notFound("That person isn't waiting to join");
  if (row.userId !== null) {
    throw conflict("They already have an account — they'll see the invitation in the app");
  }
  if (row.inviteEmailedAt !== null) throw conflict("They've already had their invite email");
  const emailed = await emailNewInvitees(userId, group.id, [row.id]);
  return { emailed: emailed.has(row.id) };
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

export async function listInvitations(
  user: Pick<SessionUser, "id" | "email">,
): Promise<SplitInvitation[]> {
  const db = getDb();
  const rows = await db
    .select({ member: splitMembers, group: splitGroups })
    .from(splitMembers)
    .innerJoin(splitGroups, eq(splitGroups.id, splitMembers.groupId))
    .where(pendingForUser(user))
    .orderBy(sql`${splitMembers.createdAt} desc`);
  if (rows.length === 0) return [];
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
  return rows.map(({ member, group }) => {
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
}

/** How many invitations wait for the caller — the nav badge. */
export async function countInvitations(user: Pick<SessionUser, "id" | "email">): Promise<number> {
  const db = getDb();
  const [row] = await db.select({ n: count() }).from(splitMembers).where(pendingForUser(user));
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
    .set({ status: "left", inviteToken: null })
    .where(and(eq(splitMembers.id, memberId), pendingForUser(user)))
    .returning({ groupId: splitMembers.groupId });
  if (!declined) throw notFound("That invitation is no longer open");
  logger.info("Split invitation declined", {
    event: "split.invitation_declined",
    groupId: declined.groupId,
    memberId,
  });
}
