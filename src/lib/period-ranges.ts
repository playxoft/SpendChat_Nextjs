import { monthRange } from "@/lib/dates";

/**
 * Whole months and quarters as `YYYY-MM-DD` ranges, for the date filter's
 * month/quarter picker. String arithmetic like `monthRange`, which this builds
 * on: the filter's dates are calendar days, and going through a `Date` in the
 * runtime's zone is how a range ends up a day off.
 */

export type Period = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** The whole of month `month` (0–11) of `year`. */
export function monthPeriod(year: number, month: number): Period {
  const { start, end } = monthRange(`${year}-${pad(month + 1)}-01`);
  return { from: start, to: end };
}

/** The whole of quarter `quarter` (1–4) of `year`: Q1 is Jan–Mar. */
export function quarterPeriod(year: number, quarter: 1 | 2 | 3 | 4): Period {
  const first = (quarter - 1) * 3;
  return { from: monthPeriod(year, first).from, to: monthPeriod(year, first + 2).to };
}

/** The month a range covers exactly, or null. */
export function matchMonth(from: string, to: string): { year: number; month: number } | null {
  if (!from || !to || from.slice(0, 7) !== to.slice(0, 7)) return null;
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7)) - 1;
  const p = monthPeriod(year, month);
  return p.from === from && p.to === to ? { year, month } : null;
}

/** The quarter a range covers exactly, or null. */
export function matchQuarter(from: string, to: string): { year: number; quarter: 1 | 2 | 3 | 4 } | null {
  if (!from || !to) return null;
  const year = Number(from.slice(0, 4));
  for (const quarter of [1, 2, 3, 4] as const) {
    const p = quarterPeriod(year, quarter);
    if (p.from === from && p.to === to) return { year, quarter };
  }
  return null;
}

/** Whether a period starts after `today` — nothing can be in it yet, since a
 *  transaction's date is never in the future. */
export function startsAfter(period: Period, today: string): boolean {
  return period.from > today;
}
