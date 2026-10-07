import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  profiles,
  transactions,
  splitExpenses,
  splitMembers,
  splitSettlements,
  splitShares,
  type SplitMember,
  type SplitType,
} from "@/db/schema";
import { parseOrThrow } from "@/lib/api-response";
import { ApiError, conflict, forbidden, notFound, validationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import {
  canDeleteSettlement,
  canEditExpense,
  canRecordSettlement,
  memberLabel,
} from "@/lib/split-access";
import {
  computeShares,
  SplitMathError,
  toBasisPoints,
  type ShareAmount,
  type ShareSpec,
} from "@/lib/split-math";
import {
  addSplitShareToWorkspaceSchema,
  splitExpenseSchema,
  splitSettlementSchema,
  updateSplitWorkspaceEntrySchema,
} from "@/lib/validation";
import { getTransactionById } from "@/lib/queries";
import { accessibleProfileIds, getWorkspaceMoneyFormat } from "@/lib/workspaces";
import { createTransactionId, deleteTransaction, updateTransaction } from "@/services/transactions";
import { groupMembers, parseSplitId, requireJoined, type JoinedContext } from "@/services/split";
import { z } from "zod";

/**
 * The money side of a split group: expenses (each divided into shares by
 * `lib/split-math.ts`, always on the server) and settlements ("Mark as
 * paid"). Balances are never stored — `services/split.ts#memberBalances`
 * computes them from these rows. Every write holds the group row `FOR SHARE`
 * (see `GroupLock`), so the people it names can't be removed mid-write.
 */

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const EXPENSE_NOT_FOUND = "Expense not found";
const SETTLEMENT_NOT_FOUND = "Payment not found";
const NOT_IN_GROUP = "Everyone in an expense has to be in the group";

export type SplitPage = { limit: number; offset: number };

/**
 * An amount as minor units of `currency`, refusing one that rounds to nothing
 * (¥0.4, $0.001) — which would otherwise reach a `> 0` check in the database
 * and come back as a 500.
 */
export function positiveMinor(amount: number, currency: string): number {
  const minor = toMinorUnits(amount, currency);
  if (minor <= 0) {
    throw validationError(`Amount is too small for ${currency}`, { amount: `Amount is too small for ${currency}` });
  }
  return minor;
}

type ExpenseData = z.output<typeof splitExpenseSchema>;

/** The split inputs as minor units / basis points, ready for `computeShares`. */
function shareSpecOf(data: ExpenseData, currency: string): ShareSpec {
  if (data.splitType === "equal") return { type: "equal", memberIds: data.memberIds };
  if (data.splitType === "exact") {
    return {
      type: "exact",
      shares: data.shares.map((s) => ({ memberId: s.memberId, amountMinor: toMinorUnits(s.amount, currency) })),
    };
  }
  return {
    type: "percent",
    shares: data.shares.map((s) => ({ memberId: s.memberId, bp: toBasisPoints(s.percent) })),
  };
}

function participantIds(spec: ShareSpec): string[] {
  return spec.type === "equal" ? spec.memberIds : spec.shares.map((s) => s.memberId);
}

/**
 * Validate an expense against the group and compute its shares. Payer and
 * participants must be people in the group now — or, when editing, people
 * already on this expense (someone who has since left stays on it).
 */
export function planExpense(
  ctx: JoinedContext,
  members: SplitMember[],
  data: ExpenseData,
  keep: Set<string> = new Set(),
): { totalMinor: number; shares: ShareAmount[]; spec: ShareSpec } {
  const currency = ctx.group.currency;
  const allowed = new Set(members.filter((m) => m.status !== "left" || keep.has(m.id)).map((m) => m.id));
  const spec = shareSpecOf(data, currency);
  for (const id of [data.paidBy, ...participantIds(spec)]) {
    if (!allowed.has(id)) throw validationError(NOT_IN_GROUP);
  }
  const totalMinor = positiveMinor(data.amount, currency);
  try {
    const shares = computeShares(totalMinor, data.paidBy, spec);
    return { totalMinor, shares, spec };
  } catch (err) {
    // The message stays neutral (it's logged); the sums go in `details`, and
    // the dialog phrases them with `describeSplitError`.
    if (err instanceof SplitMathError) throw validationError(err.message, err.details);
    throw err;
  }
}

export function percentFor(spec: ShareSpec, memberId: string): number | null {
  return spec.type === "percent" ? (spec.shares.find((s) => s.memberId === memberId)?.bp ?? null) : null;
}

/* ------------------------------------------------------------------------- */
/* Expenses                                                                   */
/* ------------------------------------------------------------------------- */

export type SplitShareView = {
  memberId: string;
  name: string;
  amountMinor: number;
  /** Percent splits: the percent typed, in basis points. */
  percentBp: number | null;
};

export type SplitExpenseView = {
  id: string;
  title: string;
  amountMinor: number;
  splitType: SplitType;
  occurredOn: string;
  createdAt: Date;
  updatedAt: Date;
  paidBy: { memberId: string; name: string };
  shares: SplitShareView[];
  canEdit: boolean;
  /** The caller's share, if they're in this expense. */
  myShare: {
    shareId: string;
    amountMinor: number;
    /** In one of the caller's workspaces (the transaction still exists). */
    added: boolean;
    addedAt: Date | null;
    /**
     * Added, but the expense was edited since and the share is no longer what
     * the workspace entry was written for — offer "Update my entry".
     */
    changedSinceAdded: boolean;
  } | null;
};

/** Shares, names and the caller's own share for some expense rows. */
async function expenseViews(
  ctx: JoinedContext,
  rows: (typeof splitExpenses.$inferSelect)[],
  db: Db,
): Promise<SplitExpenseView[]> {
  if (rows.length === 0) return [];
  const [shares, members] = await Promise.all([
    db
      .select()
      .from(splitShares)
      .where(inArray(splitShares.expenseId, rows.map((r) => r.id))),
    groupMembers(ctx.group.id),
  ]);
  const names = new Map(members.map((m) => [m.id, memberLabel(m)]));
  const order = new Map(members.map((m, i) => [m.id, i]));
  return rows.map((e): SplitExpenseView => {
    const mine = shares.find((s) => s.expenseId === e.id && s.memberId === ctx.me.id);
    return {
      id: e.id,
      title: e.title,
      amountMinor: e.amountMinor,
      splitType: e.splitType,
      occurredOn: e.occurredOn,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      paidBy: { memberId: e.paidByMemberId, name: names.get(e.paidByMemberId) ?? "" },
      // 0 rows (kept only for a workspace link, or a percent share that
      // rounded to nothing) aren't part of the split.
      shares: shares
        .filter((s) => s.expenseId === e.id && s.amountMinor > 0)
        .sort((a, b) => (order.get(a.memberId) ?? 0) - (order.get(b.memberId) ?? 0))
        .map((s) => ({
          memberId: s.memberId,
          name: names.get(s.memberId) ?? "",
          amountMinor: s.amountMinor,
          percentBp: s.percentBp,
        })),
      canEdit: canEditExpense(ctx.viewer, e),
      myShare:
        mine && (mine.amountMinor > 0 || mine.transactionId !== null)
        ? {
            shareId: mine.id,
            amountMinor: mine.amountMinor,
            added: mine.transactionId !== null,
            addedAt: mine.addedAt,
            changedSinceAdded:
              mine.transactionId !== null &&
              mine.addedAmountMinor !== null &&
              mine.addedAmountMinor !== mine.amountMinor,
          }
        : null,
    };
  });
}

/** A page of the group's expenses, newest first, with every share. */
export async function listExpenses(
  userId: string,
  rawGroupId: unknown,
  page: SplitPage,
): Promise<{ items: SplitExpenseView[]; total: number; currency: string }> {
  const db = getDb();
  const ctx = await requireJoined(userId, rawGroupId);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(splitExpenses)
      .where(eq(splitExpenses.groupId, ctx.group.id))
      .orderBy(desc(splitExpenses.occurredOn), desc(splitExpenses.createdAt), desc(splitExpenses.id))
      .limit(page.limit)
      .offset(page.offset),
    db.select({ n: count() }).from(splitExpenses).where(eq(splitExpenses.groupId, ctx.group.id)),
  ]);
  return {
    items: await expenseViews(ctx, rows, db),
    total: totalRow?.n ?? 0,
    currency: ctx.group.currency,
  };
}

/** One expense of the group, as the list shows it. */
export async function getExpense(
  userId: string,
  rawGroupId: unknown,
  rawExpenseId: unknown,
): Promise<{ expense: SplitExpenseView; currency: string }> {
  const db = getDb();
  const ctx = await requireJoined(userId, rawGroupId);
  const expenseId = parseSplitId(rawExpenseId, EXPENSE_NOT_FOUND);
  const rows = await db
    .select()
    .from(splitExpenses)
    .where(and(eq(splitExpenses.id, expenseId), eq(splitExpenses.groupId, ctx.group.id)));
  const [expense] = await expenseViews(ctx, rows, db);
  if (!expense) throw notFound(EXPENSE_NOT_FOUND);
  return { expense, currency: ctx.group.currency };
}

/** Add an expense (any joined member). */
export async function createExpense(
  userId: string,
  rawGroupId: unknown,
  input: unknown,
): Promise<{ id: string }> {
  const data = parseOrThrow(splitExpenseSchema, input);
  const db = getDb();
  const id = await db.transaction(async (tx) => {
    const ctx = await requireJoined(userId, rawGroupId, tx, "share");
    const plan = planExpense(ctx, await groupMembers(ctx.group.id, tx), data);
    const [expense] = await tx
      .insert(splitExpenses)
      .values({
        groupId: ctx.group.id,
        title: data.title,
        amountMinor: plan.totalMinor,
        paidByMemberId: data.paidBy,
        splitType: data.splitType,
        occurredOn: data.occurredOn,
        createdBy: userId,
      })
      .returning({ id: splitExpenses.id });
    await tx.insert(splitShares).values(
      plan.shares.map((s) => ({
        expenseId: expense!.id,
        memberId: s.memberId,
        amountMinor: s.amountMinor,
        percentBp: percentFor(plan.spec, s.memberId),
      })),
    );
    return expense!.id;
  });
  logger.info("Split expense added", { event: "split.expense_created", expenseId: id });
  return { id };
}

async function loadExpense(tx: Tx, ctx: JoinedContext, rawExpenseId: unknown) {
  const expenseId = parseSplitId(rawExpenseId, EXPENSE_NOT_FOUND);
  const [expense] = await tx
    .select()
    .from(splitExpenses)
    .where(and(eq(splitExpenses.id, expenseId), eq(splitExpenses.groupId, ctx.group.id)));
  if (!expense) throw notFound(EXPENSE_NOT_FOUND);
  if (!canEditExpense(ctx.viewer, expense)) {
    throw forbidden("Only the person who added this expense, or the group's creator, can change it");
  }
  return expense;
}

/**
 * Replace an expense (its author or the creator). Shares are matched by
 * member and updated in place, so a share already added to someone's
 * workspace keeps that marker through the edit.
 */
export async function updateExpense(
  userId: string,
  rawGroupId: unknown,
  rawExpenseId: unknown,
  input: unknown,
): Promise<void> {
  const data = parseOrThrow(splitExpenseSchema, input);
  const db = getDb();
  await db.transaction(async (tx) => {
    const ctx = await requireJoined(userId, rawGroupId, tx, "share");
    const expense = await loadExpense(tx, ctx, rawExpenseId);
    const existing = await tx.select().from(splitShares).where(eq(splitShares.expenseId, expense.id));
    // Who may stay on it though they've left the group: whoever paid, and
    // whoever still has a share (a 0 row kept for a workspace link doesn't count).
    const keep = new Set([
      expense.paidByMemberId,
      ...existing.filter((s) => s.amountMinor > 0).map((s) => s.memberId),
    ]);
    const plan = planExpense(ctx, await groupMembers(ctx.group.id, tx), data, keep);

    await tx
      .update(splitExpenses)
      .set({
        title: data.title,
        amountMinor: plan.totalMinor,
        paidByMemberId: data.paidBy,
        splitType: data.splitType,
        occurredOn: data.occurredOn,
        updatedAt: new Date(),
      })
      .where(eq(splitExpenses.id, expense.id));
    // Someone dropped from the expense: their share goes — unless it's linked
    // to their workspace entry, in which case it stays at 0, so the link and
    // "changed since you added it" survive and they can remove the entry.
    const nextIds = new Set(plan.shares.map((s) => s.memberId));
    const droppedIds = existing.filter((s) => !nextIds.has(s.memberId)).map((s) => s.id);
    if (droppedIds.length) {
      await tx
        .delete(splitShares)
        .where(and(inArray(splitShares.id, droppedIds), isNull(splitShares.transactionId)));
      await tx
        .update(splitShares)
        .set({ amountMinor: 0, percentBp: null })
        .where(and(inArray(splitShares.id, droppedIds), isNotNull(splitShares.transactionId)));
    }
    const had = new Map(existing.map((s) => [s.memberId, s.id]));
    const fresh = plan.shares.filter((s) => !had.has(s.memberId));
    for (const s of plan.shares) {
      const shareId = had.get(s.memberId);
      if (!shareId) continue;
      await tx
        .update(splitShares)
        .set({ amountMinor: s.amountMinor, percentBp: percentFor(plan.spec, s.memberId) })
        .where(eq(splitShares.id, shareId));
    }
    if (fresh.length) {
      await tx.insert(splitShares).values(
        fresh.map((s) => ({
          expenseId: expense.id,
          memberId: s.memberId,
          amountMinor: s.amountMinor,
          percentBp: percentFor(plan.spec, s.memberId),
        })),
      );
    }
  });
  logger.info("Split expense edited", { event: "split.expense_updated" });
}

/** Delete an expense (its author or the creator). Added workspace copies stay where they are. */
export async function deleteExpense(
  userId: string,
  rawGroupId: unknown,
  rawExpenseId: unknown,
): Promise<void> {
  const db = getDb();
  const expenseId = await db.transaction(async (tx) => {
    const ctx = await requireJoined(userId, rawGroupId, tx, "share");
    const expense = await loadExpense(tx, ctx, rawExpenseId);
    await tx.delete(splitExpenses).where(eq(splitExpenses.id, expense.id));
    return expense.id;
  });
  logger.info("Split expense deleted", { event: "split.expense_deleted", expenseId });
}

/* ------------------------------------------------------------------------- */
/* Settlements ("Mark as paid")                                               */
/* ------------------------------------------------------------------------- */

export type SplitSettlementView = {
  id: string;
  from: { memberId: string; name: string };
  to: { memberId: string; name: string };
  amountMinor: number;
  settledOn: string;
  createdAt: Date;
  canDelete: boolean;
};

function settlementViews(
  ctx: JoinedContext,
  rows: (typeof splitSettlements.$inferSelect)[],
  members: SplitMember[],
): SplitSettlementView[] {
  const names = new Map(members.map((m) => [m.id, memberLabel(m)]));
  return rows.map((s) => ({
    id: s.id,
    from: { memberId: s.fromMemberId, name: names.get(s.fromMemberId) ?? "" },
    to: { memberId: s.toMemberId, name: names.get(s.toMemberId) ?? "" },
    amountMinor: s.amountMinor,
    settledOn: s.settledOn,
    createdAt: s.createdAt,
    canDelete: canDeleteSettlement(ctx.viewer, s),
  }));
}

/* ------------------------------------------------------------------------- */
/* The group's chat feed: expenses and payments, interleaved                  */
/* ------------------------------------------------------------------------- */

export type SplitFeedItem =
  | { kind: "expense"; id: string; date: string; at: Date; expense: SplitExpenseView }
  | { kind: "payment"; id: string; date: string; at: Date; payment: SplitSettlementView };

/**
 * A page of the group's activity — expenses and recorded payments together, in
 * the order they happened (by their date, then when they were added). Paged
 * from the newest; each page comes back oldest-first, ready to render as a
 * chat with the latest at the bottom. Web only: the API keeps its two lists.
 */
export async function listGroupFeed(
  userId: string,
  rawGroupId: unknown,
  page: SplitPage,
): Promise<{ items: SplitFeedItem[]; total: number; currency: string }> {
  const db = getDb();
  const ctx = await requireJoined(userId, rawGroupId);
  const groupId = ctx.group.id;
  const limit = Math.min(Math.max(page.limit, 1), 200);
  const offset = Math.max(page.offset, 0);
  const [{ rows: ordered }, [expenseCount], [paymentCount]] = await Promise.all([
    db.execute<{ id: string; kind: "expense" | "payment" }>(sql`
      select id, kind from (
        select ${splitExpenses.id} as id, 'expense' as kind, ${splitExpenses.occurredOn} as day,
               ${splitExpenses.createdAt} as at
          from ${splitExpenses} where ${splitExpenses.groupId} = ${groupId}
        union all
        select ${splitSettlements.id} as id, 'payment' as kind, ${splitSettlements.settledOn} as day,
               ${splitSettlements.createdAt} as at
          from ${splitSettlements} where ${splitSettlements.groupId} = ${groupId}
      ) feed
      order by day desc, at desc, id desc
      limit ${limit} offset ${offset}`),
    db.select({ n: count() }).from(splitExpenses).where(eq(splitExpenses.groupId, groupId)),
    db.select({ n: count() }).from(splitSettlements).where(eq(splitSettlements.groupId, groupId)),
  ]);
  const expenseIds = ordered.filter((r) => r.kind === "expense").map((r) => r.id);
  const paymentIds = ordered.filter((r) => r.kind === "payment").map((r) => r.id);
  const [expenseRows, paymentRows, members] = await Promise.all([
    expenseIds.length
      ? db.select().from(splitExpenses).where(inArray(splitExpenses.id, expenseIds))
      : Promise.resolve([]),
    paymentIds.length
      ? db.select().from(splitSettlements).where(inArray(splitSettlements.id, paymentIds))
      : Promise.resolve([]),
    groupMembers(groupId),
  ]);
  const expenses = new Map((await expenseViews(ctx, expenseRows, db)).map((e) => [e.id, e]));
  const payments = new Map(settlementViews(ctx, paymentRows, members).map((p) => [p.id, p]));
  const items: SplitFeedItem[] = [];
  for (const r of [...ordered].reverse()) {
    if (r.kind === "expense") {
      const expense = expenses.get(r.id);
      if (expense) {
        items.push({ kind: "expense", id: r.id, date: expense.occurredOn, at: expense.createdAt, expense });
      }
    } else {
      const payment = payments.get(r.id);
      if (payment) {
        items.push({ kind: "payment", id: r.id, date: payment.settledOn, at: payment.createdAt, payment });
      }
    }
  }
  return {
    items,
    total: (expenseCount?.n ?? 0) + (paymentCount?.n ?? 0),
    currency: ctx.group.currency,
  };
}

/** A page of the group's payments, newest first. */
export async function listSettlements(
  userId: string,
  rawGroupId: unknown,
  page: SplitPage,
): Promise<{ items: SplitSettlementView[]; total: number; currency: string }> {
  const db = getDb();
  const ctx = await requireJoined(userId, rawGroupId);
  const [rows, [totalRow], members] = await Promise.all([
    db
      .select()
      .from(splitSettlements)
      .where(eq(splitSettlements.groupId, ctx.group.id))
      .orderBy(desc(splitSettlements.settledOn), desc(splitSettlements.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db.select({ n: count() }).from(splitSettlements).where(eq(splitSettlements.groupId, ctx.group.id)),
    groupMembers(ctx.group.id),
  ]);
  return {
    items: settlementViews(ctx, rows, members),
    total: totalRow?.n ?? 0,
    currency: ctx.group.currency,
  };
}

/** One payment of the group, as the list shows it. */
export async function getSettlement(
  userId: string,
  rawGroupId: unknown,
  rawSettlementId: unknown,
): Promise<{ settlement: SplitSettlementView; currency: string }> {
  const db = getDb();
  const ctx = await requireJoined(userId, rawGroupId);
  const settlementId = parseSplitId(rawSettlementId, SETTLEMENT_NOT_FOUND);
  const [rows, members] = await Promise.all([
    db
      .select()
      .from(splitSettlements)
      .where(and(eq(splitSettlements.id, settlementId), eq(splitSettlements.groupId, ctx.group.id))),
    groupMembers(ctx.group.id),
  ]);
  const [settlement] = settlementViews(ctx, rows, members);
  if (!settlement) throw notFound(SETTLEMENT_NOT_FOUND);
  return { settlement, currency: ctx.group.currency };
}

/**
 * Record that `from` paid `to` (the creator for anyone; a member when they're
 * one of the two). Either side may be someone who has since left — settling
 * an old debt is exactly what a former member needs.
 */
export async function recordSettlement(
  userId: string,
  rawGroupId: unknown,
  input: unknown,
): Promise<{ id: string }> {
  const data = parseOrThrow(splitSettlementSchema, input);
  const db = getDb();
  const id = await db.transaction(async (tx) => {
    const ctx = await requireJoined(userId, rawGroupId, tx, "share");
    if (!canRecordSettlement(ctx.viewer, data)) {
      throw forbidden("You can record a payment you made or received");
    }
    const found = await tx
      .select({ id: splitMembers.id })
      .from(splitMembers)
      .where(
        and(
          eq(splitMembers.groupId, ctx.group.id),
          inArray(splitMembers.id, [data.fromMemberId, data.toMemberId]),
        ),
      );
    if (found.length !== 2) throw validationError("Both people have to be in the group");
    const [row] = await tx
      .insert(splitSettlements)
      .values({
        groupId: ctx.group.id,
        fromMemberId: data.fromMemberId,
        toMemberId: data.toMemberId,
        amountMinor: positiveMinor(data.amount, ctx.group.currency),
        settledOn: data.settledOn,
        createdBy: userId,
      })
      .returning({ id: splitSettlements.id });
    return row!.id;
  });
  logger.info("Split payment recorded", { event: "split.settlement_recorded", settlementId: id });
  return { id };
}

/** Undo a payment (whoever recorded it, or the creator). */
export async function deleteSettlement(
  userId: string,
  rawGroupId: unknown,
  rawSettlementId: unknown,
): Promise<void> {
  const settlementId = parseSplitId(rawSettlementId, SETTLEMENT_NOT_FOUND);
  const db = getDb();
  await db.transaction(async (tx) => {
    const ctx = await requireJoined(userId, rawGroupId, tx, "share");
    const [row] = await tx
      .select()
      .from(splitSettlements)
      .where(and(eq(splitSettlements.id, settlementId), eq(splitSettlements.groupId, ctx.group.id)));
    if (!row) throw notFound(SETTLEMENT_NOT_FOUND);
    if (!canDeleteSettlement(ctx.viewer, row)) {
      throw forbidden("Only the person who recorded this payment, or the group's creator, can undo it");
    }
    await tx.delete(splitSettlements).where(eq(splitSettlements.id, row.id));
  });
  logger.info("Split payment undone", { event: "split.settlement_deleted", settlementId });
}

/* ------------------------------------------------------------------------- */
/* "Add my share to my workspace"                                             */
/* ------------------------------------------------------------------------- */

/** The workspace a share is being added to, as the caller already resolved it. */
export type ShareTargetWorkspace = { id: string; currency: string; locale: string };

/** Profiles in a workspace the caller can write to — the picker's list. */
export async function writableProfiles(
  userId: string,
  workspaceId: string,
): Promise<{ id: string; name: string; icon: string | null }[]> {
  const db = getDb();
  return db
    .select({ id: profiles.id, name: profiles.name, icon: profiles.icon })
    .from(profiles)
    .where(inArray(profiles.id, accessibleProfileIds(userId, workspaceId, "editor")))
    .orderBy(asc(profiles.sortOrder), asc(profiles.createdAt));
}

const ALREADY_ADDED = "Your share of this expense is already in your workspace";

/**
 * Write the caller's share of an expense into their own books: one ordinary
 * expense transaction in a profile they can write to, in the given
 * (current) workspace. Goes through `createTransactionId`, so every rule a
 * normal add has applies — profile access (strictly: the named profile or a
 * 403), a view-only workspace, the category belonging to the workspace.
 *
 * **Currency.** Transactions stay in the workspace's one currency. When the
 * group's currency is the same, the amount is the share exactly (anything
 * sent is ignored). When it differs, the person confirms what it cost them in
 * the workspace's currency — 422 `amount_required` without it. Same rule as
 * invoices' "Mark as paid".
 *
 * **Never twice.** The insert and the marker (`split_shares.transaction_id`,
 * set only `WHERE transaction_id IS NULL`) commit together; a second add — a
 * double click, another tab, the app and the web at once — blocks on the
 * share row, finds it taken, and rolls its own insert back (409). The marker
 * clears itself only when that transaction is permanently deleted.
 */
export async function addShareToWorkspace(
  userId: string,
  workspace: ShareTargetWorkspace,
  rawGroupId: unknown,
  rawExpenseId: unknown,
  input: unknown,
): Promise<{ transactionId: string }> {
  const data = parseOrThrow(addSplitShareToWorkspaceSchema, input);
  const db = getDb();
  const ctx = await requireJoined(userId, rawGroupId);
  const expenseId = parseSplitId(rawExpenseId, EXPENSE_NOT_FOUND);
  const [row] = await db
    .select({ expense: splitExpenses, share: splitShares })
    .from(splitExpenses)
    .innerJoin(
      splitShares,
      and(eq(splitShares.expenseId, splitExpenses.id), eq(splitShares.memberId, ctx.me.id)),
    )
    .where(and(eq(splitExpenses.id, expenseId), eq(splitExpenses.groupId, ctx.group.id)));
  if (!row || row.share.amountMinor <= 0) throw notFound("You don't have a share in this expense");
  if (row.share.transactionId !== null) throw conflict(ALREADY_ADDED);

  const sameCurrency = ctx.group.currency === workspace.currency;
  if (!sameCurrency && data.amount === undefined) {
    throw new ApiError(
      422,
      "amount_required",
      `Enter what your share cost in ${workspace.currency} — this workspace keeps its books in ${workspace.currency}`,
    );
  }
  const amount = sameCurrency
    ? fromMinorUnits(row.share.amountMinor, workspace.currency)
    : data.amount!;
  if (!sameCurrency) positiveMinor(amount, workspace.currency);

  const { id: transactionId } = await createTransactionId(
    userId,
    workspace.id,
    {
      type: "expense",
      amount,
      profileId: data.profileId,
      categoryId: data.categoryId ?? null,
      title: data.title?.trim() || row.expense.title,
      description: `Split: ${ctx.group.name}`,
      occurredOn: data.occurredOn ?? row.expense.occurredOn,
    },
    { currency: workspace.currency, locale: workspace.locale },
    {
      strictProfile: true,
      // Same database transaction as the insert: the marker is set only if
      // nobody set it first, and otherwise the insert rolls back.
      withinInsert: async (tx, id) => {
        const [claimed] = await tx
          .update(splitShares)
          // The share this entry was written for — an edit to the expense
          // after this point shows up as "changed since you added it".
          .set({ transactionId: id, addedAt: new Date(), addedAmountMinor: row.share.amountMinor })
          .where(and(eq(splitShares.id, row.share.id), isNull(splitShares.transactionId)))
          .returning({ id: splitShares.id });
        if (claimed) return;
        // Taken by another add — or gone with the expense, deleted mid-add.
        const [still] = await tx
          .select({ id: splitShares.id })
          .from(splitShares)
          .where(eq(splitShares.id, row.share.id));
        throw still ? conflict(ALREADY_ADDED) : notFound("This expense was deleted");
      },
    },
  );
  logger.info("Split share added to a workspace", {
    event: "split.share_added",
    expenseId,
    transactionId,
    sameCurrency,
  });
  return { transactionId };
}

/**
 * "Update my entry": the expense changed after the caller added their share,
 * so bring the linked workspace transaction back in line. Only the amount
 * changes — category, profile, title, date and tags stay as the person left
 * them — and it goes through `updateTransaction`, so the normal access checks
 * apply in the transaction's own workspace (wherever it was added). Same
 * currency → the new share exactly; another currency → the person confirms
 * the amount in the workspace's currency (422 `amount_required`).
 *
 * If the linked transaction is gone, there's nothing to update: the share
 * reads as not added, and the normal add applies again.
 */
export async function updateWorkspaceEntry(
  userId: string,
  rawGroupId: unknown,
  rawExpenseId: unknown,
  input: unknown,
): Promise<{ transactionId: string; workspaceId: string }> {
  const data = parseOrThrow(updateSplitWorkspaceEntrySchema, input);
  const db = getDb();
  const ctx = await requireJoined(userId, rawGroupId);
  const expenseId = parseSplitId(rawExpenseId, EXPENSE_NOT_FOUND);
  const [row] = await db
    .select({
      share: splitShares,
      workspaceId: profiles.workspaceId,
      entryTrashed: transactions.deletedAt,
      profileTrashed: profiles.deletedAt,
    })
    .from(splitExpenses)
    .innerJoin(
      splitShares,
      and(eq(splitShares.expenseId, splitExpenses.id), eq(splitShares.memberId, ctx.me.id)),
    )
    // trash: the linked entry in any state — a trashed one still counts as added, and is answered with a 409 / let go below
    .leftJoin(transactions, eq(transactions.id, splitShares.transactionId))
    // trash: its profile in any state, for the same reason (a profile in the trash hides the entry)
    .leftJoin(profiles, eq(profiles.id, transactions.profileId))
    .where(and(eq(splitExpenses.id, expenseId), eq(splitExpenses.groupId, ctx.group.id)));
  if (!row || (row.share.amountMinor <= 0 && row.share.transactionId === null)) {
    throw notFound("You don't have a share in this expense");
  }
  const transactionId = row.share.transactionId;
  if (!transactionId || !row.workspaceId) {
    throw conflict("Your share isn't in a workspace any more — add it again instead");
  }
  if (row.share.amountMinor <= 0) {
    throw conflict("You're no longer part of this expense — remove it from your workspace instead");
  }
  if (row.entryTrashed || row.profileTrashed) {
    throw conflict(
      "Your entry is in the trash — restore it to update it, or delete it for good there and add your share again",
    );
  }
  const workspaceId = row.workspaceId;
  const existing = await getTransactionById(userId, workspaceId, transactionId);
  if (!existing) throw notFound("Your entry is in a workspace you can no longer open");

  const money = await getWorkspaceMoneyFormat(workspaceId);
  const sameCurrency = ctx.group.currency === money.currency;
  if (!sameCurrency && data.amount === undefined) {
    throw new ApiError(
      422,
      "amount_required",
      `Enter what your share cost in ${money.currency} — that workspace keeps its books in ${money.currency}`,
    );
  }
  const amount = sameCurrency ? fromMinorUnits(row.share.amountMinor, money.currency) : data.amount!;
  if (!sameCurrency) positiveMinor(amount, money.currency);

  const updated = await updateTransaction(userId, workspaceId, transactionId, {
    type: existing.type,
    amount,
    categoryId: existing.categoryId,
    profileId: existing.profileId,
    title: existing.title ?? "",
    description: existing.description ?? "",
    occurredOn: existing.occurredOn,
  });
  if (!updated) throw notFound("Your entry is in a workspace you can no longer open");
  await db
    .update(splitShares)
    .set({ addedAmountMinor: row.share.amountMinor })
    .where(and(eq(splitShares.id, row.share.id), eq(splitShares.transactionId, transactionId)));
  logger.info("Split share's workspace entry updated", {
    event: "split.share_entry_updated",
    expenseId,
    transactionId,
    sameCurrency,
  });
  return { transactionId, workspaceId };
}

/**
 * "Remove from my workspace": the caller was dropped from an expense (or
 * their share became 0) after they'd added it. Moves the linked workspace
 * transaction to the trash through the normal `deleteTransaction` (access
 * checks in its own workspace; restorable for 30 days), then clears the link
 * and the empty share row — a trashed transaction still exists, so the FK
 * alone wouldn't.
 */
export async function removeWorkspaceEntry(
  userId: string,
  rawGroupId: unknown,
  rawExpenseId: unknown,
): Promise<{ transactionId: string }> {
  const db = getDb();
  const ctx = await requireJoined(userId, rawGroupId);
  const expenseId = parseSplitId(rawExpenseId, EXPENSE_NOT_FOUND);
  const [row] = await db
    .select({
      share: splitShares,
      workspaceId: profiles.workspaceId,
      entryTrashed: transactions.deletedAt,
      profileTrashed: profiles.deletedAt,
    })
    .from(splitExpenses)
    .innerJoin(
      splitShares,
      and(eq(splitShares.expenseId, splitExpenses.id), eq(splitShares.memberId, ctx.me.id)),
    )
    // trash: the linked entry in any state — a trashed one still counts as added, and is answered with a 409 / let go below
    .leftJoin(transactions, eq(transactions.id, splitShares.transactionId))
    // trash: its profile in any state, for the same reason (a profile in the trash hides the entry)
    .leftJoin(profiles, eq(profiles.id, transactions.profileId))
    .where(and(eq(splitExpenses.id, expenseId), eq(splitExpenses.groupId, ctx.group.id)));
  if (!row) throw notFound("You don't have a share in this expense");
  const transactionId = row.share.transactionId;
  if (!transactionId || !row.workspaceId) throw conflict("Your share isn't in a workspace");
  if (row.share.amountMinor > 0) {
    throw conflict("You're still part of this expense — update your entry instead");
  }
  // Already in the trash (on its own or with its profile): nothing left to
  // move — just let go of the link below.
  if (!row.entryTrashed && !row.profileTrashed) {
    const deleted = await deleteTransaction(userId, row.workspaceId, transactionId);
    if (!deleted) throw notFound("Your entry is in a workspace you can no longer open");
  }
  // Explicitly, not just via the FK: a transaction moved to the trash still exists.
  await db
    .delete(splitShares)
    .where(and(eq(splitShares.id, row.share.id), eq(splitShares.amountMinor, 0)));
  await db
    .update(splitShares)
    .set({ transactionId: null, addedAt: null, addedAmountMinor: null })
    .where(and(eq(splitShares.id, row.share.id), eq(splitShares.transactionId, transactionId)));
  logger.info("Split share's workspace entry removed", {
    event: "split.share_entry_removed",
    expenseId,
    transactionId,
  });
  return { transactionId };
}
