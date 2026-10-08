import { formatDateLabel, formatDateShort } from "@/lib/dates";
import {
  addDays,
  daysBetween,
  monthCount,
  monthEnd,
  monthStart,
  savingsRate,
  shiftMonth,
  weekdayOf,
} from "@/lib/insights";

/**
 * The analytics page's "Income vs. expenses" trend: money in and out over the
 * range the filters chose, as columns per day, week, month or year. Pure and
 * client-safe; `trend.server.ts` reads the totals and calls `buildTrend`.
 *
 * Money is integer minor units; dates are `YYYY-MM-DD` calendar days, months
 * `YYYY-MM` — the page's own rules.
 */

export type TrendBucket = "day" | "week" | "month" | "year";

/** Day columns up to a month… */
export const TREND_DAY_MAX_DAYS = 31;
/** …weeks up to 14 of them… */
export const TREND_WEEK_MAX_DAYS = 98;
/** …months up to three years, then years. */
export const TREND_MONTH_MAX = 36;
/** Never less than a month: a shorter range across two months widens to this many days. */
export const TREND_MIN_DAYS = 30;

export type TrendSpan = { from: string; to: string };

/**
 * The days the trend covers: the page's range, never less than a month. A
 * range inside one calendar month widens to that whole month (so "Oct 5 – 7"
 * shows October by day); a shorter one across a month boundary widens back to
 * `TREND_MIN_DAYS` ending on its last day.
 */
export function trendSpan(from: string, to: string): TrendSpan {
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return { from: monthStart(to.slice(0, 7)), to: monthEnd(to.slice(0, 7)) };
  }
  if (daysBetween(from, to) + 1 < TREND_MIN_DAYS) return { from: addDays(to, -(TREND_MIN_DAYS - 1)), to };
  return { from, to };
}

/** The column size that keeps a span readable — about 4 to 36 columns. */
export function bucketFor(span: TrendSpan): TrendBucket {
  const days = daysBetween(span.from, span.to) + 1;
  if (days <= TREND_DAY_MAX_DAYS) return "day";
  if (days <= TREND_WEEK_MAX_DAYS) return "week";
  return monthCount(span) <= TREND_MONTH_MAX ? "month" : "year";
}

/** Whether a bucket is built from per-day totals (else per-month). */
export const needsDaily = (bucket: TrendBucket) => bucket === "day" || bucket === "week";

export type TrendPoint = {
  /** The column's first day (day/week), "YYYY-MM" (month) or "YYYY" (year). */
  key: string;
  /** The days it covers, inside the span. */
  from: string;
  to: string;
  income: number;
  expense: number;
  /** Income − expenses: only on plans with cash flow (Plus and Pro). */
  net?: number;
};

export type Trend = {
  span: TrendSpan;
  bucket: TrendBucket;
  /** Weeks start on this day (0 = Sunday, 1 = Monday). */
  firstDay: 0 | 1;
  points: TrendPoint[];
  income: number;
  expense: number;
  /** Plus and Pro: what was kept over the span, and its share of income. */
  kept?: { net: number; savingsRate: number | null };
};

type Totals = { income: number; expense: number };

function sum(rows: Totals[]): Totals {
  return rows.reduce((t, r) => ({ income: t.income + r.income, expense: t.expense + r.expense }), {
    income: 0,
    expense: 0,
  });
}

/** The columns' first days and spans, every one of them — empty ones included. */
function columns(span: TrendSpan, bucket: TrendBucket, firstDay: 0 | 1): Omit<TrendPoint, "income" | "expense">[] {
  const out: Omit<TrendPoint, "income" | "expense">[] = [];
  const clip = (a: string, b: string) => ({ from: a < span.from ? span.from : a, to: b > span.to ? span.to : b });
  if (bucket === "day") {
    for (let d = span.from; d <= span.to; d = addDays(d, 1)) out.push({ key: d, from: d, to: d });
  } else if (bucket === "week") {
    let start = addDays(span.from, -((weekdayOf(span.from) - firstDay + 7) % 7));
    for (; start <= span.to; start = addDays(start, 7)) {
      const c = clip(start, addDays(start, 6));
      out.push({ key: c.from, ...c });
    }
  } else if (bucket === "month") {
    for (let m = span.from.slice(0, 7); m <= span.to.slice(0, 7); m = shiftMonth(m, 1)) {
      out.push({ key: m, ...clip(monthStart(m), monthEnd(m)) });
    }
  } else {
    for (let y = Number(span.from.slice(0, 4)); y <= Number(span.to.slice(0, 4)); y++) {
      out.push({ key: String(y), ...clip(`${y}-01-01`, `${y}-12-31`) });
    }
  }
  return out;
}

/**
 * Every column of the span with its totals. `daily` (keyed "YYYY-MM-DD") feeds
 * day and week columns, `monthly` (keyed "YYYY-MM") month and year columns.
 * `kept` adds what was kept per column and over the span — the cash-flow view
 * of Plus and Pro; without it nothing beyond income and expenses is returned.
 */
export function buildTrend(input: {
  span: TrendSpan;
  firstDay: 0 | 1;
  daily?: ({ date: string } & Totals)[];
  monthly?: ({ month: string } & Totals)[];
  kept?: boolean;
}): Trend {
  const { span, firstDay } = input;
  const bucket = bucketFor(span);
  // Each column takes only the rows inside its own days, so rows outside the
  // span (a month's planned entries, a wider read) never count.
  const daily = input.daily ?? [];
  const monthly = input.monthly ?? [];

  const points: TrendPoint[] = columns(span, bucket, firstDay).map((c) => {
    const t = needsDaily(bucket)
      ? sum(daily.filter((r) => r.date >= c.from && r.date <= c.to))
      : sum(monthly.filter((r) => r.month >= c.from.slice(0, 7) && r.month <= c.to.slice(0, 7)));
    return input.kept ? { ...c, ...t, net: t.income - t.expense } : { ...c, ...t };
  });
  const total = sum(points);
  return {
    span,
    bucket,
    firstDay,
    points,
    ...total,
    ...(input.kept
      ? { kept: { net: total.income - total.expense, savingsRate: savingsRate(total.income, total.expense) } }
      : {}),
  };
}

/** "By day", "By week" … — the caption under the chart. */
export const BUCKET_LABEL: Record<TrendBucket, string> = {
  day: "By day",
  week: "By week",
  month: "By month",
  year: "By year",
};

// ── Labels ─────────────────────────────────────────────────────────────────

const utcDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "Jul 15 – 31, 2026" / "15 – 31 Jul 2026" — a span of days, in the locale's own form. */
function dayRange(from: string, to: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(utcDate(from), utcDate(to));
}

/**
 * A column's name for the tooltip and the table: the day, the week's days, or
 * the month or year — or, when the range clips a month or year, the days it
 * actually covers ("Jul 15 – 31, 2026", not "July 2026").
 */
export function trendColumnName(p: TrendPoint, bucket: TrendBucket, locale: string): string {
  if (bucket === "day") return formatDateLabel(p.from, locale);
  if (bucket === "week") return dayRange(p.from, p.to, locale);
  if (bucket === "month") {
    if (p.from !== monthStart(p.key) || p.to !== monthEnd(p.key)) return dayRange(p.from, p.to, locale);
    return utcDate(p.from).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  }
  if (p.from !== `${p.key}-01-01` || p.to !== `${p.key}-12-31`) return dayRange(p.from, p.to, locale);
  return p.key;
}

/** Day columns get about this many axis labels, whatever the width. */
export const DAY_TICKS_MAX = 7;

/**
 * The day columns' axis labels — every few days so they fit a phone — named
 * with their month at the first label and wherever the month changes
 * ("Sep 28 · 30 · Oct 2 · 4"), plain day numbers otherwise.
 */
export function dayTicks(
  points: TrendPoint[],
  locale: string,
  max = DAY_TICKS_MAX,
): { key: string; label: string }[] {
  const step = Math.max(1, Math.ceil(points.length / max));
  const out: { key: string; label: string }[] = [];
  let month = "";
  for (let i = 0; i < points.length; i += step) {
    const key = points[i].key;
    out.push({
      key,
      label: key.slice(0, 7) === month ? String(Number(key.slice(8, 10))) : formatDateShort(key, locale),
    });
    month = key.slice(0, 7);
  }
  return out;
}
