import { getCurrency } from "@/lib/currencies";
import { formatDateShort } from "@/lib/dates";
import { fromMinorUnits } from "@/lib/money";

/**
 * The maths behind the analytics page's "Insights & trends" (Plus and Pro):
 * the month-end projection, period comparisons, cash flow, category trends,
 * the spending calendar, unusual spends and recurring payments, and the
 * plain-language sentences built from them.
 *
 * Pure and client-safe. The SQL in `insights-queries.ts` only aggregates —
 * totals per month, per day, per category — and everything that needs a
 * judgement ("is this unusual?", "is this monthly?") happens here, where it is
 * unit-tested. The locked preview on Free runs the same functions over sample
 * numbers (`insights-sample.ts`), so the preview can't drift from the real
 * thing.
 *
 * Money is integer minor units throughout. Dates are `YYYY-MM-DD` calendar days
 * (the transaction's own `occurred_on`), months `YYYY-MM`, and "today" is the
 * viewer's local date (`todayISO(getTimeZone())`) — the same rules the rest of
 * the page uses. Date arithmetic is done on UTC midnights so the runtime's zone
 * can never shift a day.
 */

// ── Calendar arithmetic ────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const DAY_MS = 86_400_000;

function utc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `month` moved by `by` months ("2026-01", -1 → "2025-12"). */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Days in a `YYYY-MM` month. */
export function daysIn(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The `n` months ending with `month`, oldest first. */
export function monthsEnding(month: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(month, i - (n - 1)));
}

/** First day of a month. */
export const monthStart = (month: string) => `${month}-01`;
/** Last day of a month. */
export const monthEnd = (month: string) => `${month}-${pad(daysIn(month))}`;

export function addDays(iso: string, n: number): string {
  return isoOf(utc(iso) + n * DAY_MS);
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  return new Date(utc(iso)).getUTCDay();
}

/** The same day next month, clamped to its length (Jan 31 → Feb 28). */
export function nextMonthSameDay(iso: string): string {
  const month = shiftMonth(iso.slice(0, 7), 1);
  const day = Math.min(Number(iso.slice(8, 10)), daysIn(month));
  return `${month}-${pad(day)}`;
}

// ── Small numbers ──────────────────────────────────────────────────────────

/** The middle value (the mean of the middle two for an even count); 0 for none. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** `(current − base) / base`, or null when there is no base to compare with. */
export function pctChange(current: number, base: number | null | undefined): number | null {
  if (base === null || base === undefined || base <= 0) return null;
  return (current - base) / base;
}

/** Share of income kept: `(income − expense) / income`, or null with no income. */
export function savingsRate(income: number, expense: number): number | null {
  return income > 0 ? (income - expense) / income : null;
}

/** "32%" — a change or share as a whole percentage, without its sign. */
export function percentLabel(fraction: number): string {
  return `${Math.round(Math.abs(fraction) * 100)}%`;
}

/** "3.2×" / "12×". */
export function ratioLabel(ratio: number): string {
  return ratio >= 10 ? `${Math.round(ratio)}×` : `${ratio.toFixed(1).replace(/\.0$/, "")}×`;
}

/**
 * An amount rounded to whole units of the currency — "₹12,400", "$318" — for
 * sentences and axis ticks, where cents are noise. Display-only (see the note
 * at the top of `money.ts`): the locale keeps its own numerals.
 */
export function formatRounded(minor: number, currency: string, locale: string): string {
  const c = getCurrency(currency);
  const abs = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: c.code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(fromMinorUnits(Math.abs(minor), currency)));
  return minor < 0 ? `−${abs}` : abs;
}

/** "₹12K" — for a chart axis. */
export function formatCompact(minor: number, currency: string, locale: string): string {
  const c = getCurrency(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: c.code,
    notation: "compact",
    // Explicit, because ICU versions disagree on the default for compact
    // currency: Node 22 prints "$0.0" where newer ones print "$0".
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(fromMinorUnits(minor, currency));
}

// ── Raw inputs (what the SQL returns) ──────────────────────────────────────

/** One month × type × category, from `insights-queries.ts`. */
export type MonthCategoryRow = {
  month: string;
  type: "income" | "expense";
  categoryId: string | null;
  /** The whole month. */
  total: number;
  /** Days 1…today's day of the month — "by this point in the month". */
  toDate: number;
};

/** Expenses on one day. */
export type DailyTotal = { date: string; total: number };

export type CategoryInfo = { id: string; name: string; icon: string | null };

/** A category's typical expense: the median entry over the norms window. */
export type CategoryNorm = { categoryId: string | null; median: number; count: number };

/** One of the largest expenses of its category in the calendar window. */
export type AnomalyCandidate = {
  id: string;
  categoryId: string | null;
  amount: number;
  date: string;
  title: string | null;
};

/**
 * Expenses that look alike — the same title (case, spacing and digits
 * ignored), or with no title the same category and exact amount — over the
 * recurring window, oldest first.
 */
export type RecurringGroup = {
  key: string;
  /** The most common spelling of the title; null for an untitled group. */
  title: string | null;
  categoryId: string | null;
  dates: string[];
  amounts: number[];
};

/** A ranked total: payees, tags or profiles. */
export type BreakdownRow = {
  key: string;
  label: string;
  icon?: string | null;
  color?: string | null;
  total: number;
  count: number;
};

export type AdvancedRaw = {
  categories: CategoryInfo[];
  /** Months `today − 12` … `today`, both types. */
  monthly: MonthCategoryRow[];
  /** Expenses per day, months `today − 3` … `today` (the pace chart). */
  paceDaily: DailyTotal[];
  /** Expenses per day over the calendar window. */
  heatDaily: DailyTotal[];
  norms: CategoryNorm[];
  candidates: AnomalyCandidate[];
  recurring: RecurringGroup[];
  payees: BreakdownRow[];
  tags: BreakdownRow[];
  /** Only with "All profiles" and more than one profile. */
  profiles: BreakdownRow[] | null;
};

// ── Windows ────────────────────────────────────────────────────────────────

/** The calendar never shows more than a year — "All time" shows the last 12 months. */
export const CALENDAR_MAX_MONTHS = 12;
/** Months of history a category's "typical" entry is measured over. */
export const NORMS_MONTHS = 12;
/** Months scanned for recurring payments (plus the current one). */
export const RECURRING_MONTHS = 6;

export type DayWindow = { from: string; to: string; clamped: boolean };

/**
 * The days the range-based widgets cover (the calendar, the weekday pattern,
 * unusual spends): the page's date range, never past today (nothing has
 * happened there yet), and at most the last `CALENDAR_MAX_MONTHS` months of it.
 * `clamped` says the range was longer — "All time" always is.
 */
export function calendarWindow(today: string, from?: string, to?: string): DayWindow {
  const end = to && to < today ? to : today;
  const earliest = monthStart(shiftMonth(end.slice(0, 7), -(CALENDAR_MAX_MONTHS - 1)));
  const clamped = !from || from < earliest;
  const start = clamped ? earliest : (from as string);
  return { from: start > end ? end : start, to: end, clamped };
}

/** Where a category's norms are measured from: the 12 months ending with the window. */
export function normsFrom(windowTo: string): string {
  return monthStart(shiftMonth(windowTo.slice(0, 7), -(NORMS_MONTHS - 1)));
}

// ── Month totals ───────────────────────────────────────────────────────────

type MonthTotal = {
  income: number;
  expense: number;
  incomeToDate: number;
  expenseToDate: number;
};

/** Per-month income and expense, and which months hold anything at all. */
export function monthTotals(rows: MonthCategoryRow[]): Map<string, MonthTotal> {
  const out = new Map<string, MonthTotal>();
  for (const r of rows) {
    const t = out.get(r.month) ?? { income: 0, expense: 0, incomeToDate: 0, expenseToDate: 0 };
    if (r.type === "income") {
      t.income += r.total;
      t.incomeToDate += r.toDate;
    } else {
      t.expense += r.total;
      t.expenseToDate += r.toDate;
    }
    out.set(r.month, t);
  }
  return out;
}

// ── Cash flow ──────────────────────────────────────────────────────────────

export type CashFlowMonth = {
  month: string;
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
};

export type CashFlow = {
  months: CashFlowMonth[];
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
  /** Mean monthly spend over the months that hold any entry. */
  averageExpense: number;
  /** Months with income — how much the savings rate rests on. */
  incomeMonths: number;
};

/** Income, spending and what was kept, for each of `months`. */
export function cashFlow(rows: MonthCategoryRow[], months: string[]): CashFlow {
  const totals = monthTotals(rows);
  const list = months.map((month) => {
    const t = totals.get(month);
    const income = t?.income ?? 0;
    const expense = t?.expense ?? 0;
    return { month, income, expense, net: income - expense, savingsRate: savingsRate(income, expense) };
  });
  const income = list.reduce((s, m) => s + m.income, 0);
  const expense = list.reduce((s, m) => s + m.expense, 0);
  const tracked = list.filter((m) => totals.has(m.month));
  return {
    months: list,
    income,
    expense,
    net: income - expense,
    savingsRate: savingsRate(income, expense),
    averageExpense: Math.round(mean(tracked.map((m) => m.expense))),
    incomeMonths: list.filter((m) => m.income > 0).length,
  };
}

// ── Pace and comparisons ───────────────────────────────────────────────────

export type ProjectionMethod = "history" | "pace" | "early" | "complete";

/**
 * Straight-line pace isn't trusted before this day of the month: with nothing
 * else to go on, a rent paid on the 1st would project ten rents on day 3.
 */
export const PACE_MIN_DAY = 7;

function cumulative(values: number[]): number[] {
  let run = 0;
  return values.map((v) => (run += v));
}

/**
 * What the rest of one earlier month cost, laid over *this* month's `remaining`
 * days and accumulated day by day. Its real days are kept — a one-off stays a
 * one-off — and only their number is matched to this month's days left:
 *
 *  - **Which days are still to come** is read from the nearer end of that
 *    month: a day in its first half counts if it falls after `day` (so rent on
 *    the 1st is never "still to come" on the 3rd), a day in its second half if
 *    it's within `remaining` days of that month's end (so a bill on the last
 *    day of a 28-day February maps to the last day of March).
 *  - **Matching the count**: a longer month gives up its most ordinary days
 *    (those nearest its median), a shorter one is topped up with ordinary days
 *    (its median) — never by scaling the amounts, which would turn one bill
 *    into a daily rate.
 *
 * So a steady 100 a day projects 100 for each day left, and a bill on each
 * month's last day projects exactly that bill, whatever the months' lengths.
 */
function restCurve(daily: number[], day: number, remaining: number): number[] {
  const half = Math.floor(daily.length / 2);
  const early: number[] = [];
  const late: number[] = [];
  daily.forEach((value, i) => {
    const d = i + 1;
    if (d <= half && d > day) early.push(value);
    if (d > half && d > daily.length - remaining) late.push(value);
  });
  let days = [...early, ...late];
  const ordinary = median(days);
  if (days.length > remaining) {
    const drop = new Set(
      days
        .map((value, i) => ({ i, distance: Math.abs(value - ordinary) }))
        .sort((a, b) => a.distance - b.distance || b.i - a.i)
        .slice(0, days.length - remaining)
        .map((x) => x.i),
    );
    days = days.filter((_, i) => !drop.has(i));
  } else if (days.length < remaining) {
    // Topped up where the two halves meet, so both ends keep their dates.
    days = [...early, ...new Array<number>(remaining - days.length).fill(ordinary), ...late];
  }
  return cumulative(days);
}

/**
 * Where this month's spending is heading, day by day from tomorrow to the
 * month's end, as spending *added* to what's gone out so far (`rest[i]` is the
 * extra by the end of day `day + i + 1`).
 *
 * Straight-line pace ("so far ÷ days × days in month") is what people expect,
 * and on its own it is badly wrong at the start of a month: rent paid on the
 * 1st makes day 3 project ten rents. So when there is history, the projection
 * is **what has been spent so far, plus what the rest of a month usually
 * costs** — the mean, over recent months, of their spending still to come
 * at this point, matched to this month's days left (`restCurve`). Rent then
 * counts once, in "so far". With no history, straight-line pace — and not before
 * `PACE_MIN_DAY` ("early": too soon to tell).
 */
export function projectionCurve(input: {
  soFar: number;
  day: number;
  daysInMonth: number;
  /** Each earlier month's spend per day (index 0 = the 1st). */
  history: number[][];
}): { method: ProjectionMethod; rest: number[] } {
  const { soFar, day, daysInMonth, history } = input;
  const remaining = daysInMonth - day;
  if (remaining <= 0) return { method: "complete", rest: [] };
  const curves = history.map((h) => restCurve(h, day, remaining));
  if (curves.length > 0) {
    return {
      method: "history",
      rest: Array.from({ length: remaining }, (_, i) => mean(curves.map((c) => c[i]))),
    };
  }
  if (day < PACE_MIN_DAY) return { method: "early", rest: [] };
  const perDay = soFar / day;
  return { method: "pace", rest: Array.from({ length: remaining }, (_, i) => perDay * (i + 1)) };
}

function monthEndOf(soFar: number, curve: { method: ProjectionMethod; rest: number[] }): number | null {
  if (curve.method === "complete") return soFar;
  if (curve.method === "early") return null;
  return Math.round(soFar + curve.rest[curve.rest.length - 1]);
}

/** The month-end figure: so far plus the projected rest; null while it's too early to tell. */
export function projectMonthEnd(input: Parameters<typeof projectionCurve>[0]): {
  projected: number | null;
  method: ProjectionMethod;
} {
  const curve = projectionCurve(input);
  return { projected: monthEndOf(input.soFar, curve), method: curve.method };
}

export type PacePoint = {
  day: number;
  /** Spent by the end of this day, this month (null after today). */
  thisMonth: number | null;
  /** The projection, from today to the month's end (null before today). */
  projection: number | null;
  /** Spent by the end of this day last month (null past its last day). */
  lastMonth: number | null;
};

export type PaceSummary = {
  month: string;
  day: number;
  daysInMonth: number;
  soFar: number;
  /** Null while it's too early to tell (`method: "early"`). */
  projected: number | null;
  method: ProjectionMethod;
  lastMonth: { total: number; toDate: number } | null;
  /** The mean of up to the 3 previous months that hold any entry. */
  usual: { total: number; toDate: number; months: number } | null;
  lastYear: { total: number; toDate: number } | null;
  points: PacePoint[];
};

function dailyArray(daily: DailyTotal[], month: string): number[] {
  const out = new Array<number>(daysIn(month)).fill(0);
  for (const d of daily) {
    if (d.date.slice(0, 7) !== month) continue;
    out[Number(d.date.slice(8, 10)) - 1] += d.total;
  }
  return out;
}

/** This month so far against last month, the usual month and a year ago. */
export function paceSummary(
  monthly: MonthCategoryRow[],
  paceDaily: DailyTotal[],
  today: string,
): PaceSummary {
  const month = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const length = daysIn(month);
  const totals = monthTotals(monthly);
  const at = (m: string) => {
    const t = totals.get(m);
    return t ? { total: t.expense, toDate: t.expenseToDate } : null;
  };

  const soFar = totals.get(month)?.expenseToDate ?? 0;
  const previous = [1, 2, 3].map((k) => shiftMonth(month, -k)).filter((m) => totals.has(m));
  const usualRows = previous.map((m) => at(m)!);
  const usual = usualRows.length
    ? {
        total: Math.round(mean(usualRows.map((r) => r.total))),
        toDate: Math.round(mean(usualRows.map((r) => r.toDate))),
        months: usualRows.length,
      }
    : null;

  const history = previous.map((m) => dailyArray(paceDaily, m));
  const curve = projectionCurve({ soFar, day, daysInMonth: length, history });
  const { method } = curve;
  const projected = monthEndOf(soFar, curve);
  const drawn = method === "history" || method === "pace";

  const thisCum = cumulative(dailyArray(paceDaily, month));
  const lastMonthKey = shiftMonth(month, -1);
  const lastCum = totals.has(lastMonthKey) ? cumulative(dailyArray(paceDaily, lastMonthKey)) : null;

  const points: PacePoint[] = Array.from({ length }, (_, i) => {
    const d = i + 1;
    let projection: number | null = null;
    // From today's point to the month's end; the last point is `projected`.
    if (drawn && d === day) projection = soFar;
    if (drawn && d > day) projection = Math.round(soFar + curve.rest[d - day - 1]);
    return {
      day: d,
      // Rows dated after today (planned spending) aren't "so far".
      thisMonth: d <= day ? thisCum[i] : null,
      projection,
      lastMonth: lastCum && d <= lastCum.length ? lastCum[d - 1] : null,
    };
  });

  return {
    month,
    day,
    daysInMonth: length,
    soFar,
    projected,
    method,
    lastMonth: at(lastMonthKey),
    usual,
    lastYear: at(shiftMonth(month, -12)),
    points,
  };
}

// ── Category trends ────────────────────────────────────────────────────────

export const TREND_MONTHS = 6;

export type CategoryTrend = {
  categoryId: string | null;
  name: string;
  icon: string | null;
  /** Spend per month, oldest first; the last is this month so far. */
  series: number[];
  soFar: number;
  /** Mean spend by this point of the month over up to 3 previous months. */
  usualToDate: number | null;
  /** `soFar` against `usualToDate`. */
  change: number | null;
};

export const UNCATEGORIZED = "Uncategorized";

function categoryLookup(categories: CategoryInfo[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (id: string | null) => {
    const c = id ? byId.get(id) : undefined;
    return { name: c?.name ?? UNCATEGORIZED, icon: c?.icon ?? null };
  };
}

/**
 * The biggest expense categories of the last 6 months, each with its monthly
 * series and how this month compares with the usual month *at the same point*
 * — comparing a half-finished month with whole ones would make every category
 * look like it is falling.
 */
export function categoryTrends(
  monthly: MonthCategoryRow[],
  categories: CategoryInfo[],
  today: string,
  limit = 6,
): { months: string[]; rows: CategoryTrend[] } {
  const month = today.slice(0, 7);
  const months = monthsEnding(month, TREND_MONTHS);
  const totals = monthTotals(monthly);
  const previous = [1, 2, 3].map((k) => shiftMonth(month, -k)).filter((m) => totals.has(m));
  const lookup = categoryLookup(categories);

  const byCategory = new Map<string, Map<string, MonthCategoryRow>>();
  for (const r of monthly) {
    if (r.type !== "expense") continue;
    const key = r.categoryId ?? "";
    const m = byCategory.get(key) ?? new Map<string, MonthCategoryRow>();
    m.set(r.month, r);
    byCategory.set(key, m);
  }

  const rows: { row: CategoryTrend; weight: number }[] = [];
  for (const [key, perMonth] of byCategory) {
    const series = months.map((m) =>
      m === month ? (perMonth.get(m)?.toDate ?? 0) : (perMonth.get(m)?.total ?? 0),
    );
    const weight = series.reduce((a, b) => a + b, 0);
    if (weight <= 0) continue;
    const soFar = perMonth.get(month)?.toDate ?? 0;
    const usualToDate = previous.length
      ? Math.round(mean(previous.map((m) => perMonth.get(m)?.toDate ?? 0)))
      : null;
    const categoryId = key || null;
    rows.push({
      row: {
        categoryId,
        ...lookup(categoryId),
        series,
        soFar,
        usualToDate,
        change: pctChange(soFar, usualToDate),
      },
      weight,
    });
  }
  rows.sort((a, b) => b.weight - a.weight || a.row.name.localeCompare(b.row.name));
  return { months, rows: rows.slice(0, limit).map((r) => r.row) };
}

// ── Unusual spending ───────────────────────────────────────────────────────

export type Anomaly = {
  id: string;
  categoryId: string | null;
  name: string;
  icon: string | null;
  title: string | null;
  date: string;
  amount: number;
  /** The category's median entry. */
  typical: number;
  ratio: number;
};

/**
 * Entries far above their category's norm. The norm is the category's
 * **median** entry over the last year (one huge purchase can't drag it up the
 * way it would a mean), and an entry is unusual when it is at least `minRatio`
 * times that, the category has at least `minCount` entries to judge by, and
 * the entry is big enough to matter (`minAmount` — a coffee at three times the
 * usual coffee isn't news).
 */
export function findAnomalies(
  candidates: AnomalyCandidate[],
  norms: CategoryNorm[],
  categories: CategoryInfo[],
  opts: { minRatio?: number; minCount?: number; minAmount?: number; limit?: number } = {},
): Anomaly[] {
  const { minRatio = 3, minCount = 5, minAmount = 0, limit = 5 } = opts;
  const normOf = new Map(norms.map((n) => [n.categoryId ?? "", n]));
  const lookup = categoryLookup(categories);
  const out: Anomaly[] = [];
  for (const c of candidates) {
    const norm = normOf.get(c.categoryId ?? "");
    if (!norm || norm.count < minCount || norm.median <= 0) continue;
    const ratio = c.amount / norm.median;
    if (ratio < minRatio || c.amount < minAmount) continue;
    out.push({
      id: c.id,
      categoryId: c.categoryId,
      ...lookup(c.categoryId),
      title: c.title,
      date: c.date,
      amount: c.amount,
      typical: Math.round(norm.median),
      ratio,
    });
  }
  out.sort((a, b) => b.ratio - a.ratio || b.amount - a.amount || a.id.localeCompare(b.id));
  return out.slice(0, limit);
}

// ── Recurring payments ─────────────────────────────────────────────────────

/**
 * English month names and their short forms ("sep", "sept", "september"), as
 * one alternation. A recurring payment's title often carries its month ("Rent
 * Sep 2026"); `insights-queries.ts` strips these (with the digits) from the
 * grouping key in SQL, and `recurringLabel` from the label shown.
 */
export const MONTH_NAMES_PATTERN =
  "jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?";

/** Separators a title's month or date hangs off ("Rent - Sep", "Gym (Oct)"). */
export const TITLE_SEPARATORS_PATTERN = "[-–—/:,.()#]+";

const MONTH_WORD = new RegExp(`\\b(${MONTH_NAMES_PATTERN})\\b`, "gi");
const SEPARATORS = new RegExp(TITLE_SEPARATORS_PATTERN, "g");

/** A title without its digits, month names and separators: "Rent - Sep 2026" → "Rent". */
export function recurringLabel(title: string): string {
  return title
    .replace(/[0-9]+/g, " ")
    .replace(MONTH_WORD, " ")
    .replace(SEPARATORS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type RecurringPayment = {
  key: string;
  label: string;
  categoryId: string | null;
  categoryName: string;
  icon: string | null;
  /** The median amount. */
  typical: number;
  occurrences: number;
  lastDate: string;
  /** The same day next month (clamped), when it should come round again. */
  nextDate: string;
};

/**
 * Payments that come round every month: at least `minMonths` occurrences in
 * different months, about a month apart (most gaps 20–40 days, the median
 * 26–35), at about the same amount from one time to the next (three in four
 * within `tolerance` of the one before — so a price rise is one step, not a
 * disqualification), and still going (the last one within `activeDays`).
 * Weekly groceries fail the gap test; a one-off that happened twice fails the
 * count. The amount shown is the median of the last three, so it follows a
 * price rise.
 */
export function detectRecurring(
  groups: RecurringGroup[],
  categories: CategoryInfo[],
  today: string,
  opts: { minMonths?: number; tolerance?: number; activeDays?: number; limit?: number } = {},
): RecurringPayment[] {
  const { minMonths = 3, tolerance = 0.2, activeDays = 45, limit = 8 } = opts;
  const lookup = categoryLookup(categories);
  const out: RecurringPayment[] = [];
  for (const g of groups) {
    const entries = g.dates
      .map((date, i) => ({ date, amount: g.amounts[i] }))
      .filter((e) => e.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const months = new Set(entries.map((e) => e.date.slice(0, 7))).size;
    if (months < minMonths || entries.length > months + 1) continue;

    const gaps = entries.slice(1).map((e, i) => daysBetween(entries[i].date, e.date));
    const monthlyGaps = gaps.filter((d) => d >= 20 && d <= 40).length;
    const gap = median(gaps);
    if (gap < 26 || gap > 35 || monthlyGaps < gaps.length * 0.75) continue;

    const typical = median(entries.slice(-3).map((e) => e.amount));
    if (typical <= 0) continue;
    const steady = entries
      .slice(1)
      .filter((e, i) => Math.abs(e.amount - entries[i].amount) <= entries[i].amount * tolerance).length;
    if (steady < gaps.length * 0.75) continue;

    const last = entries[entries.length - 1];
    if (daysBetween(last.date, today) > activeDays) continue;

    const category = lookup(g.categoryId);
    out.push({
      key: g.key,
      label: recurringLabel(g.title ?? "") || category.name,
      categoryId: g.categoryId,
      categoryName: category.name,
      icon: category.icon,
      typical: Math.round(typical),
      occurrences: entries.length,
      lastDate: last.date,
      nextDate: nextMonthSameDay(last.date),
    });
  }
  out.sort((a, b) => b.typical - a.typical || a.label.localeCompare(b.label));
  return out.slice(0, limit);
}

// ── Calendar and weekdays ──────────────────────────────────────────────────

export type WeekdayStat = { weekday: number; total: number; days: number; average: number };

/** Spending per weekday over `from…to`: the total and the mean per such day. */
export function weekdayPattern(daily: DailyTotal[], from: string, to: string): WeekdayStat[] {
  const stats = Array.from({ length: 7 }, (_, weekday) => ({ weekday, total: 0, days: 0, average: 0 }));
  const span = daysBetween(from, to);
  for (let i = 0; i <= span; i++) stats[weekdayOf(addDays(from, i))].days++;
  for (const d of daily) {
    if (d.date < from || d.date > to) continue;
    stats[weekdayOf(d.date)].total += d.total;
  }
  for (const s of stats) s.average = s.days ? Math.round(s.total / s.days) : 0;
  return stats;
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** Three cut points — the quartiles of the days with any spending. */
export function heatThresholds(values: number[]): number[] {
  const s = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (s.length === 0) return [];
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
  return [q(0.25), q(0.5), q(0.75)];
}

/** 0 for nothing spent, then 1–4 by quartile. */
export function heatLevel(value: number, thresholds: number[]): HeatLevel {
  if (value <= 0) return 0;
  return (1 + thresholds.filter((t) => value > t).length) as HeatLevel;
}

export type CalendarDay = {
  date: string;
  day: number;
  total: number;
  level: HeatLevel;
  /** Inside the window (not before the range, not after today). */
  inWindow: boolean;
};

export type CalendarMonth = { month: string; weeks: (CalendarDay | null)[][] };

/** Week rows every month calendar has — the most a month can need — so all are the same height. */
export const CALENDAR_WEEKS = 6;

/** How many months a window spans, counting partial ones. */
export function monthCount(window: { from: string; to: string }): number {
  const ym = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7));
  return ym(window.to) - ym(window.from) + 1;
}

/**
 * The window as month calendars — rows are weeks starting on `firstDay`
 * (0 = Sunday, 1 = Monday), always `CALENDAR_WEEKS` of them, with `null`
 * padding before the 1st and after the last day (so every month, and its
 * loading placeholder, is exactly the same size). Days outside the window are
 * kept (a month always shows whole) but marked, and shaded by quartile of the
 * window's own spending days.
 */
export function calendarMonths(
  daily: DailyTotal[],
  window: { from: string; to: string },
  firstDay: 0 | 1,
): { months: CalendarMonth[]; thresholds: number[] } {
  const inWindow = (d: string) => d >= window.from && d <= window.to;
  const byDate = new Map<string, number>();
  for (const d of daily) if (inWindow(d.date)) byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.total);
  const thresholds = heatThresholds([...byDate.values()]);

  const months: CalendarMonth[] = [];
  for (let m = window.from.slice(0, 7); m <= window.to.slice(0, 7); m = shiftMonth(m, 1)) {
    const cells: (CalendarDay | null)[] = [];
    const lead = (weekdayOf(monthStart(m)) - firstDay + 7) % 7;
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let day = 1; day <= daysIn(m); day++) {
      const date = `${m}-${pad(day)}`;
      const total = byDate.get(date) ?? 0;
      cells.push({ date, day, total, level: heatLevel(total, thresholds), inWindow: inWindow(date) });
    }
    while (cells.length < CALENDAR_WEEKS * 7) cells.push(null);
    const weeks: (CalendarDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    months.push({ month: m, weeks });
  }
  return { months, thresholds };
}

/**
 * The first day of the week for a locale — Monday unless the locale says
 * otherwise (`Intl.Locale#getWeekInfo`, or the older `weekInfo` getter).
 */
export function firstDayOfWeek(locale: string): 0 | 1 {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    return info?.firstDay === 7 ? 0 : 1;
  } catch {
    return 1;
  }
}

// ── Plain-language insights ────────────────────────────────────────────────

export type Insight = {
  id: string;
  /** "up": spending more than usual; "down": less, or kept more; "neutral": a fact. */
  tone: "up" | "down" | "neutral";
  text: string;
};

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Within this of the usual reads as "about the same". */
const SAME_BAND = 0.05;
/** A category has to move this much to be worth a sentence… */
const CATEGORY_MOVE = 0.2;
/** …and be at least this share of the usual spending so far. */
const CATEGORY_WEIGHT = 0.05;

export type InsightInput = {
  pace: PaceSummary;
  cashFlow: CashFlow;
  trends: CategoryTrend[];
  anomalies: Anomaly[];
  recurring: RecurringPayment[];
  weekdays: WeekdayStat[];
  /** Days the weekday pattern covers. */
  windowDays: number;
};

/**
 * Up to `limit` short sentences, most useful first: where the month is
 * heading, the category that moved most each way, how much income was kept,
 * the recurring total, the most unusual entry, the priciest weekday. A
 * sentence is only written when there is enough data behind it.
 */
export function buildInsights(
  d: InsightInput,
  fmt: (minor: number) => string,
  locale: string,
  limit = 4,
): Insight[] {
  const out: Insight[] = [];
  const { pace } = d;

  // Where this month is heading.
  if (pace.projected !== null && pace.method !== "complete" && pace.soFar > 0) {
    const base = pace.usual?.total ?? null;
    const change = pctChange(pace.projected, base);
    const heading = `At this pace you'll spend about ${fmt(pace.projected)} this month`;
    if (change === null) {
      out.push({ id: "pace", tone: "neutral", text: `${heading}.` });
    } else if (Math.abs(change) < SAME_BAND) {
      out.push({ id: "pace", tone: "neutral", text: `${heading} — about the same as usual.` });
    } else {
      out.push({
        id: "pace",
        tone: change > 0 ? "up" : "down",
        text: `${heading} — ${percentLabel(change)} ${change > 0 ? "more" : "less"} than usual.`,
      });
    }
  }

  // The categories that moved most, each way.
  const usualSoFar = d.trends.reduce((s, t) => s + (t.usualToDate ?? 0), 0);
  const moved = d.trends.filter(
    (t) =>
      t.change !== null &&
      Math.abs(t.change) >= CATEGORY_MOVE &&
      // A change implies a usual to change from.
      Math.max(t.soFar, t.usualToDate!) >= usualSoFar * CATEGORY_WEIGHT,
  );
  const rise = [...moved].filter((t) => t.change! > 0).sort((a, b) => b.change! - a.change!)[0];
  const fall = [...moved].filter((t) => t.change! < 0).sort((a, b) => a.change! - b.change!)[0];
  if (rise) {
    out.push({
      id: `rise:${rise.name}`,
      tone: "up",
      // Past double, a multiple reads better than "2678% more".
      text:
        rise.change! >= 1
          ? `You've spent about ${ratioLabel(1 + rise.change!)} your usual on ${rise.name} by this point in the month.`
          : `You've spent ${percentLabel(rise.change!)} more on ${rise.name} than usual by this point in the month.`,
    });
  }
  if (fall) {
    out.push({
      id: `fall:${fall.name}`,
      tone: "down",
      text: `${fall.name} is ${percentLabel(fall.change!)} below your usual by this point in the month.`,
    });
  }

  // How much income was kept.
  const cf = d.cashFlow;
  if (cf.incomeMonths >= 3 && cf.savingsRate !== null) {
    out.push(
      cf.savingsRate >= 0
        ? {
            id: "savings",
            tone: "down",
            text: `Over the last 12 months you kept ${percentLabel(cf.savingsRate)} of your income — ${fmt(cf.net)} in all.`,
          }
        : {
            id: "savings",
            tone: "up",
            text: `Over the last 12 months you spent ${fmt(-cf.net)} more than came in.`,
          },
    );
  } else {
    const last = cf.months.at(-2);
    if (last && last.savingsRate !== null) {
      out.push(
        last.savingsRate >= 0
          ? {
              id: "savings",
              tone: "down",
              text: `Last month you kept ${percentLabel(last.savingsRate)} of your income.`,
            }
          : {
              id: "savings",
              tone: "up",
              text: `Last month you spent ${fmt(-last.net)} more than came in.`,
            },
      );
    }
  }

  // Recurring payments.
  if (d.recurring.length === 1) {
    const r = d.recurring[0];
    out.push({
      id: "recurring",
      tone: "neutral",
      text: `${r.label} looks like a monthly payment, about ${fmt(r.typical)} each time.`,
    });
  } else if (d.recurring.length > 1) {
    const total = d.recurring.reduce((s, r) => s + r.typical, 0);
    out.push({
      id: "recurring",
      tone: "neutral",
      text: `${d.recurring.length} payments come round every month — about ${fmt(total)} a month together.`,
    });
  }

  // The most unusual entry.
  const a = d.anomalies[0];
  if (a) {
    out.push({
      id: `anomaly:${a.id}`,
      tone: "up",
      text: `${a.title ? `“${a.title}”` : `An entry in ${a.name}`} on ${formatDateShort(a.date, locale)} was ${fmt(a.amount)} — about ${ratioLabel(a.ratio)} your usual for ${a.name}.`,
    });
  }

  // The priciest weekday.
  if (d.windowDays >= 14) {
    const top = [...d.weekdays].sort((x, y) => y.average - x.average || x.weekday - y.weekday)[0];
    if (top && top.average > 0) {
      out.push({
        id: "weekday",
        tone: "neutral",
        text: `You spend the most on ${WEEKDAY_NAMES[top.weekday]}s — about ${fmt(top.average)} on an average one.`,
      });
    }
  }

  return out.slice(0, limit);
}

// ── Everything, for the page ───────────────────────────────────────────────

export type AdvancedContext = {
  today: string;
  /** From `calendarWindow`. */
  window: DayWindow;
  firstDay: 0 | 1;
  currency: string;
  locale: string;
};

export type AdvancedAnalyticsData = {
  today: string;
  insights: Insight[];
  pace: PaceSummary;
  cashFlow: CashFlow;
  trends: { months: string[]; rows: CategoryTrend[] };
  calendar: {
    window: DayWindow;
    firstDay: 0 | 1;
    months: CalendarMonth[];
    thresholds: number[];
    weekdays: WeekdayStat[];
    total: number;
    activeDays: number;
  };
  anomalies: Anomaly[];
  recurring: { items: RecurringPayment[]; monthly: number };
  breakdown: { payees: BreakdownRow[]; tags: BreakdownRow[]; profiles: BreakdownRow[] | null };
};

/** The share of average monthly spending an entry must reach to count as unusual. */
export const ANOMALY_MIN_SHARE = 0.02;

/** Turn the aggregates into everything the section renders. */
export function buildAdvancedAnalytics(raw: AdvancedRaw, ctx: AdvancedContext): AdvancedAnalyticsData {
  const month = ctx.today.slice(0, 7);
  const flow = cashFlow(raw.monthly, monthsEnding(month, 12));
  const pace = paceSummary(raw.monthly, raw.paceDaily, ctx.today);
  const trends = categoryTrends(raw.monthly, raw.categories, ctx.today);
  const { months, thresholds } = calendarMonths(raw.heatDaily, ctx.window, ctx.firstDay);
  const weekdays = weekdayPattern(raw.heatDaily, ctx.window.from, ctx.window.to);
  const inWindow = raw.heatDaily.filter(
    (d) => d.date >= ctx.window.from && d.date <= ctx.window.to && d.total > 0,
  );
  const anomalies = findAnomalies(raw.candidates, raw.norms, raw.categories, {
    minAmount: Math.round(flow.averageExpense * ANOMALY_MIN_SHARE),
  });
  const recurring = detectRecurring(raw.recurring, raw.categories, ctx.today);
  const fmt = (minor: number) => formatRounded(minor, ctx.currency, ctx.locale);

  return {
    today: ctx.today,
    insights: buildInsights(
      {
        pace,
        cashFlow: flow,
        trends: trends.rows,
        anomalies,
        recurring,
        weekdays,
        windowDays: daysBetween(ctx.window.from, ctx.window.to) + 1,
      },
      fmt,
      ctx.locale,
    ),
    pace,
    cashFlow: flow,
    trends,
    calendar: {
      window: ctx.window,
      firstDay: ctx.firstDay,
      months,
      thresholds,
      weekdays,
      total: inWindow.reduce((s, d) => s + d.total, 0),
      activeDays: inWindow.length,
    },
    anomalies,
    recurring: { items: recurring, monthly: recurring.reduce((s, r) => s + r.typical, 0) },
    breakdown: { payees: raw.payees, tags: raw.tags, profiles: raw.profiles },
  };
}
