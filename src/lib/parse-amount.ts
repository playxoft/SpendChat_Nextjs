/**
 * Locale-aware parsing for human-typed money amounts.
 *
 * Every entry path (the composer, quick entry, bulk paste, `toMinorUnits`) goes
 * through `parseAmountInput`, so "1,50" is €1.50 for a comma-decimal user and
 * "1,250.50" is $1,250.50 for a dot-decimal one. Input that can't be read
 * unambiguously under the user's locale is **rejected** (`null`) rather than
 * coerced — a silently mis-scaled amount is the worst failure a money tracker
 * can have, so callers must surface an error instead of guessing.
 */

const DEFAULT_LOCALE = "en-US";

// Space-like characters: several locales group with a (narrow/non-breaking) space.
const SPACE_CLASS = "[ \\t\\u00A0\\u202F\\u2009]";
const SPACE_ONE = new RegExp(SPACE_CLASS);
const SPACE_ALL = new RegExp(SPACE_CLASS, "g");

// Canonical markers, so the grouping/decimal checks don't depend on the locale's
// actual characters (which may themselves be spaces).
const G = "\u0001";
const D = "\u0002";

/**
 * Every `Intl.NumberFormat` here pins the Latin digits. Locales like `ar-EG`,
 * `bn-IN` and `fa-IR` default to their own numeral system, and the parser below
 * only accepts ASCII 0-9 — so without this, a formatted amount ("١٢٣٤") could
 * not be re-read by `parseAmountInput`, and every programmatically-filled amount
 * field (bulk preview, AI review grid) would render permanently invalid. Locale
 * tags come from `Accept-Language` via `resolveSettingsDefaults`, so these are
 * reachable, not hypothetical. Grouping/decimal separators still follow the
 * locale (de-DE stays "1.234,56").
 */
const NUMBERING = "latn";

export type Separators = { group: string; decimal: string };

/** True for the (narrow/non-breaking) spaces some locales group with. */
export function isSpaceSeparator(s: string): boolean {
  return SPACE_ONE.test(s);
}

const separatorCache = new Map<string, Separators>();

/** The grouping/decimal separators a locale formats numbers with. */
export function localeSeparators(locale: string = DEFAULT_LOCALE): Separators {
  const cached = separatorCache.get(locale);
  if (cached) return cached;

  let separators: Separators = { group: ",", decimal: "." };
  try {
    const parts = new Intl.NumberFormat(locale, {
      numberingSystem: NUMBERING,
    }).formatToParts(12345.6);
    const group = parts.find((p) => p.type === "group")?.value;
    const decimal = parts.find((p) => p.type === "decimal")?.value;
    if (group && decimal && group !== decimal) separators = { group, decimal };
  } catch {
    // Unknown/malformed locale tag — fall back to the en-US separators.
  }
  separatorCache.set(locale, separators);
  return separators;
}

/**
 * Count the digits in the whole-number part of a typed amount, locale-aware:
 * everything before the first decimal separator, with grouping ignored. Amount
 * inputs use this to stop typing once the whole-number part hits the digit cap
 * (`AMOUNT_INTEGER_DIGITS_MAX`), before the amount is even parsed.
 */
export function integerDigitCount(
  value: string,
  locale: string = DEFAULT_LOCALE,
): number {
  const { decimal } = localeSeparators(locale);
  const decimalAt = value.indexOf(decimal);
  const intPart = decimalAt === -1 ? value : value.slice(0, decimalAt);
  return (intPart.match(/\d/g) ?? []).length;
}

/**
 * Grouping is valid when the last group is exactly 3 digits and any earlier
 * group is 2–3 digits — which admits both Western ("1,250,000") and Indian
 * ("2,00,000") grouping, and rejects a lone comma-decimal ("1,50") that would
 * otherwise be read as 150.
 */
function hasValidGrouping(intPart: string): boolean {
  const groups = intPart.split(G);
  if (groups.some((g) => g === "")) return false;
  if (!/^\d{1,3}$/.test(groups[0]!)) return false;
  const rest = groups.slice(1);
  return rest.every((g, i) =>
    i === rest.length - 1 ? /^\d{3}$/.test(g) : /^\d{2,3}$/.test(g),
  );
}

/**
 * Parse a user-typed amount into a major-unit number, or `null` when it can't
 * be read unambiguously. A leading/trailing currency symbol or code is
 * tolerated ("$1,250.50", "12 EUR"); everything else must be digits and the
 * locale's own separators.
 */
export function parseAmountInput(
  raw: string | number,
  locale: string = DEFAULT_LOCALE,
): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;

  const { group, decimal } = localeSeparators(locale);
  const groupIsSpace = SPACE_ONE.test(group);

  let s = raw.trim();
  if (!s) return null;

  // Leading sign (only one, only up front).
  let negative = false;
  const sign = s.match(/^([+-])\s*/);
  if (sign) {
    negative = sign[1] === "-";
    s = s.slice(sign[0].length);
  }
  if (/[+-]/.test(s)) return null;

  // Spaces are grouping in space-grouping locales, and noise everywhere else.
  s = s.replace(SPACE_ALL, groupIsSpace ? G : "");
  s = s.split(group).join(G).split(decimal).join(D);

  // Currency symbols/codes sit outside the number; strip them from the edges
  // only, so junk in the middle ("12abc34") still fails the digit check below.
  s = s.replace(/^[\p{Sc}\p{L}]+/u, "").replace(/[\p{Sc}\p{L}]+$/u, "");
  if (!s) return null;

  // After canonicalising, nothing but digits and separators may remain.
  for (const ch of s) {
    if (ch !== G && ch !== D && (ch < "0" || ch > "9")) return null;
  }

  // A group separator after the decimal one means the input contradicts the
  // locale (e.g. a de-DE "1.234,56" typed by an en-US user) — too ambiguous.
  const firstDecimal = s.indexOf(D);
  if (firstDecimal !== -1 && s.indexOf(G, firstDecimal) !== -1) return null;
  if (s.split(D).length > 2) return null; // more than one decimal separator

  const [intPart = "", fracPart = ""] = s.split(D);
  if (intPart.includes(G) && !hasValidGrouping(intPart)) return null;

  const normalized = `${negative ? "-" : ""}${intPart.split(G).join("")}${
    firstDecimal === -1 ? "" : `.${fracPart}`
  }`;
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return null;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Render a number back into a plain (ungrouped) locale-formatted string for an
 * amount input — the inverse of `parseAmountInput` for round-tripping values
 * into editable fields.
 */
export function formatAmountInput(
  value: number,
  locale: string = DEFAULT_LOCALE,
  decimals = 2,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      numberingSystem: NUMBERING,
      useGrouping: false,
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return String(value);
  }
}

/** An empty-amount placeholder in the user's format: "0.00" / "0,00". */
export function amountPlaceholder(
  locale: string = DEFAULT_LOCALE,
  decimals = 2,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      numberingSystem: NUMBERING,
      useGrouping: false,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(0);
  } catch {
    return "0.00";
  }
}
