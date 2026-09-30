import { getCurrency, isSupportedCurrency } from "@/lib/currencies";
import { formatAmountInput, parseAmountInput } from "@/lib/parse-amount";

/**
 * Parsing and display helpers shared by every `/tools/*` calculator.
 *
 * Calculators work in plain numbers (a projection is an estimate, not a ledger
 * entry), so these take floats and round only for display. Anything that must
 * add up to the cent — an invoice total — should go through `toMinorUnits` in
 * `src/lib/money.ts` instead.
 */

/** Longest input we bother parsing — anything past this is paste noise. */
const MAX_INPUT = 40;

/**
 * A typed field value as a number, or null when it's empty or not a number.
 * Accepts the visitor's own grouping and decimal marks (`1,00,000.50`,
 * `1.000,5`) via the app's locale-aware amount parser.
 *
 * Falls back to `en-US` when the visitor's locale rejects the text. Tool
 * defaults and shared links are written with a `.` decimal ("0.15"), which a
 * comma-decimal locale such as `de-DE` refuses outright — without the fallback
 * every European visitor would open a calculator showing errors. Text the
 * locale *does* accept keeps the locale's reading ("1.500" is 1500 in German).
 */
export function parseNumber(raw: string, locale = "en-US"): number | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_INPUT) return null;
  const n = parseAmountInput(trimmed, locale) ?? (locale === "en-US" ? null : parseAmountInput(trimmed, "en-US"));
  return n === null || !Number.isFinite(n) ? null : n;
}

/** Text that is only a number as typed in some locale: digits, separators, a sign. */
const NUMBER_LIKE = /^[+\-−]?[\d\s.,'’\u00a0\u202f]*\d[\d\s.,'’\u00a0\u202f]*$/;
/** The form numbers travel in, in links and files: plain digits with a "." decimal. */
const CANONICAL = /^-?\d+(\.\d+)?$/;

/**
 * A typed number, written the way it travels between people: "1.500" typed in
 * Germany becomes "1500", so it can't open as 1.5 in the UK. Anything that
 * isn't a plain number (a date, a mode, a label) is returned unchanged.
 */
export function toCanonicalNumber(raw: string, locale: string): string {
  const text = raw.trim();
  if (!NUMBER_LIKE.test(text)) return raw;
  const n = parseAmountInput(text, locale);
  return n === null || !Number.isFinite(n) ? raw : String(n);
}

/** The reverse: a canonical number shown in the reader's own format ("1500,5" in Germany). */
export function fromCanonicalNumber(raw: string, locale: string): string {
  return CANONICAL.test(raw) ? formatAmountInput(Number(raw), locale, 10) : raw;
}

/** Anything that can be part of a written number: any script's digits and the separators. */
const NUMBER_CHAR = /[\p{Nd}.,'’ \u00a0\u202f\u066b\u066c]/u;
/** A digit in any script — Latin, Arabic-Indic (٤), Devanagari (४), Bengali (৪)… */
const DIGIT = /\p{Nd}/u;

/**
 * What a number field accepts as it's typed: digits in any script, the
 * separators numbers are written with around the world ("1,00,000.50",
 * "1.000,5", "1 000", "1'000", "٤٠٫٥"), and a sign. Letters and symbols are
 * dropped on the spot, so a stray "k" or "$" never reaches the parser.
 *
 * Dropping must never turn one number into another, so:
 * - a minus anywhere before the first digit is the sign ("USD -1,200",
 *   "$-5"), and so are accounting brackets ("(1,200)");
 * - a minus between digits is left in ("12-15"), as is a pasted exponent
 *   ("1e6"), for the parser to reject — rather than read as 1215 or 16.
 */
export function sanitizeNumberInput(raw: string): string {
  if (/\p{Nd}\s*[eE][+-]?\p{Nd}/u.test(raw)) return raw.trim();
  const chars = [...raw];
  const first = chars.findIndex((c) => DIGIT.test(c));
  const last = chars.findLastIndex((c) => DIGIT.test(c));
  const lead = first === -1 ? raw : chars.slice(0, first).join("");
  const negative = /[-−]/.test(lead) || (/\(/.test(lead) && first !== -1 && chars.slice(last + 1).includes(")"));
  const kept = chars
    .filter((c, i) => {
      if (NUMBER_CHAR.test(c)) return true;
      // A minus between two digits stays, so "12-15" is an error and not 1215.
      return (c === "-" || c === "−") && i > first && i < last && first !== -1;
    })
    .join("")
    .replace(/^\s+/, "");
  return negative ? `-${kept}` : kept;
}

/** Placeholder for a result that can't be computed yet. */
export const EMPTY = "—";

/** Money for display, in the currency's own decimals unless overridden. */
export function formatCurrency(
  value: number,
  currency: string,
  locale = "en-US",
  opts: { decimals?: number } = {},
): string {
  if (!Number.isFinite(value)) return EMPTY;
  const code = isSupportedCurrency(currency) ? currency : "USD";
  const decimals = opts.decimals ?? getCurrency(code).decimals;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(decimals)}`;
  }
}

/** A plain number with grouping, up to `maxFractionDigits` decimals. */
export function formatNumber(value: number, locale = "en-US", maxFractionDigits = 2): string {
  if (!Number.isFinite(value)) return EMPTY;
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(value);
  } catch {
    return String(value);
  }
}

/** `12.5` → `"12.5%"`. The input is already a percentage, not a ratio. */
export function formatPercent(value: number, locale = "en-US", maxFractionDigits = 2): string {
  if (!Number.isFinite(value)) return EMPTY;
  return `${formatNumber(value, locale, maxFractionDigits)}%`;
}

/** The currency's symbol as the visitor's locale writes it (`₹`, `$`, `CA$`). */
export function currencySymbol(currency: string, locale = "en-US"): string {
  const code = isSupportedCurrency(currency) ? currency : "USD";
  try {
    const part = new Intl.NumberFormat(locale, { style: "currency", currency: code })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? getCurrency(code).symbol;
  } catch {
    return getCurrency(code).symbol;
  }
}
