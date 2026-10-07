import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import { assertAdvancedAnalytics, type WorkspaceEntitlements } from "@/lib/entitlements";
import { getCategories, getProfiles, getTags } from "@/lib/queries";
import { notTrashed } from "@/lib/trash-scope";
import {
  MONTH_NAMES_PATTERN,
  RECURRING_MONTHS,
  TITLE_SEPARATORS_PATTERN,
  buildAdvancedAnalytics,
  calendarWindow,
  firstDayOfWeek,
  monthEnd,
  monthStart,
  normsFrom,
  shiftMonth,
  type AdvancedAnalyticsData,
  type AdvancedRaw,
  type BreakdownRow,
  type DailyTotal,
} from "@/lib/insights";

/**
 * The reads behind the analytics page's "Insights & trends" (Plus and Pro).
 * Every number is a SQL aggregate — totals per month, per day, per category,
 * medians, the few largest entries per category — and the judgement calls
 * (projection, unusual, recurring) are made by the pure functions in
 * `insights.ts` over those aggregates.
 *
 * Every query here:
 *  - is gated first: `assertAdvancedAnalytics` runs before a single
 *    transaction is read, so a Free workspace's request computes nothing;
 *  - is scoped to the profiles the caller can view in this workspace
 *    (`getProfiles` → `accessibleProfileIds`, which also hides trashed
 *    profiles), narrowed to one profile when the page's filter names one;
 *  - excludes the trash (`notTrashed(transactions)` in its own `where`, the
 *    literal predicate that also lets the planner use the partial
 *    `transactions_profile_date_idx` for the `profile_id` + date range);
 *  - sums integer minor units (`amount_minor`, returned as text so a bigint
 *    sum can't lose precision on the way);
 *  - dates by the transaction's own `occurred_on` calendar day, months by
 *    `to_char(occurred_on, 'YYYY-MM')`, "today" in the viewer's zone — the
 *    rules the rest of the page uses.
 */

type ProfileRow = Awaited<ReturnType<typeof getProfiles>>[number];

export type AdvancedAnalyticsOptions = {
  /** The viewer's local date (`todayISO(await getTimeZone())`). */
  today: string;
  /** The page's date range; both absent = all time. */
  from?: string;
  to?: string;
  /** One profile, or undefined for every profile the caller can view. */
  profileId?: string;
  currency: string;
  locale: string;
};

/** Live expenses of these profiles, optionally between two days (inclusive). */
function expensesOf(ids: string[], from?: string, to?: string): SQL {
  const conds: SQL[] = [inArray(transactions.profileId, ids), eq(transactions.type, "expense")];
  if (from) conds.push(gte(transactions.occurredOn, from));
  if (to) conds.push(lte(transactions.occurredOn, to));
  return and(...conds)!;
}

const sumText = () => sql<string>`sum(${transactions.amountMinor})::text`;

/**
 * Totals per month × type × category for the 13 months ending this one — the
 * cash flow (12), comparisons (this month, last month, the usual 3, a year ago)
 * and category trends all come from this one scan. `to_date` is the same sum
 * over days 1…`day` of each month: "by this point in the month".
 */
async function monthlyByCategory(ids: string[], today: string) {
  const month = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const monthExpr = sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`;
  const rows = await getDb()
    .select({
      month: monthExpr,
      type: transactions.type,
      categoryId: transactions.categoryId,
      total: sumText(),
      toDate: sql<string>`(coalesce(sum(${transactions.amountMinor}) filter (where extract(day from ${transactions.occurredOn}) <= ${day}::int), 0))::text`,
    })
    .from(transactions)
    .where(
      and(
        notTrashed(transactions),
        inArray(transactions.profileId, ids),
        gte(transactions.occurredOn, monthStart(shiftMonth(month, -12))),
        lte(transactions.occurredOn, monthEnd(month)),
      ),
    )
    .groupBy(monthExpr, transactions.type, transactions.categoryId);
  return rows.map((r) => ({
    month: r.month,
    type: r.type,
    categoryId: r.categoryId,
    total: Number(r.total),
    toDate: Number(r.toDate),
  }));
}

/** Expenses per day between two days. */
async function dailyExpenses(ids: string[], from: string, to: string): Promise<DailyTotal[]> {
  const rows = await getDb()
    .select({ date: transactions.occurredOn, total: sumText() })
    .from(transactions)
    .where(and(notTrashed(transactions), expensesOf(ids, from, to)))
    .groupBy(transactions.occurredOn)
    .orderBy(asc(transactions.occurredOn));
  return rows.map((r) => ({ date: r.date, total: Number(r.total) }));
}

/** Each category's median expense and how many there were, over the norms window. */
async function categoryNorms(ids: string[], from: string, to: string) {
  const rows = await getDb()
    .select({
      categoryId: transactions.categoryId,
      median: sql<string>`(percentile_cont(0.5) within group (order by ${transactions.amountMinor}))::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(and(notTrashed(transactions), expensesOf(ids, from, to)))
    .groupBy(transactions.categoryId);
  return rows.map((r) => ({ categoryId: r.categoryId, median: Number(r.median), count: Number(r.count) }));
}

/** The three largest expenses of each category in the window — the only ones that can be unusual. */
async function anomalyCandidates(ids: string[], from: string, to: string) {
  const db = getDb();
  const ranked = db
    .select({
      id: transactions.id,
      categoryId: transactions.categoryId,
      amount: transactions.amountMinor,
      date: transactions.occurredOn,
      title: transactions.title,
      rank: sql<number>`row_number() over (partition by ${transactions.categoryId} order by ${transactions.amountMinor} desc, ${transactions.id})`.as(
        "rank",
      ),
    })
    .from(transactions)
    .where(and(notTrashed(transactions), expensesOf(ids, from, to)))
    .as("ranked");
  const rows = await db.select().from(ranked).where(lte(ranked.rank, 3));
  return rows.map((r) => ({
    id: r.id,
    categoryId: r.categoryId,
    amount: Number(r.amount),
    date: r.date,
    title: r.title,
  }));
}

/**
 * Expenses grouped by what makes a payment "the same one": its title with case,
 * digits, English month names, separators and spacing ignored ("Rent Sep 2026"
 * = "rent - October"; the same rules as `recurringLabel`), or with no title the
 * same category at exactly the same amount. Only groups seen in at least three
 * different months, with no more than one extra entry, come back — the rest
 * can't be monthly — and `detectRecurring` judges the cadence.
 */
async function recurringGroups(ids: string[], today: string) {
  const month = today.slice(0, 7);
  // Constant patterns, inlined (not bound) so the expression is identical in
  // the select list and the `group by`. `\m`/`\M` are Postgres word bounds.
  const monthWords = sql.raw(`'\\m(${MONTH_NAMES_PATTERN})\\M'`);
  const separators = sql.raw(`'${TITLE_SEPARATORS_PATTERN}'`);
  const titleKey = sql`nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(${transactions.title}), '[0-9]+', ' ', 'g'), ${monthWords}, ' ', 'g'), ${separators}, ' ', 'g'), '[[:space:]]+', ' ', 'g')), '')`;
  const key = sql<string>`coalesce(${titleKey}, '#' || coalesce(${transactions.categoryId}::text, '') || ':' || ${transactions.amountMinor}::text)`;
  const months = sql`count(distinct to_char(${transactions.occurredOn}, 'YYYY-MM'))`;
  const rows = await getDb()
    .select({
      key,
      title: sql<string | null>`mode() within group (order by btrim(${transactions.title}))`,
      categoryId: sql<string | null>`(mode() within group (order by ${transactions.categoryId}))::text`,
      dates: sql<string[]>`array_agg(to_char(${transactions.occurredOn}, 'YYYY-MM-DD') order by ${transactions.occurredOn})`,
      amounts: sql<string[]>`array_agg(${transactions.amountMinor}::text order by ${transactions.occurredOn})`,
    })
    .from(transactions)
    .where(
      and(
        notTrashed(transactions),
        expensesOf(ids, monthStart(shiftMonth(month, -RECURRING_MONTHS)), today),
      ),
    )
    .groupBy(key)
    .having(sql`${months} >= 3 and count(*) <= ${months} + 1`)
    .orderBy(desc(sql`sum(${transactions.amountMinor})`))
    .limit(100);
  return rows.map((r) => ({
    key: r.key,
    title: r.title,
    categoryId: r.categoryId,
    dates: r.dates,
    amounts: r.amounts.map(Number),
  }));
}

const BREAKDOWN_LIMIT = 8;

/** Where the money went in the range, by title ("payee"), case and spacing ignored. */
async function payees(ids: string[], from?: string, to?: string): Promise<BreakdownRow[]> {
  const key = sql<string>`regexp_replace(lower(btrim(${transactions.title})), '[[:space:]]+', ' ', 'g')`;
  const rows = await getDb()
    .select({
      key,
      label: sql<string>`mode() within group (order by btrim(${transactions.title}))`,
      total: sumText(),
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(
      and(
        notTrashed(transactions),
        expensesOf(ids, from, to),
        sql`btrim(coalesce(${transactions.title}, '')) <> ''`,
      ),
    )
    .groupBy(key)
    .orderBy(desc(sql`sum(${transactions.amountMinor})`), asc(key))
    .limit(BREAKDOWN_LIMIT);
  return rows.map((r) => ({ key: r.key, label: r.label, total: Number(r.total), count: Number(r.count) }));
}

/** Spending per tag in the range (an entry with two tags counts toward both). */
async function tagTotals(ids: string[], from?: string, to?: string) {
  const db = getDb();
  const tagged = db
    .select({
      tagId: sql<string>`unnest(${transactions.tagIds})`.as("tag_id"),
      amount: transactions.amountMinor,
    })
    .from(transactions)
    .where(
      and(
        notTrashed(transactions),
        expensesOf(ids, from, to),
        sql`cardinality(${transactions.tagIds}) > 0`,
      ),
    )
    .as("tagged");
  const rows = await db
    .select({
      tagId: tagged.tagId,
      total: sql<string>`sum(${tagged.amount})::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(tagged)
    .groupBy(tagged.tagId)
    .orderBy(desc(sql`sum(${tagged.amount})`));
  return rows.map((r) => ({ tagId: String(r.tagId), total: Number(r.total), count: Number(r.count) }));
}

/** Spending per profile in the range. */
async function profileTotals(ids: string[], from?: string, to?: string) {
  const rows = await getDb()
    .select({
      profileId: transactions.profileId,
      total: sumText(),
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(and(notTrashed(transactions), expensesOf(ids, from, to)))
    .groupBy(transactions.profileId)
    .orderBy(desc(sql`sum(${transactions.amountMinor})`));
  return rows.map((r) => ({ profileId: r.profileId, total: Number(r.total), count: Number(r.count) }));
}

/** An empty `AdvancedRaw` — someone who can see no profiles here sees no numbers. */
function emptyRaw(categories: AdvancedRaw["categories"]): AdvancedRaw {
  return {
    categories,
    monthly: [],
    paceDaily: [],
    heatDaily: [],
    norms: [],
    candidates: [],
    recurring: [],
    payees: [],
    tags: [],
    profiles: null,
  };
}

/**
 * Everything the "Insights & trends" section shows, for the caller in this
 * workspace. Throws `plan_limit` (403) on a plan without advanced analytics —
 * before any transaction is read.
 *
 * Which filters apply where (each card says so in its caption):
 *  - **profile**: everywhere;
 *  - **date range**: the spending calendar, the weekday pattern, unusual
 *    spending (its last 12 months — `calendarWindow`) and the breakdowns (the
 *    whole range);
 *  - the cards about *now* — insights, pace, category trends,
 *    recurring payments — are anchored to today and ignore the range.
 */
export async function getAdvancedAnalytics(
  userId: string,
  workspaceId: string,
  opts: AdvancedAnalyticsOptions,
  /**
   * What the caller already read in this render — `getWorkspaceEntitlements`
   * for this workspace and `getProfiles(userId, workspaceId)` for this user —
   * so it isn't read again (an RSC render has no request memo). The profiles
   * are the access scope, so pass only that exact list.
   */
  known: { entitlements?: WorkspaceEntitlements; profiles?: ProfileRow[] } = {},
): Promise<AdvancedAnalyticsData> {
  await assertAdvancedAnalytics(workspaceId, known.entitlements);

  const [profiles, categoryRows, tagList] = await Promise.all([
    known.profiles ?? getProfiles(userId, workspaceId),
    getCategories(workspaceId),
    getTags(workspaceId),
  ]);
  const categories = categoryRows.map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
  const visible = profiles.map((p) => p.id);
  const ids = opts.profileId ? visible.filter((id) => id === opts.profileId) : visible;

  const { today, from, to } = opts;
  const window = calendarWindow(today, from, to);
  const ctx = {
    today,
    window,
    firstDay: firstDayOfWeek(opts.locale),
    currency: opts.currency,
    locale: opts.locale,
  };
  if (ids.length === 0) return buildAdvancedAnalytics(emptyRaw(categories), ctx);

  const month = today.slice(0, 7);
  const paceFrom = monthStart(shiftMonth(month, -3));
  const paceTo = monthEnd(month);
  // The calendar usually falls inside the pace window (the default range is
  // this month), and then one daily read serves both.
  const heatInPace = window.from >= paceFrom && window.to <= paceTo;
  const byProfile = !opts.profileId && ids.length > 1;

  const [monthly, paceDaily, heatDaily, norms, candidates, recurring, payeeRows, tagRows, profileRows] =
    await Promise.all([
      monthlyByCategory(ids, today),
      dailyExpenses(ids, paceFrom, paceTo),
      heatInPace ? null : dailyExpenses(ids, window.from, window.to),
      categoryNorms(ids, normsFrom(window.to), window.to),
      anomalyCandidates(ids, window.from, window.to),
      recurringGroups(ids, today),
      payees(ids, from, to),
      tagTotals(ids, from, to),
      byProfile ? profileTotals(ids, from, to) : null,
    ]);

  const tagById = new Map(tagList.map((t) => [t.id, t]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const raw: AdvancedRaw = {
    categories,
    monthly,
    paceDaily,
    heatDaily: heatDaily ?? paceDaily.filter((d) => d.date >= window.from && d.date <= window.to),
    norms,
    candidates,
    recurring,
    payees: payeeRows,
    tags: tagRows
      .filter((r) => tagById.has(r.tagId))
      .slice(0, BREAKDOWN_LIMIT)
      .map((r) => {
        const t = tagById.get(r.tagId)!;
        return { key: t.id, label: t.name, color: t.color, total: r.total, count: r.count };
      }),
    profiles: profileRows
      ? profileRows.map((r) => {
          // Every row is one of `ids`, which came from `profiles`.
          const p = profileById.get(r.profileId)!;
          return { key: r.profileId, label: p.name, icon: p.icon, color: p.color, total: r.total, count: r.count };
        })
      : null,
  };
  return buildAdvancedAnalytics(raw, ctx);
}
