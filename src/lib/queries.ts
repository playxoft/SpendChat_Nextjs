import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, profiles, transactions, users } from "@/db/schema";
import { accessibleProfileIds } from "@/lib/workspaces";

/** The page size shared by the transactions list, its infinite-scroll loader,
 * and the load-more server action. */
export const TRANSACTIONS_PAGE_SIZE = 50;

export type SortColumn = "date" | "category" | "title" | "description" | "amount";
export type SortDir = "asc" | "desc";

export type TxnFilters = {
  from?: string;
  to?: string;
  type?: "income" | "expense";
  categoryId?: string;
  profileId?: string;
  search?: string;
  /** Web-only column sort. The mobile API never sets these, so its ordering
   * (newest first) is unchanged. */
  sort?: SortColumn;
  dir?: SortDir;
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
  /** Author attribution: who entered the row. `userId` is always present
   * (`transactions.user_id` is notNull); name/email come from the joined
   * `users` row and may be null. Surfaced in shared workspaces. */
  userId: string;
  userName: string | null;
  userEmail: string | null;
};

/**
 * Reads are scoped to the profiles the user can at least view in the current
 * workspace — not to `transactions.user_id` (that column is attribution: who
 * entered the row, which matters in shared profiles).
 */
function buildConditions(userId: string, workspaceId: string, f: TxnFilters) {
  const conds = [inArray(transactions.profileId, accessibleProfileIds(userId, workspaceId))];
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

/**
 * Ordering for the list. No `sort` → the original newest-first order (unchanged,
 * so the mobile API is unaffected). A `sort` adds `createdAt`+`id` tiebreakers so
 * the total order is deterministic and offset paging (infinite scroll) is stable.
 */
function orderByFor(f: TxnFilters) {
  if (!f.sort) {
    return [desc(transactions.occurredOn), desc(transactions.createdAt)];
  }
  const direction = f.dir === "asc" ? asc : desc;
  // Sort by the signed value so "Amount" ascending runs largest-expense →
  // largest-income, matching what the column displays.
  const amountSigned = sql`case when ${transactions.type} = 'income' then ${transactions.amountMinor} else -${transactions.amountMinor} end`;
  const target = {
    date: transactions.occurredOn,
    category: categories.name,
    title: transactions.title,
    description: transactions.description,
    amount: amountSigned,
  }[f.sort];
  return [direction(target), desc(transactions.createdAt), desc(transactions.id)];
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
  userId: transactions.userId,
  userName: users.name,
  userEmail: users.email,
};

export async function listTransactions(
  userId: string,
  workspaceId: string,
  f: TxnFilters = {},
): Promise<TransactionRow[]> {
  const db = getDb();
  return db
    .select(txnSelection)
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(profiles, eq(transactions.profileId, profiles.id))
    .leftJoin(users, eq(transactions.userId, users.id))
    .where(buildConditions(userId, workspaceId, f))
    .orderBy(...orderByFor(f))
    .limit(f.limit ?? 100)
    .offset(f.offset ?? 0);
}

/**
 * A single transaction (joined with its category + profile), or null when it
 * doesn't exist or isn't in a profile the user can view in the *current*
 * workspace — the same scoping as the list path, so a transaction from one of
 * the user's other workspaces reads as absent, never as accessible.
 */
export async function getTransactionById(
  userId: string,
  workspaceId: string,
  id: string,
): Promise<TransactionRow | null> {
  const db = getDb();
  const [row] = await db
    .select(txnSelection)
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(profiles, eq(transactions.profileId, profiles.id))
    .leftJoin(users, eq(transactions.userId, users.id))
    .where(
      and(
        eq(transactions.id, id),
        inArray(transactions.profileId, accessibleProfileIds(userId, workspaceId)),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Oldest-first, for the chat feed (messages read top to bottom). */
export async function listTransactionsAsc(
  userId: string,
  workspaceId: string,
  f: TxnFilters = {},
): Promise<TransactionRow[]> {
  const rows = await listTransactions(userId, workspaceId, f);
  return rows.reverse();
}

/** The tracker chat feed's page size. Smaller than the table's — bubbles are
 * taller — and the feed pages back through all history as you scroll up. */
export const FEED_PAGE_SIZE = 40;

/** A cursor into the feed's (occurredOn, createdAt, id) order. */
export type FeedCursor = { occurredOn: string; createdAt: Date; id: string };

/**
 * One page of the tracker chat feed, newest-first, optionally older than a
 * cursor. Keyset paginated on (occurredOn, createdAt, id) so paging stays stable
 * as new rows land at the top (an offset would drift). Not month-scoped —
 * scrolling up walks further into history. The caller reverses to oldest-first.
 */
export async function listFeedPage(
  userId: string,
  workspaceId: string,
  opts: { profileId?: string; limit: number; before?: FeedCursor },
): Promise<TransactionRow[]> {
  const db = getDb();
  const base = buildConditions(userId, workspaceId, { profileId: opts.profileId });
  const b = opts.before;
  const where = b
    ? and(
        base,
        or(
          lt(transactions.occurredOn, b.occurredOn),
          and(eq(transactions.occurredOn, b.occurredOn), lt(transactions.createdAt, b.createdAt)),
          and(
            eq(transactions.occurredOn, b.occurredOn),
            eq(transactions.createdAt, b.createdAt),
            lt(transactions.id, b.id),
          ),
        ),
      )
    : base;
  return db
    .select(txnSelection)
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(profiles, eq(transactions.profileId, profiles.id))
    .leftJoin(users, eq(transactions.userId, users.id))
    .where(where)
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt), desc(transactions.id))
    .limit(opts.limit);
}

export async function countTransactions(
  userId: string,
  workspaceId: string,
  f: TxnFilters = {},
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(buildConditions(userId, workspaceId, f));
  return row?.count ?? 0;
}

/**
 * Just the ids matching a filter — cheap (no joins). The tracker's optimistic
 * summary uses this to reconcile: once an added transaction's id lands here the
 * server total already counts it, so the pending amount is dropped (no double
 * count). Fetched alongside `getSummary` in the same request, so both land in
 * one commit.
 */
export async function listTransactionIds(
  userId: string,
  workspaceId: string,
  f: TxnFilters = {},
): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(buildConditions(userId, workspaceId, f));
  return rows.map((r) => r.id);
}

export type Summary = { income: number; expense: number; balance: number };

export async function getSummary(
  userId: string,
  workspaceId: string,
  f: TxnFilters = {},
): Promise<Summary> {
  const db = getDb();
  const rows = await db
    .select({
      type: transactions.type,
      total: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)`,
    })
    .from(transactions)
    .where(buildConditions(userId, workspaceId, f))
    .groupBy(transactions.type);

  let income = 0;
  let expense = 0;
  for (const r of rows) {
    if (r.type === "income") income = Number(r.total);
    else expense = Number(r.total);
  }
  return { income, expense, balance: income - expense };
}

export type MonthTotals = { month: string; income: number; expense: number };

/**
 * Per-calendar-month income/expense totals (minor units), keyed "YYYY-MM".
 * Powers the tracker's scroll: the sticky header can show any month's balance
 * without loading that month's rows. Grouped in SQL and honoring the same access
 * scoping + filters (from/to/profileId) as the feed, so the numbers line up with
 * what's on screen.
 */
export async function getMonthlyTotals(
  userId: string,
  workspaceId: string,
  f: TxnFilters = {},
): Promise<MonthTotals[]> {
  const db = getDb();
  const monthExpr = sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`;
  const rows = await db
    .select({
      month: monthExpr,
      type: transactions.type,
      total: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)`,
    })
    .from(transactions)
    .where(buildConditions(userId, workspaceId, f))
    .groupBy(monthExpr, transactions.type);

  const byMonth = new Map<string, MonthTotals>();
  for (const r of rows) {
    const m = byMonth.get(r.month) ?? { month: r.month, income: 0, expense: 0 };
    if (r.type === "income") m.income = Number(r.total);
    else m.expense = Number(r.total);
    byMonth.set(r.month, m);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type CategoryBreakdownRow = {
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  total: number;
};

export async function getCategoryBreakdown(
  userId: string,
  workspaceId: string,
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
    .where(and(buildConditions(userId, workspaceId, { ...f, type }), eq(transactions.type, type)))
    .groupBy(transactions.categoryId, categories.name, categories.icon)
    .orderBy(desc(sql`sum(${transactions.amountMinor})`));
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

export type MonthlyPoint = { month: string; income: number; expense: number };

export async function getMonthlyTrend(
  userId: string,
  workspaceId: string,
  fromISO: string,
  profileId?: string,
): Promise<{ month: string; type: "income" | "expense"; total: number }[]> {
  const db = getDb();
  const conds = [
    inArray(transactions.profileId, accessibleProfileIds(userId, workspaceId)),
    gte(transactions.occurredOn, fromISO),
  ];
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

/** The workspace's shared category list, in income/expense then name order. */
export async function getCategories(workspaceId: string) {
  const db = getDb();
  return db
    .select()
    .from(categories)
    .where(eq(categories.workspaceId, workspaceId))
    .orderBy(asc(categories.kind), asc(categories.name));
}

/** Profiles in the workspace the user can at least view, in sidebar order. */
export async function getProfiles(userId: string, workspaceId: string) {
  const db = getDb();
  return db
    .select()
    .from(profiles)
    .where(inArray(profiles.id, accessibleProfileIds(userId, workspaceId)))
    .orderBy(asc(profiles.sortOrder), asc(profiles.createdAt));
}

/**
 * The signed-in user's own account row for the settings page — name, email, and
 * avatar. `getAppContext().user` (a `SessionUser`) carries no `image`, so the
 * account page reads it here rather than widening the hot auth path's shape.
 */
export async function getAccountProfile(userId: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}
