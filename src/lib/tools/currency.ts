import { getCurrency, isSupportedCurrency } from "@/lib/currencies";

/**
 * Currency conversion for `/tools/currency-converter`: reading the two rate
 * feeds, cross rates, rounding, the trip total, and the compact encodings the
 * tool keeps in its shareable link.
 *
 * Every rate list is quoted against one base (US dollars): `rates[X]` is how
 * many X one base unit buys. Converting A → B goes through the base —
 * `rates[B] ÷ rates[A]` — so one downloaded list answers every pair, and one
 * cached copy serves whatever currency the visitor converts from.
 *
 * Pure: the browser-side fetching and caching live next to the tool; this file
 * only turns JSON into numbers and numbers into answers, so all of it is
 * unit-tested with fixture rates.
 */

/** Every list is requested (and cached) against this one base currency. */
export const RATE_BASE = "USD";

/** How long a downloaded list is used before it's fetched again. Feeds update once a day. */
export const RATES_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type RateSource = "frankfurter" | "currency-api";

/** A rate list as read from a feed: units of each currency per one `base`. */
export type RateList = {
  base: string;
  /** The newest publication date among the rates, `YYYY-MM-DD`. */
  date: string;
  /** Currency code → units per one `base`. Includes the base itself at 1. */
  rates: Record<string, number>;
};

/** A rate list plus where and when it was downloaded — what the tool caches. */
export type RateTable = RateList & {
  source: RateSource;
  /** When this device downloaded it, in ms since the epoch. */
  fetchedAt: number;
};

const CODE = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isCode(value: unknown): value is string {
  return typeof value === "string" && CODE.test(value) && isSupportedCurrency(value);
}

/** Accept a rate only for a currency the tools know, and only if it's a positive number. */
function addRate(rates: Record<string, number>, code: unknown, rate: unknown): boolean {
  const upper = typeof code === "string" ? code.toUpperCase() : "";
  if (!isCode(upper) || !isRate(rate)) return false;
  rates[upper] = rate;
  return true;
}

// ---------------------------------------------------------------------------
// Reading the feeds
// ---------------------------------------------------------------------------

/**
 * Frankfurter v2 (`/v2/rates?base=USD`): an array of
 * `{ date, base, quote, rate }`, one row per currency, each dated by the day
 * its central bank last published. Returns null for anything else (an error
 * body, a different base, no usable rates).
 */
export function parseFrankfurterRates(json: unknown, base = RATE_BASE): RateList | null {
  if (!Array.isArray(json)) return null;
  const rates: Record<string, number> = {};
  let date = "";
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (r.base !== base || typeof r.date !== "string" || !ISO_DATE.test(r.date)) continue;
    if (r.quote === base) continue;
    if (addRate(rates, r.quote, r.rate) && r.date > date) date = r.date;
  }
  if (!date) return null;
  rates[base] = 1;
  return { base, date, rates };
}

/**
 * The open `currency-api` dataset (`/v1/currencies/usd.json`):
 * `{ date, usd: { eur: 0.88, … } }` with lower-case codes. Crypto and other
 * codes the tools don't list are dropped.
 */
export function parseCurrencyApiRates(json: unknown, base = RATE_BASE): RateList | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const body = json as Record<string, unknown>;
  const list = body[base.toLowerCase()];
  if (typeof body.date !== "string" || !ISO_DATE.test(body.date)) return null;
  if (!list || typeof list !== "object" || Array.isArray(list)) return null;
  const rates: Record<string, number> = {};
  let count = 0;
  for (const [code, rate] of Object.entries(list as Record<string, unknown>)) {
    if (code.toUpperCase() === base) continue;
    if (addRate(rates, code, rate)) count++;
  }
  if (count === 0) return null;
  rates[base] = 1;
  return { base, date: body.date, rates };
}

/**
 * A table read back from the device's cache — or null if it's missing,
 * corrupted, or from an older shape. Re-validated like a download, since
 * anything in storage may have been edited.
 */
export function restoreRateTable(value: unknown): RateTable | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.source !== "frankfurter" && v.source !== "currency-api") return null;
  if (typeof v.fetchedAt !== "number" || !Number.isFinite(v.fetchedAt)) return null;
  if (typeof v.base !== "string" || !isCode(v.base)) return null;
  if (typeof v.date !== "string" || !ISO_DATE.test(v.date)) return null;
  if (!v.rates || typeof v.rates !== "object") return null;
  const rates: Record<string, number> = {};
  let count = 0;
  for (const [code, rate] of Object.entries(v.rates as Record<string, unknown>)) {
    if (code !== v.base && addRate(rates, code, rate)) count++;
  }
  if (count === 0) return null;
  rates[v.base] = 1;
  return { base: v.base, date: v.date, rates, source: v.source, fetchedAt: v.fetchedAt };
}

/**
 * Whether a table downloaded at `fetchedAt` is still recent enough to use
 * without asking again. A download stamped in the future (the device clock
 * moved back) counts as stale rather than fresh forever.
 */
export function isFresh(fetchedAt: number, now: number, maxAgeMs = RATES_MAX_AGE_MS): boolean {
  const age = now - fetchedAt;
  return age >= 0 && age < maxAgeMs;
}

// ---------------------------------------------------------------------------
// Converting
// ---------------------------------------------------------------------------

/** The rate for `code` in `list`, or null when the list doesn't carry it. */
function rateOf(list: RateList, code: string): number | null {
  if (code === list.base) return 1;
  if (!Object.hasOwn(list.rates, code)) return null;
  const rate = list.rates[code];
  return isRate(rate) ? rate : null;
}

/** Whether the list has a usable rate for `code`. */
export function hasRate(list: RateList, code: string): boolean {
  return rateOf(list, code) !== null;
}

/**
 * How many `to` one `from` buys — through the list's base, so
 * `crossRate(l, "EUR", "INR")` is `rates.INR ÷ rates.EUR`. Null when either
 * currency is missing from the list.
 */
export function crossRate(list: RateList, from: string, to: string): number | null {
  if (from === to) return 1;
  const f = rateOf(list, from);
  const t = rateOf(list, to);
  return f === null || t === null ? null : t / f;
}

/** Decimal places a currency is written with (0 for JPY, 3 for KWD, 2 for most). */
export function currencyDecimals(code: string): number {
  return isSupportedCurrency(code) && CODE.test(code) ? getCurrency(code).decimals : 2;
}

/**
 * Round half away from zero to `decimals` places. The tiny nudge makes values
 * that are a hair under the half in binary (1.005 is 1.00499…) round the way
 * they read. Past the precision a double can hold in minor units the value is
 * returned as it is — there are no cents left to round.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  const scaled = Math.abs(value) * factor;
  if (scaled >= Number.MAX_SAFE_INTEGER) return value;
  const rounded = Math.round(scaled * (1 + Number.EPSILON)) / factor;
  return value < 0 ? -rounded : rounded;
}

/** `value` rounded to the decimals `code` is written with. */
export function roundToCurrency(value: number, code: string): number {
  return roundTo(value, currencyDecimals(code));
}

/**
 * `amount` of `from` in `to`, rounded to `to`'s decimals — or null when the
 * list has no rate for either currency.
 */
export function convert(amount: number, from: string, to: string, list: RateList): number | null {
  const rate = crossRate(list, from, to);
  if (rate === null || !Number.isFinite(amount)) return null;
  return roundToCurrency(amount * rate, to);
}

/**
 * Decimals for showing a unit rate ("1 USD = 95.98 INR") to about six
 * significant figures: fewer for big rates (1 USD = 17,922 IDR), more for
 * small ones (1 INR = 0.010419 USD) so they never round to 0.
 */
export function unitRateDecimals(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 2;
  if (rate >= 1) {
    const integerDigits = Math.floor(Math.log10(rate)) + 1;
    return Math.max(0, Math.min(4, 6 - integerDigits));
  }
  return Math.min(10, Math.ceil(-Math.log10(rate)) + 4);
}

// ---------------------------------------------------------------------------
// Trip mode: a list of expenses in one currency, totalled in another
// ---------------------------------------------------------------------------

export type TripTotals = {
  /** How many `home` one `trip` buys. */
  rate: number;
  /** The expenses added up in the trip currency — exact, in its minor units. */
  totalTrip: number;
  /** That total converted and rounded to the home currency. */
  totalHome: number;
  /**
   * Each expense in the home currency. Rounded so they add up to exactly
   * `totalHome` (largest-remainder), rather than drifting a cent or two off.
   */
  rowsHome: number[];
  /** `totalHome` with `markupPercent` added, or null without a markup. */
  totalWithMarkup: number | null;
};

/**
 * Add up `amounts` (in `trip`) and convert the total into `home`. Null when
 * the list has no rate for either currency. Amounts are expected to be zero or
 * more — the tool rejects negatives before calling this.
 */
export function tripTotals(
  amounts: readonly number[],
  trip: string,
  home: string,
  list: RateList,
  markupPercent = 0,
): TripTotals | null {
  const rate = crossRate(list, trip, home);
  if (rate === null) return null;

  const tripScale = 10 ** currencyDecimals(trip);
  const homeScale = 10 ** currencyDecimals(home);

  // Exact sum in the trip currency's minor units.
  const rowsTripMinor = amounts.map((a) => Math.round(roundTo(a, currencyDecimals(trip)) * tripScale));
  const totalTripMinor = rowsTripMinor.reduce((sum, m) => sum + m, 0);
  const totalTrip = totalTripMinor / tripScale;

  const totalHome = roundToCurrency(totalTrip * rate, home);
  const totalHomeMinor = Math.round(totalHome * homeScale);

  // Each row's exact share in home minor units, floored, then the leftover
  // cents handed to the rows with the biggest remainders.
  const exact = rowsTripMinor.map((m) => (m / tripScale) * rate * homeScale);
  let rowsHome: number[];
  if (Number.isSafeInteger(totalHomeMinor)) {
    const floors = exact.map((e) => Math.floor(e));
    let left = totalHomeMinor - floors.reduce((sum, f) => sum + f, 0);
    left = Math.max(0, Math.min(floors.length, left));
    const order = exact
      .map((e, i) => ({ i, remainder: e - floors[i]! }))
      .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
    for (let k = 0; k < left; k++) floors[order[k]!.i]! += 1;
    rowsHome = floors.map((f) => f / homeScale);
  } else {
    // Too large to count in minor units — round each row on its own.
    rowsHome = exact.map((e) => roundToCurrency(e / homeScale, home));
  }

  const totalWithMarkup =
    markupPercent > 0 ? roundToCurrency(totalTrip * rate * (1 + markupPercent / 100), home) : null;

  return { rate, totalTrip, totalHome, rowsHome, totalWithMarkup };
}

// ---------------------------------------------------------------------------
// Link state: the target list and the expense list, each in one parameter
// ---------------------------------------------------------------------------

/** The currencies most people convert into, after their own. */
export const POPULAR_TARGETS = ["USD", "EUR", "GBP", "INR", "AED", "SGD"] as const;

/** Most "to" currencies shown at once. */
export const MAX_TARGETS = 8;

/** Codes upper-cased, unknown ones dropped, duplicates removed (first wins). */
function uniqueCodes(codes: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    if (isCode(code)) seen.add(code);
  }
  return [...seen];
}

/**
 * The starting "to" list: the visitor's own currency, then the popular ones,
 * without the currency being converted from, at most `MAX_TARGETS`.
 */
export function defaultTargets(visitor: string, from: string): string[] {
  return uniqueCodes([visitor, ...POPULAR_TARGETS])
    .filter((c) => c !== from)
    .slice(0, MAX_TARGETS);
}

/** Written when the visitor removed every currency — an empty value means "the defaults". */
const NO_TARGETS = "-";

export function encodeTargets(codes: readonly string[]): string {
  const list = uniqueCodes(codes).slice(0, MAX_TARGETS);
  return list.length > 0 ? list.join(",") : NO_TARGETS;
}

/**
 * The "to" list from a (possibly hand-edited) link, or null when the link
 * doesn't set one and the defaults apply. Never throws.
 */
export function decodeTargets(param: string): string[] | null {
  const text = param.trim();
  if (!text) return null;
  if (text === NO_TARGETS) return [];
  return uniqueCodes(text.split(",")).slice(0, MAX_TARGETS);
}

/** One expense as typed. The amount stays text, so a half-typed "12," survives the URL. */
export type TripRow = { label: string; amount: string };

/** Most expenses the list holds — and reads back from a link. */
export const MAX_TRIP_ROWS = 20;
export const MAX_LABEL = 40;
const MAX_AMOUNT_TEXT = 16;

const ROW_SEP = "|";
const FIELD_SEP = "~";

/** Separators can't appear in a label, or they'd split it; the rest is kept as typed. */
function cleanLabel(label: string): string {
  return label.replace(/[|~]/g, "").slice(0, MAX_LABEL);
}

function cleanAmount(amount: string): string {
  return amount.replace(/[|~\s]/g, "").slice(0, MAX_AMOUNT_TEXT);
}

/** `Hotel~360|Food~180` — one parameter for the whole list. */
export function encodeTripRows(rows: readonly TripRow[]): string {
  return rows
    .slice(0, MAX_TRIP_ROWS)
    .map((r) => `${cleanLabel(r.label)}${FIELD_SEP}${cleanAmount(r.amount)}`)
    .join(ROW_SEP);
}

/** The expense list back from a link; missing fields become blanks. Never throws. */
export function decodeTripRows(param: string): TripRow[] {
  if (!param) return [];
  return param
    .split(ROW_SEP)
    .slice(0, MAX_TRIP_ROWS)
    .map((chunk) => {
      const [label = "", amount = ""] = chunk.split(FIELD_SEP);
      return { label: cleanLabel(label), amount: cleanAmount(amount) };
    });
}

/**
 * The trip currency to start with: euros, or US dollars for someone whose home
 * currency is already the euro.
 */
export function defaultTripCurrency(home: string): string {
  return home === "EUR" ? "USD" : "EUR";
}

/** A rate list's date for people: "30 Sep 2026" in the reader's order. UTC, so no zone shifts the day. */
export function formatRateDate(iso: string, locale = "en-US"): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (!ISO_DATE.test(iso) || Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
}
