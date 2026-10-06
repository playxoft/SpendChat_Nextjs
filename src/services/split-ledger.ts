import "server-only";
import { and, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  splitExpenses,
  splitMembers,
  splitSettlements,
  splitShares,
  type SplitMember,
  type SplitType,
} from "@/db/schema";
import { parseOrThrow } from "@/lib/api-response";
import { forbidden, notFound, validationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { formatMoney, toMinorUnits } from "@/lib/money";
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
import { splitExpenseSchema, splitSettlementSchema } from "@/lib/validation";
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
function planExpense(
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
  const totalMinor = toMinorUnits(data.amount, currency);
  try {
    const shares = computeShares(totalMinor, data.paidBy, spec, (m) => formatMoney(m, currency));
    return { totalMinor, shares, spec };
  } catch (err) {
    if (err instanceof SplitMathError) throw validationError(err.message);
    throw err;
  }
}

function percentFor(spec: ShareSpec, memberId: string): number | null {
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
    groupMembers(ctx.group.id, db),
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
      shares: shares
        .filter((s) => s.expenseId === e.id)
        .sort((a, b) => (order.get(a.memberId) ?? 0) - (order.get(b.memberId) ?? 0))
        .map((s) => ({
          memberId: s.memberId,
          name: names.get(s.memberId) ?? "",
          amountMinor: s.amountMinor,
          percentBp: s.percentBp,
        })),
      canEdit: canEditExpense(ctx.viewer, e),
      myShare: mine
        ? {
            shareId: mine.id,
            amountMinor: mine.amountMinor,
            added: mine.transactionId !== null,
            addedAt: mine.addedAt,
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
  const ctx = await requireJoined(userId, rawGroupId, db);
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
  const ctx = await requireJoined(userId, rawGroupId, db);
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
    const keep = new Set([expense.paidByMemberId, ...existing.map((s) => s.memberId)]);
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
    const nextIds = plan.shares.map((s) => s.memberId);
    await tx
      .delete(splitShares)
      .where(and(eq(splitShares.expenseId, expense.id), notInArray(splitShares.memberId, nextIds)));
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

/** A page of the group's payments, newest first. */
export async function listSettlements(
  userId: string,
  rawGroupId: unknown,
  page: SplitPage,
): Promise<{ items: SplitSettlementView[]; total: number; currency: string }> {
  const db = getDb();
  const ctx = await requireJoined(userId, rawGroupId, db);
  const [rows, [totalRow], members] = await Promise.all([
    db
      .select()
      .from(splitSettlements)
      .where(eq(splitSettlements.groupId, ctx.group.id))
      .orderBy(desc(splitSettlements.settledOn), desc(splitSettlements.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db.select({ n: count() }).from(splitSettlements).where(eq(splitSettlements.groupId, ctx.group.id)),
    groupMembers(ctx.group.id, db),
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
  const ctx = await requireJoined(userId, rawGroupId, db);
  const settlementId = parseSplitId(rawSettlementId, SETTLEMENT_NOT_FOUND);
  const [rows, members] = await Promise.all([
    db
      .select()
      .from(splitSettlements)
      .where(and(eq(splitSettlements.id, settlementId), eq(splitSettlements.groupId, ctx.group.id))),
    groupMembers(ctx.group.id, db),
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
        amountMinor: toMinorUnits(data.amount, ctx.group.currency),
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
