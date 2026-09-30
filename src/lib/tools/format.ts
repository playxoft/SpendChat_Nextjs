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

/**
 * What a number field accepts as it's typed: digits, the separators numbers
 * are written with around the world ("1,00,000.50", "1.000,5", "1 000",
 * "1'000"), and a minus sign at the start. Letters and symbols are dropped on
 * the spot, so a stray "k" or "$" never reaches the parser.
 */
export function sanitizeNumberInput(raw: string): string {
  const trimmedStart = raw.replace(/^\s+/, "");
  const negative = /^[-−]/.test(trimmedStart);
  const kept = raw.replace(/[^\d.,'’ \u00a0\u202f]/g, "");
  return negative ? `-${kept.replace(/^\s+/, "")}` : kept;
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
