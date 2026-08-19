import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gte, ilike, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import {
  categories,
  files,
  fileTags,
  folders,
  profiles,
  transactionAttachments,
  transactions,
  users,
} from "@/db/schema";
import { accessibleProfileIds } from "@/lib/workspaces";
import { memoizeForRequest } from "@/lib/request-cache";
import type { AttachmentDTO } from "@/lib/attachments";
import {
  serializeFile,
  serializeFolder,
  serializeTag,
  type FileDTO,
  type FolderDTO,
  type TagDTO,
  type TxnFileDTO,
} from "@/lib/files";

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
  /** Files attached to this transaction (receipts/bills/invoices), oldest-first.
   * Embedded from the DB in the same query so the detail dialog opens instantly
   * and the feed/table render clickable chips — no extra round-trip. `[]` when
   * none; `attachments.length` is the count for the 📎 indicators. */
  attachments: AttachmentDTO[];
};

/**
 * The ids of the profiles the caller can at least view in this workspace.
 *
 * Resolved to a plain array rather than left as a correlated subquery, because
 * knowing the ids lets `pageOf` emit one ordered index scan per profile and
 * merge them (see there). Inlined as a subquery the planner can only scan the
 * whole workspace and sort — 6,052,367 buffer reads for a page of 50 at 1M rows,
 * against 401 for the merged form.
 *
 * The extra round-trip is one indexed lookup returning a handful of rows, and it
 * happens once per request however many of these queries run. That takes two
 * memos, not one: React's `cache` covers an RSC render, and `memoizeForRequest`
 * covers the route handlers and server actions, where React has no Flight
 * request to hang a cache off and silently stops memoizing.
 */
const accessibleProfileIdList = cache(
  async (userId: string, workspaceId: string): Promise<string[]> =>
    memoizeForRequest(`accessible-profile-ids:${userId}:${workspaceId}`, async () => {
      const rows = await accessibleProfileIds(userId, workspaceId);
      return rows.map((r) => r.id);
    }),
);

/**
 * Reads are scoped to the profiles the user can at least view in the current
 * workspace — not to `transactions.user_id` (that column is attribution: who
 * entered the row, which matters in shared profiles).
 *
 * `profileIds` comes from `accessibleProfileIdList`. An empty list means the
 * caller can see nothing here; every caller short-circuits before reaching this,
 * since `inArray(col, [])` would otherwise have to be special-cased downstream.
 */
function buildConditions(profileIds: string[], f: TxnFilters) {
  const conds = [inArray(transactions.profileId, profileIds)];
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
 * Ordering for the list, expressed over `transactions` alone so it can be
 * applied *before* the joins (see `pageOf`). No `sort` → newest first; a `sort`
 * orders by that column. Either way the order is *total* — ties fall through to
 * `created_at` then `id` — so offset paging (infinite scroll) can't drop or
 * repeat a row.
 *
 * Sorting by category name is the one column that isn't on `transactions`. It
 * reads through a correlated subquery rather than a join, so the pre-limit query
 * stays join-free on every path; that sort is inherently a full sort of the
 * match set either way, since no index can order by a joined column.
 */
function orderByFor(f: TxnFilters) {
  if (!f.sort) {
    // `id` is the tiebreaker, not decoration: `addBulkTransactions` writes a
    // whole batch in one statement, so rows routinely share `occurred_on` *and*
    // `created_at`. Without a total order those ties can shuffle between two
    // pages of the same list, which shows up as a row appearing twice or not at
    // all while paging. It also matches `transactions_profile_date_idx` exactly.
    return [desc(transactions.occurredOn), desc(transactions.createdAt), desc(transactions.id)];
  }
  const direction = f.dir === "asc" ? asc : desc;
  // Sort by the signed value so "Amount" ascending runs largest-expense →
  // largest-income, matching what the column displays.
  const amountSigned = sql`case when ${transactions.type} = 'income' then ${transactions.amountMinor} else -${transactions.amountMinor} end`;
  const categoryName = sql`(select ${categories.name} from ${categories} where ${categories.id} = ${transactions.categoryId})`;
  const target = {
    date: transactions.occurredOn,
    category: categoryName,
    title: transactions.title,
    description: transactions.description,
    amount: amountSigned,
  }[f.sort];
  return [direction(target), desc(transactions.createdAt), desc(transactions.id)];
}

/** The transaction columns the outer select needs from the pre-limited page. */
const pageColumns = {
  id: transactions.id,
  type: transactions.type,
  amountMinor: transactions.amountMinor,
  title: transactions.title,
  description: transactions.description,
  occurredOn: transactions.occurredOn,
  createdAt: transactions.createdAt,
  categoryId: transactions.categoryId,
  profileId: transactions.profileId,
  userId: transactions.userId,
};

/** A page of `transactions` rows, already filtered, ordered and limited, as a
 * subquery the decorating joins hang off. */
type Page = ReturnType<typeof pageOf>;

/** The widest workspace the per-profile merge is worth emitting for; see
 * `mergeAppend`. */
const MERGE_APPEND_MAX_BRANCHES = 24;

/**
 * The newest-first total order, over `transactions` itself: the list's default
 * ordering and the feed's keyset cursor, which are deliberately the same shape
 * so one index serves both.
 *
 * Built fresh on every call rather than hoisted to a constant, because Drizzle
 * rewrites a set operation's `ORDER BY` chunks **in place** (a column becomes a
 * bare identifier, since only output column names are legal there). A shared
 * array would come back mutated and the next non-union query built from it would
 * emit unqualified names into a join.
 */
function cursorOrder() {
  return [desc(transactions.occurredOn), desc(transactions.createdAt), desc(transactions.id)];
}

/** One profile's slice of a page: an ordered index scan, stopped early. */
function pageBranch(where: SQL | undefined, take: number) {
  const db = getDb();
  return db
    .select(pageColumns)
    .from(transactions)
    .where(where)
    .orderBy(...cursorOrder())
    .limit(take);
}

/**
 * One ordered index scan per profile, `UNION ALL`-ed so Postgres can
 * `Merge Append` them and stop at the page size.
 *
 * Returns null when the shape doesn't apply, so the caller can fall back to a
 * single scan: fewer than two branches has nothing to merge, and past
 * `MERGE_APPEND_MAX_BRANCHES` every extra branch is another index scan and
 * another chunk of SQL for less and less benefit. Workspaces have a handful of
 * profiles in practice; the ceiling is a guard, not a tuning knob.
 */
function mergeAppend(branches: ReturnType<typeof pageBranch>[], limit: number, offset = 0) {
  // `unionAll` takes its first two operands positionally; destructuring is what
  // proves to TypeScript that they exist.
  const [first, second, ...rest] = branches;
  if (!first || !second || branches.length > MERGE_APPEND_MAX_BRANCHES) return null;
  return unionAll(first, second, ...rest)
    .orderBy(...cursorOrder())
    .limit(limit)
    .offset(offset)
    .as("page");
}

/**
 * The heart of the list path: pick the page from `transactions` alone, then let
 * the caller join the display columns onto the survivors.
 *
 * Two things are going on here, and both were measured against 1,000,000 rows in
 * a single workspace (page of 50):
 *
 *  1. **Limit before joining.** Joining first makes the planner evaluate
 *     `categories`, `profiles` and `users` for *every row the workspace owns*
 *     before the sort throws all but 50 away — 2,677 ms and 6,052,367 buffer
 *     reads. Limiting first drops that to 695 ms and 30,573.
 *
 *  2. **One ordered scan per profile, merged.** Even limited first, a single
 *     `profile_id in (…)` scan still has to read every matching row and top-N
 *     sort it, and the planner will happily pick a sequential scan to do it.
 *     Emitting one branch per profile — each an ordered index scan over
 *     `transactions_profile_date_idx`, each stopped at the page size — lets
 *     Postgres `Merge Append` them and stop after 50 rows total: **35 ms and 401
 *     buffer reads**, and it stays there as the workspace grows, because no
 *     branch ever reads past what the page needs.
 *
 * The merge-append shape only works for the default cursor order. A custom
 * column sort has to sort the whole match set whatever we do (no index can order
 * by a joined category name), so those fall through to the single-scan form.
 */
function pageOf(profileIds: string[], f: TxnFilters) {
  const db = getDb();
  const limit = f.limit ?? 100;
  const offset = f.offset ?? 0;

  const singleScan = () =>
    db
      .select(pageColumns)
      .from(transactions)
      .where(buildConditions(profileIds, f))
      .orderBy(...orderByFor(f))
      .limit(limit)
      .offset(offset)
      .as("page");

  // A custom sort can't merge-append (no index orders by a joined category
  // name); `f.profileId` narrows the list to one thread, which is already a
  // plain ordered index scan with nothing to merge.
  if (f.sort || f.profileId) return singleScan();

  // Each branch must cover the offset too, since the merge happens above it.
  const take = limit + offset;
  const branches = profileIds.map((id) => pageBranch(buildConditions([id], f), take));
  return mergeAppend(branches, limit, offset) ?? singleScan();
}

/**
 * A single transaction by id, scoped to the caller's profiles. A primary-key hit
 * — nothing to page and nothing to merge — so it stays its own shape rather than
 * an option on `pageOf`, where an absent predicate would silently widen into
 * "the newest row in the workspace".
 */
function rowOf(id: string, profileIds: string[]) {
  const db = getDb();
  return db
    .select(pageColumns)
    .from(transactions)
    .where(and(eq(transactions.id, id), inArray(transactions.profileId, profileIds)))
    .limit(1)
    .as("page");
}

/**
 * Re-state the ordering on the outer query. Joining a subquery does not preserve
 * its row order, so without this the page comes back arbitrarily shuffled.
 * Mirrors `orderByFor`, but reads the already-selected page columns — and can
 * use the real `categories.name` join, since by here it is only 50 rows.
 */
function orderByPage(page: Page, f: TxnFilters) {
  if (!f.sort) {
    return [desc(page.occurredOn), desc(page.createdAt), desc(page.id)];
  }
  const direction = f.dir === "asc" ? asc : desc;
  const amountSigned = sql`case when ${page.type} = 'income' then ${page.amountMinor} else -${page.amountMinor} end`;
  const target = {
    date: page.occurredOn,
    category: categories.name,
    title: page.title,
    description: page.description,
    amount: amountSigned,
  }[f.sort];
  return [direction(target), desc(page.createdAt), desc(page.id)];
}

/** The display columns, hung off an already-limited page of transactions. */
function selectionFor(page: Page) {
  return {
    id: page.id,
    type: page.type,
    amountMinor: page.amountMinor,
    title: page.title,
    description: page.description,
    // Alias so legacy callers reading `.note` still resolve to the title.
    note: page.title,
    occurredOn: page.occurredOn,
    createdAt: page.createdAt,
    categoryId: page.categoryId,
    categoryName: categories.name,
    categoryIcon: categories.icon,
    profileId: page.profileId,
    profileName: profiles.name,
    profileIcon: profiles.icon,
    userId: page.userId,
    userName: users.name,
    userEmail: users.email,
    // Files attached to the row, embedded as JSON so the detail dialog and the
    // feed/table chips render straight from this query — no per-row round-trip.
    // Correlated + ordered oldest-first (indexed on transaction_id, created_at);
    // coalesced to an empty array when the row has none. Runs once per *returned*
    // row, because the page is already limited by the time it is projected.
    attachments: sql<AttachmentDTO[]>`(
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', ${transactionAttachments.id},
            'transactionId', ${transactionAttachments.transactionId},
            'fileName', ${transactionAttachments.fileName},
            'contentType', ${transactionAttachments.contentType},
            'sizeBytes', ${transactionAttachments.sizeBytes},
            'kind', ${transactionAttachments.kind},
            'label', ${transactionAttachments.label},
            'hasThumbnail', (${transactionAttachments.thumbnailKey} is not null),
            'createdAt', ${transactionAttachments.createdAt}
          )
          order by ${transactionAttachments.createdAt}
        ),
        '[]'::jsonb
      )
      from ${transactionAttachments}
      where ${transactionAttachments.transactionId} = ${page.id}
    )`,
  };
}

/** Decorate a limited page with its category / profile / author columns. */
function decorate(page: Page, f: TxnFilters) {
  const db = getDb();
  return db
    .select(selectionFor(page))
    .from(page)
    .leftJoin(categories, eq(page.categoryId, categories.id))
    .leftJoin(profiles, eq(page.profileId, profiles.id))
    .leftJoin(users, eq(page.userId, users.id))
    .orderBy(...orderByPage(page, f));
}

export async function listTransactions(
  userId: string,
  workspaceId: string,
  f: TxnFilters = {},
): Promise<TransactionRow[]> {
  const profileIds = await accessibleProfileIdList(userId, workspaceId);
  if (profileIds.length === 0) return [];
  return decorate(pageOf(profileIds, f), f);
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
  const profileIds = await accessibleProfileIdList(userId, workspaceId);
  if (profileIds.length === 0) return null;
  const [row] = await decorate(rowOf(id, profileIds), {});
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

/** Access scope, plus "strictly older than the cursor" in the feed's order. */
function feedConditions(profileIds: string[], opts: { profileId?: string; before?: FeedCursor }) {
  const base = buildConditions(profileIds, { profileId: opts.profileId });
  const b = opts.before;
  if (!b) return base;
  return and(
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
  );
}

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
  const profileIds = await accessibleProfileIdList(userId, workspaceId);
  if (profileIds.length === 0) return [];
  // The cursor's `(occurred_on, created_at, id)` order is exactly
  // `transactions_profile_date_idx`'s trailing columns, so one profile reads
  // straight off the index — no sort, and the page costs the same at any depth
  // in history. Several profiles need the same merge as the list: a btree led by
  // `profile_id` orders by profile first, so `profile_id in (…)` cannot produce
  // global date order and Postgres falls back to sorting the whole match set.
  // "All profiles" is a supported mode on the app's busiest page, so it gets one
  // ordered scan per profile too. No offset to cover here — the cursor
  // predicate is the same in every branch, so `limit` rows per branch is enough.
  const merged = opts.profileId
    ? null
    : mergeAppend(
        profileIds.map((id) => pageBranch(feedConditions([id], opts), opts.limit)),
        opts.limit,
      );
  const page = merged ?? pageBranch(feedConditions(profileIds, opts), opts.limit).as("page");
  return decorate(page, {});
}

export async function countTransactions(
  userId: string,
  workspaceId: string,
  f: TxnFilters = {},
): Promise<number> {
  const profileIds = await accessibleProfileIdList(userId, workspaceId);
  if (profileIds.length === 0) return 0;
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(buildConditions(profileIds, f));
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
  const profileIds = await accessibleProfileIdList(userId, workspaceId);
  if (profileIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(buildConditions(profileIds, f));
  return rows.map((r) => r.id);
}

export type Summary = { income: number; expense: number; balance: number };

export async function getSummary(
  userId: string,
  workspaceId: string,
  f: TxnFilters = {},
): Promise<Summary> {
  const profileIds = await accessibleProfileIdList(userId, workspaceId);
  if (profileIds.length === 0) return { income: 0, expense: 0, balance: 0 };
  const db = getDb();
  const rows = await db
    .select({
      type: transactions.type,
      total: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)`,
    })
    .from(transactions)
    .where(buildConditions(profileIds, f))
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
  const profileIds = await accessibleProfileIdList(userId, workspaceId);
  if (profileIds.length === 0) return [];
  const db = getDb();
  const monthExpr = sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`;
  const rows = await db
    .select({
      month: monthExpr,
      type: transactions.type,
      total: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)`,
    })
    .from(transactions)
    .where(buildConditions(profileIds, f))
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
  const profileIds = await accessibleProfileIdList(userId, workspaceId);
  if (profileIds.length === 0) return [];
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
    .where(and(buildConditions(profileIds, { ...f, type }), eq(transactions.type, type)))
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
  const profileIds = await accessibleProfileIdList(userId, workspaceId);
  if (profileIds.length === 0) return [];
  const db = getDb();
  const conds = [
    inArray(transactions.profileId, profileIds),
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

/** Full attachment row (metadata only; the bytes live in R2 under `r2Key`). */
export type AttachmentRow = typeof transactionAttachments.$inferSelect;

/**
 * Attachments for a transaction, scoped to profiles the user can view in the
 * current workspace. Scopes on the denormalized `profile_id`, so a transaction
 * in another workspace (or a profile the user can't reach) returns an empty
 * list — same access model as `getTransactionById`. Oldest-first.
 */
export async function listTransactionAttachments(
  userId: string,
  workspaceId: string,
  transactionId: string,
): Promise<AttachmentRow[]> {
  const db = getDb();
  return db
    .select()
    .from(transactionAttachments)
    .where(
      and(
        eq(transactionAttachments.transactionId, transactionId),
        inArray(transactionAttachments.profileId, accessibleProfileIds(userId, workspaceId)),
      ),
    )
    .orderBy(asc(transactionAttachments.createdAt));
}

/**
 * A single attachment the user can view in the current workspace, or null when
 * it doesn't exist or lives outside the user's accessible profiles. Backs the
 * download route's access check (viewer-or-better).
 */
export async function getAttachmentById(
  userId: string,
  workspaceId: string,
  attachmentId: string,
): Promise<AttachmentRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(transactionAttachments)
    .where(
      and(
        eq(transactionAttachments.id, attachmentId),
        inArray(transactionAttachments.profileId, accessibleProfileIds(userId, workspaceId)),
      ),
    )
    .limit(1);
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/* Files vault                                                                 */
/* -------------------------------------------------------------------------- */

/** Full vault rows (carry `r2Key`) — service/route-side only, never a client. */
export type VaultFileRow = typeof files.$inferSelect;
export type VaultFolderRow = typeof folders.$inferSelect;

/** The vault page loads at most this many files per request. Folder trees are
 * tiny; a document vault under this many files browses entirely client-side.
 * The page shows a notice when the cap is hit. */
export const VAULT_FILES_LIMIT = 500;

/**
 * Every folder the user can view in the current workspace (optionally one
 * profile). The whole tree ships to the client — folders are lightweight rows
 * and the breadcrumbs/tree view need ancestry, so there's no point paging.
 */
export async function listVaultFolders(
  userId: string,
  workspaceId: string,
  profileId?: string,
): Promise<FolderDTO[]> {
  const db = getDb();
  const conds = [inArray(folders.profileId, accessibleProfileIds(userId, workspaceId))];
  if (profileId) conds.push(eq(folders.profileId, profileId));
  const rows = await db
    .select({
      id: folders.id,
      profileId: folders.profileId,
      parentId: folders.parentId,
      name: folders.name,
      color: folders.color,
      systemKey: folders.systemKey,
      tagIds: folders.tagIds,
      createdAt: folders.createdAt,
      updatedAt: folders.updatedAt,
      createdByName: users.name,
    })
    .from(folders)
    .leftJoin(users, eq(folders.userId, users.id))
    .where(and(...conds))
    .orderBy(asc(folders.name), asc(folders.createdAt));
  return rows.map(serializeFolder);
}

/**
 * Vault files the user can view in the current workspace (optionally one
 * profile), newest first, joined with uploader + profile display fields.
 * Capped at `VAULT_FILES_LIMIT`; search/folder filtering happens client-side
 * on this working set.
 */
export async function listVaultFiles(
  userId: string,
  workspaceId: string,
  profileId?: string,
): Promise<FileDTO[]> {
  const db = getDb();
  const conds = [inArray(files.profileId, accessibleProfileIds(userId, workspaceId))];
  if (profileId) conds.push(eq(files.profileId, profileId));
  const rows = await db
    .select({
      id: files.id,
      profileId: files.profileId,
      folderId: files.folderId,
      name: files.name,
      contentType: files.contentType,
      sizeBytes: files.sizeBytes,
      category: files.category,
      tagIds: files.tagIds,
      thumbnailKey: files.thumbnailKey,
      createdAt: files.createdAt,
      uploaderName: users.name,
      profileName: profiles.name,
      profileIcon: profiles.icon,
    })
    .from(files)
    .leftJoin(users, eq(files.userId, users.id))
    .leftJoin(profiles, eq(files.profileId, profiles.id))
    .where(and(...conds))
    .orderBy(desc(files.createdAt), desc(files.id))
    .limit(VAULT_FILES_LIMIT);
  return rows.map(serializeFile);
}

/**
 * Total stored bytes for a workspace: vault files + transaction attachments,
 * the two tables whose rows own R2 objects. Deliberately scoped by
 * `workspace_id` — this is the quota/billing scope, not the caller's
 * visibility scope, so members with partial profile access still count (and
 * see) the whole pool. Thumbnails aren't in `size_bytes` (accepted
 * undercount). One round trip; both sums lead on the workspace indexes.
 */
export async function getWorkspaceStorageUsage(workspaceId: string): Promise<number> {
  const db = getDb();
  const rows = await unionAll(
    db
      .select({ bytes: sql<string>`coalesce(sum(${files.sizeBytes}), 0)` })
      .from(files)
      .where(eq(files.workspaceId, workspaceId)),
    db
      .select({ bytes: sql<string>`coalesce(sum(${transactionAttachments.sizeBytes}), 0)` })
      .from(transactionAttachments)
      .where(eq(transactionAttachments.workspaceId, workspaceId)),
  );
  // pg returns bigint sums as strings; 1 GB scale is far below 2^53.
  return rows.reduce((total, r) => total + Number(r.bytes), 0);
}

/**
 * Per-request deduped variant for RSC renders: /app/files reads the total for
 * its toolbar ring, and `cache()` collapses that with any other reader in the
 * same render pass into one query. Quota checks (`assertStorageQuota`) and API
 * routes stay on the uncached read above so an action that uploads and
 * re-renders in one request never serves a stale sum.
 */
export const getWorkspaceStorageUsageCached = cache(getWorkspaceStorageUsage);

/** Vault tags of the accessible profiles (optionally one), for the pickers
 * and for resolving items' `tagIds` into names + colors client-side. */
export async function listVaultTags(
  userId: string,
  workspaceId: string,
  profileId?: string,
): Promise<TagDTO[]> {
  const db = getDb();
  const conds = [inArray(fileTags.profileId, accessibleProfileIds(userId, workspaceId))];
  if (profileId) conds.push(eq(fileTags.profileId, profileId));
  const rows = await db
    .select()
    .from(fileTags)
    .where(and(...conds))
    .orderBy(asc(fileTags.name));
  return rows.map(serializeTag);
}

/** A single vault file the user can view, or null. Carries `r2Key` (download route). */
export async function getVaultFile(
  userId: string,
  workspaceId: string,
  fileId: string,
): Promise<VaultFileRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        inArray(files.profileId, accessibleProfileIds(userId, workspaceId)),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** A single vault folder the user can view, or null. */
export async function getVaultFolder(
  userId: string,
  workspaceId: string,
  folderId: string,
): Promise<VaultFolderRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        inArray(folders.profileId, accessibleProfileIds(userId, workspaceId)),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Transaction attachments surfaced in the files page, flattened with the
 * parent transaction's info (title/amount/date) so a receipt is recognizable
 * outside its chat thread. Same access scoping as everything else; newest
 * first, capped like the vault list.
 */
export async function listTransactionFilesForVault(
  userId: string,
  workspaceId: string,
  profileId?: string,
): Promise<TxnFileDTO[]> {
  const db = getDb();
  const conds = [
    inArray(transactionAttachments.profileId, accessibleProfileIds(userId, workspaceId)),
  ];
  if (profileId) conds.push(eq(transactionAttachments.profileId, profileId));
  const rows = await db
    .select({
      id: transactionAttachments.id,
      transactionId: transactionAttachments.transactionId,
      fileName: transactionAttachments.fileName,
      label: transactionAttachments.label,
      contentType: transactionAttachments.contentType,
      sizeBytes: transactionAttachments.sizeBytes,
      thumbnailKey: transactionAttachments.thumbnailKey,
      createdAt: transactionAttachments.createdAt,
      txnTitle: transactions.title,
      txnType: transactions.type,
      txnAmountMinor: transactions.amountMinor,
      txnOccurredOn: transactions.occurredOn,
      profileId: transactionAttachments.profileId,
      profileName: profiles.name,
      profileIcon: profiles.icon,
    })
    .from(transactionAttachments)
    .innerJoin(transactions, eq(transactionAttachments.transactionId, transactions.id))
    .leftJoin(profiles, eq(transactionAttachments.profileId, profiles.id))
    .where(and(...conds))
    .orderBy(desc(transactionAttachments.createdAt), desc(transactionAttachments.id))
    .limit(VAULT_FILES_LIMIT);
  return rows.map((r) => ({
    id: r.id,
    transactionId: r.transactionId,
    name: r.label && r.label.trim() ? r.label : r.fileName,
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
    hasThumbnail: r.thumbnailKey != null,
    createdAt: r.createdAt.toISOString(),
    txnTitle: r.txnTitle,
    txnType: r.txnType,
    txnAmountMinor: r.txnAmountMinor,
    txnOccurredOn: r.txnOccurredOn,
    profileId: r.profileId,
    profileName: r.profileName,
    profileIcon: r.profileIcon,
  }));
}
