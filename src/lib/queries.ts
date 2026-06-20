import "server-only";
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, profiles, transactions } from "@/db/schema";

export type TxnFilters = {
  from?: string;
  to?: string;
  type?: "income" | "expense";
  categoryId?: string;
  profileId?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export type TransactionRow = {
  id: string;
  type: "income" | "expense";
  amountMinor: number;
  title: string | null;
  description: string | null;
  /** Deprecated alias of `title`; kept until all UI reads `title`. */
  note: string | null;
  occurredOn: string;
  createdAt: Date;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  profileId: string;
  profileName: string | null;
  profileIcon: string | null;
};

function buildConditions(userId: string, f: TxnFilters) {
  const conds = [eq(transactions.userId, userId)];
  if (f.from) conds.push(gte(transactions.occurredOn, f.from));
  if (f.to) conds.push(lte(transactions.occurredOn, f.to));
  if (f.type) conds.push(eq(transactions.type, f.type));
  if (f.categoryId) conds.push(eq(transactions.categoryId, f.categoryId));
  if (f.profileId) conds.push(eq(transactions.profileId, f.profileId));
  if (f.search) {
    const like = `%${f.search}%`;
    conds.push(
      or(
        ilike(transactions.title, like),
        ilike(transactions.description, like),
      )!,
    );
  }
  return and(...conds);
}

const txnSelection = {
  id: transactions.id,
  type: transactions.type,
  amountMinor: transactions.amountMinor,
  title: transactions.title,
  description: transactions.description,
  // Alias so legacy callers reading `.note` still resolve to the title.
  note: transactions.title,
  occurredOn: transactions.occurredOn,
  createdAt: transactions.createdAt,
  categoryId: transactions.categoryId,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  profileId: transactions.profileId,
  profileName: profiles.name,
  profileIcon: profiles.icon,
};

export async function listTransactions(
  userId: string,
  f: TxnFilters = {},
): Promise<TransactionRow[]> {
  const db = getDb();
  return db
    .select(txnSelection)
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(profiles, eq(transactions.profileId, profiles.id))
    .where(buildConditions(userId, f))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .limit(f.limit ?? 100)
    .offset(f.offset ?? 0);
}

/** Oldest-first, for the chat feed (messages read top to bottom). */
export async function listTransactionsAsc(
  userId: string,
  f: TxnFilters = {},
): Promise<TransactionRow[]> {
  const rows = await listTransactions(userId, f);
  return rows.reverse();
}

export async function countTransactions(userId: string, f: TxnFilters = {}): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(buildConditions(userId, f));
  return row?.count ?? 0;
}

export type Summary = { income: number; expense: number; balance: number };

export async function getSummary(userId: string, f: TxnFilters = {}): Promise<Summary> {
  const db = getDb();
  const rows = await db
    .select({
      type: transactions.type,
      total: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)`,
    })
    .from(transactions)
    .where(buildConditions(userId, f))
    .groupBy(transactions.type);

  let income = 0;
  let expense = 0;
  for (const r of rows) {
    if (r.type === "income") income = Number(r.total);
    else expense = Number(r.total);
  }
  return { income, expense, balance: income - expense };
}

export type CategoryBreakdownRow = {
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  total: number;
};

export async function getCategoryBreakdown(
  userId: string,
  type: "income" | "expense",
  f: TxnFilters = {},
): Promise<CategoryBreakdownRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      total: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(buildConditions(userId, { ...f, type }), eq(transactions.type, type)))
    .groupBy(transactions.categoryId, categories.name, categories.icon)
    .orderBy(desc(sql`sum(${transactions.amountMinor})`));
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

export type MonthlyPoint = { month: string; income: number; expense: number };

export async function getMonthlyTrend(
  userId: string,
  fromISO: string,
  profileId?: string,
): Promise<{ month: string; type: "income" | "expense"; total: number }[]> {
  const db = getDb();
  const conds = [eq(transactions.userId, userId), gte(transactions.occurredOn, fromISO)];
  if (profileId) conds.push(eq(transactions.profileId, profileId));
  const rows = await db
    .select({
      month: sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`,
      type: transactions.type,
      total: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)`,
    })
    .from(transactions)
    .where(and(...conds))
    .groupBy(sql`to_char(${transactions.occurredOn}, 'YYYY-MM')`, transactions.type)
    .orderBy(asc(sql`to_char(${transactions.occurredOn}, 'YYYY-MM')`));
  return rows.map((r) => ({ month: r.month, type: r.type, total: Number(r.total) }));
}

export async function getCategories(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.kind), asc(categories.name));
}

export async function getProfiles(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .orderBy(asc(profiles.sortOrder), asc(profiles.createdAt));
}
