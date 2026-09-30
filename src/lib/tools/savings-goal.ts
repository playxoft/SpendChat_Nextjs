import { dateSpan, parseDate } from "@/lib/tools/date-math";

/**
 * Savings-goal maths for `/tools/when-can-i-afford-it`: how long until you can
 * buy something at the rate you save, and how much to save to buy it by a
 * date.
 *
 * Savings go in at the end of each month (or week), as a standing order after
 * payday would. Interest is optional — a savings account paying r% a year,
 * compounded monthly — and is a ratio `r / 12` per month inside. These are
 * projections, so they're floats, rounded only for display.
 */

/** Input bounds — wide enough for any real goal, narrow enough to stay finite. */
export const LIMITS = {
  maxAmount: 1e12,
  minRate: 0,
  maxRate: 50,
  /** A hundred years: past this, "never at this pace" is the honest answer. */
  maxMonths: 1200,
} as const;

/** Weeks in a month, on average (52 ÷ 12). */
export const WEEKS_PER_MONTH = 52 / 12;

/** The monthly rate for a yearly rate given as a percentage, compounded monthly. */
export function monthlyRate(ratePercent: number): number {
  return ratePercent / 100 / 12;
}

/** The weekly rate that compounds to the same year as `monthly` does. */
export function weeklyRate(monthly: number): number {
  return (1 + monthly) ** (12 / 52) - 1;
}

/** The balance after `n` periods: `saved` growing at rate `i`, plus `deposit` at the end of each period. */
export function balanceAfter(saved: number, deposit: number, i: number, n: number): number {
  if (i === 0) return saved + deposit * n;
  const g = (1 + i) ** n;
  return saved * g + (deposit * (g - 1)) / i;
}

/**
 * Periods (fractional) until the balance reaches `price`, or null when it
 * never does. Solves `balanceAfter(saved, deposit, i, n) = price` for n:
 * n = ln((price·i + deposit) ÷ (saved·i + deposit)) ÷ ln(1 + i),
 * or (price − saved) ÷ deposit with no interest.
 */
export function periodsToReach(price: number, saved: number, deposit: number, i: number): number | null {
  if (saved >= price) return 0;
  if (i === 0) return deposit > 0 ? (price - saved) / deposit : null;
  if (deposit <= 0 && saved <= 0) return null;
  const n = Math.log((price * i + deposit) / (saved * i + deposit)) / Math.log(1 + i);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type AffordInput = {
  price: number;
  /** Already put aside. */
  saved: number;
  /** Saved at the end of each month. */
  monthly: number;
  /** Yearly interest on savings, as a percentage (0 for none). */
  ratePercent: number;
};

export type AffordResult =
  /** You have enough already. */
  | { status: "now"; surplus: number }
  /** Nothing saved each month and no interest to close the gap. */
  | { status: "never" }
  /** It would take longer than `LIMITS.maxMonths`. */
  | { status: "too-long" }
  | {
      status: "ok";
      /** Whole months of saving until you can buy it. */
      months: number;
      /** The same, before rounding up — what the "sooner" comparison uses. */
      exactMonths: number;
      /** What you'd have after `months` (a little over the price, usually). */
      balance: number;
      /** Already saved plus every monthly deposit. */
      contributed: number;
      interest: number;
    };

/** "When can I buy it?" — the whole months of saving until the balance covers the price. */
export function whenCanIAfford({ price, saved, monthly, ratePercent }: AffordInput): AffordResult {
  if (saved >= price) return { status: "now", surplus: saved - price };
  const i = monthlyRate(ratePercent);
  const exact = periodsToReach(price, saved, monthly, i);
  if (exact === null) return { status: "never" };
  if (exact > LIMITS.maxMonths) return { status: "too-long" };
  // Round up to whole deposits, allowing for float noise on an exact answer
  // (10 months must not become 11 because 9.9999999 × 150 fell short).
  let months = Math.max(1, Math.ceil(exact - 1e-9));
  const tolerance = price * 1e-12;
  if (balanceAfter(saved, monthly, i, months) < price - tolerance) months += 1;
  if (months > LIMITS.maxMonths) return { status: "too-long" };
  const balance = balanceAfter(saved, monthly, i, months);
  const contributed = saved + monthly * months;
  return { status: "ok", months, exactMonths: exact, balance, contributed, interest: balance - contributed };
}

/**
 * A number rounded to one significant figure — 11.5 → 10, 46 → 50, 230 → 200 —
 * for a suggestion that reads as a round amount.
 */
export function roundToOneFigure(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  return Number((Math.round(x / p) * p).toPrecision(12));
}

export type CutSuggestion = {
  /** How much less to spend (and so more to save) each week. */
  weeklyCut: number;
  /** How many weeks sooner that gets you there, rounded. */
  weeksSooner: number;
};

/**
 * "Cut X a week and you'd get there N weeks sooner." X is about a tenth of
 * what you already save each week, rounded to a round figure; the effect is
 * measured on the unrounded timeline, so it's the real time saved rather than
 * a whole month or nothing. Null when there's no weekly saving to take a
 * tenth of, or the effect is under a week.
 *
 * `minCut` is the smallest amount worth suggesting — the currency's minor unit.
 */
export function cutSuggestion(input: AffordInput, minCut = 0.01): CutSuggestion | null {
  const { price, saved, monthly, ratePercent } = input;
  if (monthly <= 0 || saved >= price) return null;
  const i = monthlyRate(ratePercent);
  const before = periodsToReach(price, saved, monthly, i);
  if (before === null || before > LIMITS.maxMonths) return null;
  const weeklyCut = roundToOneFigure((monthly / WEEKS_PER_MONTH) * 0.1);
  if (weeklyCut < minCut) return null;
  const after = periodsToReach(price, saved, monthly + weeklyCut * WEEKS_PER_MONTH, i);
  if (after === null) return null;
  const weeksSooner = Math.round((before - after) * WEEKS_PER_MONTH);
  return weeksSooner >= 1 ? { weeklyCut, weeksSooner } : null;
}

// ---------------------------------------------------------------------------
// "How much do I need to save?"
// ---------------------------------------------------------------------------

export type Periods = {
  /** Calendar days from today to the target date. */
  days: number;
  /** Whole weeks — the weekly deposits that fit before the date. */
  weeks: number;
  /** Whole calendar months — the monthly deposits that fit. */
  months: number;
};

/** The saving periods between `today` and `target` (both `YYYY-MM-DD`), or null unless the target is later. */
export function periodsUntil(today: string, target: string): Periods | null {
  if (!parseDate(today) || !parseDate(target)) return null;
  const span = dateSpan(today, target);
  if (span.days <= 0) return null;
  return { days: span.days, weeks: Math.floor(span.days / 7), months: span.totalMonths };
}

/**
 * The deposit per period that grows `saved` to `target` in `n` periods at rate
 * `i` — the inverse of `balanceAfter`. Zero when `saved` gets there on its own.
 */
export function depositFor(target: number, saved: number, i: number, n: number): number {
  if (n <= 0) throw new RangeError(`n must be positive: ${n}`);
  const gap = i === 0 ? target - saved : target - saved * (1 + i) ** n;
  if (gap <= 0) return 0;
  return i === 0 ? gap / n : (gap * i) / ((1 + i) ** n - 1);
}

export type NeededInput = {
  price: number;
  saved: number;
  ratePercent: number;
  periods: Periods;
};

export type NeededResult =
  | { status: "now"; surplus: number }
  | {
      status: "ok";
      /** Per month, or null when the date is under a month away. */
      monthly: number | null;
      /** Per week, or null when the date is under a week away. */
      weekly: number | null;
      /** What's left to find, divided by the days — a rough "per day" figure, without interest. */
      daily: number;
      /** Price minus what you have now. */
      gap: number;
      /** Interest earned on the monthly plan (or the weekly one, under a month). */
      interest: number;
      /** True when interest on what you have covers the gap — nothing more to save. */
      grows: boolean;
    };

/** "How much do I need to save?" — per month and per week, to have the price by the date. */
export function savingsNeeded({ price, saved, ratePercent, periods }: NeededInput): NeededResult {
  if (saved >= price) return { status: "now", surplus: saved - price };
  const i = monthlyRate(ratePercent);
  const iw = weeklyRate(i);
  const monthly = periods.months > 0 ? depositFor(price, saved, i, periods.months) : null;
  const weekly = periods.weeks > 0 ? depositFor(price, saved, iw, periods.weeks) : null;
  const gap = price - saved;
  let interest = 0;
  if (monthly !== null) {
    interest = balanceAfter(saved, monthly, i, periods.months) - saved - monthly * periods.months;
  } else if (weekly !== null) {
    interest = balanceAfter(saved, weekly, iw, periods.weeks) - saved - weekly * periods.weeks;
  }
  const grows = (monthly ?? weekly) === 0;
  return { status: "ok", monthly, weekly, daily: gap / periods.days, gap, interest, grows };
}

/** `today`'s month moved on `months` months, as `YYYY-MM` — the month a goal is reached. */
export function monthsFrom(today: string, months: number): string | null {
  const p = parseDate(today);
  if (!p || !Number.isInteger(months) || months < 0) return null;
  const index = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(index / 12);
  if (y > 9999) return null;
  return `${String(y).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Whole months as "11 months", "1 year", "2 years, 3 months". */
export function formatMonths(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (years === 0) return part(rest, "month");
  return rest === 0 ? part(years, "year") : `${part(years, "year")}, ${part(rest, "month")}`;
}
