import type { CpiCountry } from "@/lib/tools/data/cpi";

/**
 * Inflation maths for `/tools/inflation-calculator`, on a consumer price
 * index (`src/lib/tools/data/cpi.ts`).
 *
 * An amount moves between years in proportion to the index:
 *
 *   value = amount × CPI[to] ÷ CPI[from]
 *
 * which works in either direction — 2000 → 2024 inflates, 2024 → 2000
 * deflates. The summary figures (cumulative inflation, average yearly rate,
 * buying power lost) are always measured from the earlier year to the later
 * one, so they read the same whichever way the question was asked.
 *
 * Floats throughout: these are estimates for planning, rounded for display.
 */

/** Countries whose name takes "the" in a sentence. */
const WITH_THE = new Set(["US", "GB", "AE", "NL", "PH"]);

/** A country's name as it reads mid-sentence: "the United States", "India". */
export function countryInSentence(c: Pick<CpiCountry, "country" | "name">): string {
  return `${WITH_THE.has(c.country) ? "the " : ""}${c.name}`;
}

/** The index for a year, or null when the series has no figure for it. */
export function cpiFor(series: Pick<CpiCountry, "values">, year: number): number | null {
  if (!Number.isInteger(year)) return null;
  const v = series.values[year];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** A year pulled into the series' range; a non-number falls back to `fallback` first. */
export function clampYear(
  year: number | null,
  series: Pick<CpiCountry, "firstYear" | "lastYear">,
  fallback: number,
): number {
  const y = year === null || !Number.isFinite(year) ? fallback : Math.round(year);
  return Math.min(series.lastYear, Math.max(series.firstYear, y));
}

/** One year on the way from `fromYear` to `toYear`, in chronological order. */
export type PathPoint = {
  year: number;
  /** The index itself (2010 = 100). */
  index: number;
  /** The amount, in `fromYear` money, expressed in this year's money. */
  value: number;
  /** Price change over the year before, in percent; null for the first year of the series. */
  yearlyPercent: number | null;
};

export type InflationResult = {
  amount: number;
  fromYear: number;
  toYear: number;
  /** The amount in `toYear` money. */
  value: number;
  /** CPI[to] ÷ CPI[from]. */
  ratio: number;
  /** Whole years between the two. */
  years: number;
  earlierYear: number;
  laterYear: number;
  /** Price change from the earlier year to the later one, in percent (negative = prices fell). */
  cumulativePercent: number;
  /** The yearly rate that compounds to the cumulative change; null when both years are the same. */
  averageAnnualPercent: number | null;
  /** Buying power lost from the earlier year to the later one, in percent (negative = gained). */
  purchasingPowerLossPercent: number;
  /** The reverse question: the amount taken as `toYear` money, in `fromYear` money (amount ÷ ratio). */
  reverseValue: number;
  /** Every year from the earlier to the later one, for the chart and table. */
  path: PathPoint[];
};

/**
 * The amount in `fromYear` money, expressed in `toYear` money — or null when
 * a year is missing from the series or the amount isn't a usable number.
 */
export function adjustForInflation({
  amount,
  fromYear,
  toYear,
  series,
}: {
  amount: number;
  fromYear: number;
  toYear: number;
  series: Pick<CpiCountry, "values">;
}): InflationResult | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const from = cpiFor(series, fromYear);
  const to = cpiFor(series, toYear);
  if (from === null || to === null) return null;

  const earlierYear = Math.min(fromYear, toYear);
  const laterYear = Math.max(fromYear, toYear);
  const path: PathPoint[] = [];
  for (let year = earlierYear; year <= laterYear; year++) {
    const index = cpiFor(series, year);
    // A hole inside the range: refuse rather than draw a line across it.
    if (index === null) return null;
    const prev = cpiFor(series, year - 1);
    path.push({
      year,
      index,
      value: (amount * index) / from,
      yearlyPercent: prev === null ? null : (index / prev - 1) * 100,
    });
  }

  const cpiEarlier = fromYear <= toYear ? from : to;
  const cpiLater = fromYear <= toYear ? to : from;
  const growth = cpiLater / cpiEarlier;
  const years = laterYear - earlierYear;

  return {
    amount,
    fromYear,
    toYear,
    value: (amount * to) / from,
    ratio: to / from,
    years,
    earlierYear,
    laterYear,
    cumulativePercent: (growth - 1) * 100,
    averageAnnualPercent: years === 0 ? null : (growth ** (1 / years) - 1) * 100,
    purchasingPowerLossPercent: (1 - 1 / growth) * 100,
    reverseValue: (amount * from) / to,
    path,
  };
}
