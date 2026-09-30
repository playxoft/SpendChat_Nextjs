import { getCurrency, isSupportedCurrency } from "@/lib/currencies";
import { CPI_COUNTRIES, findCpiCountry, type CpiCountry } from "@/lib/tools/data/cpi";
import { currencySymbol } from "@/lib/tools/format";

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
const WITH_THE = new Set(["US", "GB", "AE"]);

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

// ---------------------------------------------------------------------------
// Several countries at once
// ---------------------------------------------------------------------------

/** The most countries a comparison holds — every one we have. */
export const MAX_COUNTRIES = CPI_COUNTRIES.length;

/** What the static page (and the first client render) compares, before the visitor's region is known. */
export const SERVER_COUNTRIES = ["US", "GB", "IN"] as const;

/** Always in a fresh comparison, after the visitor's own country. */
const ALWAYS = ["US", "GB"];

/**
 * A country's flag emoji from its ISO code — two regional-indicator symbols,
 * which most systems draw as the flag (Windows shows the two letters).
 */
export function flagEmoji(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/**
 * A currency as "₹ INR" — the locale's symbol, then the code. Where the locale
 * only knows the code ("SAR" in en-US) the app's own symbol stands in, and a
 * currency with no symbol at all is just its code.
 */
export function currencyTag(currency: string, locale = "en-US"): string {
  let symbol = currencySymbol(currency, locale);
  if (symbol === currency && isSupportedCurrency(currency)) symbol = getCurrency(currency).symbol;
  return symbol && symbol !== currency ? `${symbol} ${currency}` : currency;
}

/**
 * The comparison from a link's `c=IN,US,GB`: known countries only, in the
 * order given, each once, at most `MAX_COUNTRIES`. Empty when nothing in it
 * is usable — the caller then falls back to the default selection.
 */
export function parseCountryList(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const c = findCpiCountry(part);
    if (c && !out.includes(c.country)) out.push(c.country);
    if (out.length === MAX_COUNTRIES) break;
  }
  return out;
}

/**
 * A fresh comparison: the visitor's own country when we have it, then the
 * United States and the United Kingdom.
 *
 * `region` is null on the server (and in the render that hydrates it), which
 * gets the fixed `SERVER_COUNTRIES`; "" means the browser gave no region.
 */
export function defaultCountries(region: string | null): string[] {
  if (region === null) return [...SERVER_COUNTRIES];
  const own = findCpiCountry(region)?.country;
  return own ? [own, ...ALWAYS.filter((c) => c !== own)] : [...ALWAYS];
}

/** The oldest year any country has and the newest — the range the year pickers offer. */
export const YEAR_RANGE: Pick<CpiCountry, "firstYear" | "lastYear"> = {
  firstYear: Math.min(...CPI_COUNTRIES.map((c) => c.firstYear)),
  lastYear: Math.max(...CPI_COUNTRIES.map((c) => c.lastYear)),
};

/** The newest year every one of `countries` has published — the default "to" year. */
export function commonLastYear(countries: readonly Pick<CpiCountry, "lastYear">[]): number {
  return countries.length ? Math.min(...countries.map((c) => c.lastYear)) : YEAR_RANGE.lastYear;
}

/**
 * Why a country's series can't answer for these years, in plain words — or
 * null when it covers both.
 */
export function coverageNote(
  series: Pick<CpiCountry, "firstYear" | "lastYear">,
  fromYear: number,
  toYear: number,
): string | null {
  const earlier = Math.min(fromYear, toYear);
  const later = Math.max(fromYear, toYear);
  if (earlier < series.firstYear) return `Data starts in ${series.firstYear}`;
  if (later > series.lastYear) return `Data runs to ${series.lastYear}`;
  return null;
}

/** One country's answer in a comparison: a result, or the note saying why there isn't one. */
export type CountryInflation =
  | { series: CpiCountry; result: InflationResult; note: null }
  | { series: CpiCountry; result: null; note: string };

/**
 * The same amount, read in each country's own currency, moved from
 * `fromYear` to `toYear` with each country's own index — in the order given.
 */
export function compareInflation({
  amount,
  fromYear,
  toYear,
  countries,
}: {
  amount: number;
  fromYear: number;
  toYear: number;
  countries: readonly CpiCountry[];
}): CountryInflation[] {
  return countries.map((series) => {
    const note = coverageNote(series, fromYear, toYear);
    const result = note ? null : adjustForInflation({ amount, fromYear, toYear, series });
    return result
      ? { series, result, note: null }
      : { series, result: null, note: note ?? "No figures for those years" };
  });
}

/** One year of the comparison chart: each country's index, with the from-year at 100. */
export type IndexedYear = { year: number } & Record<string, number>;

/**
 * Every year from the earlier year to the later one, each country's prices
 * rebased so the from-year is 100 — so countries whose indexes sit on
 * different levels start from the same point. Countries without figures for
 * the whole span are left out.
 */
export function indexedPaths(
  countries: readonly CpiCountry[],
  fromYear: number,
  toYear: number,
): { codes: string[]; rows: IndexedYear[] } {
  const earlier = Math.min(fromYear, toYear);
  const later = Math.max(fromYear, toYear);
  const usable = countries.filter((c) => {
    if (cpiFor(c, fromYear) === null) return false;
    for (let y = earlier; y <= later; y++) if (cpiFor(c, y) === null) return false;
    return true;
  });
  const rows: IndexedYear[] = [];
  for (let year = earlier; year <= later; year++) {
    const row = { year } as IndexedYear;
    for (const c of usable) row[c.country] = (cpiFor(c, year)! / cpiFor(c, fromYear)!) * 100;
    rows.push(row);
  }
  return { codes: usable.map((c) => c.country), rows };
}
