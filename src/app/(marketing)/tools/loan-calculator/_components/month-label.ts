import type { MonthIndex } from "@/lib/tools/loan";

/**
 * Month labels for the loan schedule. Kept apart from the chart so the
 * calculator can use them without pulling recharts into the first load.
 */

function dateOf(index: MonthIndex): Date {
  const year = Math.floor(index / 12);
  return new Date(year, index - year * 12, 1);
}

function fallback(index: MonthIndex): string {
  const year = Math.floor(index / 12);
  return `${year}-${String(index - year * 12 + 1).padStart(2, "0")}`;
}

/** "Oct 2026" in the visitor's language. */
export function monthLabel(index: MonthIndex, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(dateOf(index));
  } catch {
    return fallback(index);
  }
}

/** "Oct 26" — for a crowded axis. */
export function shortMonthLabel(index: MonthIndex, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }).format(dateOf(index));
  } catch {
    return fallback(index);
  }
}
