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
 * Every Unicode decimal digit, mapped to its ASCII counterpart.
 *
 * Built from `Intl.supportedValuesOf("numberingSystem")` rather than a
 * hand-kept list of code points, so a numbering system ICU knows about is one
 * this parser accepts. ~78 systems x 10 digits, built once, and only when a
 * non-ASCII digit actually turns up.
 */
let digitMap: Map<string, string> | null = null;

function unicodeDigits(): Map<string, string> {
  if (digitMap) return digitMap;
  const map = new Map<string, string>();
  let systems: string[] = [];
  try {
    systems = Intl.supportedValuesOf("numberingSystem");
  } catch {
    // Old runtime without `supportedValuesOf` — ASCII only, as before.
  }
  for (const system of systems) {
    try {
      const format = new Intl.NumberFormat("en", {
        numberingSystem: system,
        useGrouping: false,
      });
      for (let d = 0; d <= 9; d++) {
        const glyph = format.format(d);
        // Must be exactly one code point *and* a Unicode decimal digit.
        //
        // Both halves matter. The code-point test admits the astral digits
        // (`mathbold`'s "𝟒") that a naive `.length === 1` would drop, and
        // matches how the loop below walks the string. The `Nd` test keeps out
        // `hanidec`, whose glyphs are 〇一二三…: those are positional digits in
        // principle, but they are also ordinary CJK words, so accepting them
        // meant `parseAmountInput("一")` returned 1 where it used to return
        // null — and "一" is a character a Chinese or Japanese speaker types in
        // running text. `Nd` is also exactly what `stripNonAmountChars` allows
        // through, so the filter and the parser accept the same set rather than
        // disagreeing about one.
        if ([...glyph].length !== 1 || !/\p{Nd}/u.test(glyph)) continue;
        if (!map.has(glyph)) map.set(glyph, String(d));
      }
    } catch {
      // Unsupported numbering system on this runtime — skip it.
    }
  }
  digitMap = map;
  return map;
}

const nativeCache = new Map<string, Separators | null>();

/**
 * The separators a locale uses when it writes its *own* numerals.
 *
 * Cached like `localeSeparators`, and for a sharper reason: both callers below
 * sit on the typing hot path — `stripNonAmountChars` runs on every keystroke in
 * an amount field, and `parseAmountInput` on every render that reads one — so
 * an uncached `Intl.NumberFormat` here is a formatter constructed per character.
 */
function nativeSeparators(locale: string): Separators | null {
  const cached = nativeCache.get(locale);
  if (cached !== undefined) return cached;

  let separators: Separators | null = null;
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    const group = parts.find((p) => p.type === "group")?.value;
    const decimal = parts.find((p) => p.type === "decimal")?.value;
    if (group && decimal && group !== decimal) separators = { group, decimal };
  } catch {
    // Unknown/malformed locale tag.
  }
  nativeCache.set(locale, separators);
  return separators;
}

const ASCII_AMOUNT = /^[\d\s.,+-]*$/;

/**
 * Rewrite an amount the way the rest of this module expects to read it: ASCII
 * digits, and the locale's Latin-numeral separators.
 *
 * This is the other half of the `latn` pin in `money.ts`. Pinning the formatter
 * fixed what the app *writes* into an amount field; a person typing on their
 * own keyboard writes the other direction. Without this an `ar-EG` user — the
 * exact case that fix exists for — types "٤٠٫٠٠" and every path here rejects
 * it, so the row prefills correctly and still cannot be retyped.
 *
 * Both halves move: the digits (Arabic-Indic "٤" to "4") and the separators
 * (U+066B ARABIC DECIMAL SEPARATOR to the "." that `localeSeparators` reports
 * for the same locale). One pass, so a mapped character is never re-read.
 */
export function normalizeNumerals(
  raw: string,
  locale: string = DEFAULT_LOCALE,
): string {
  // Overwhelmingly the common case, and worth not building the map for.
  if (ASCII_AMOUNT.test(raw)) return raw;

  const digits = unicodeDigits();
  const latn = localeSeparators(locale);
  const native = nativeSeparators(locale);

  let out = "";
  for (const ch of raw) {
    const digit = digits.get(ch);
    if (digit !== undefined) {
      out += digit;
    } else if (native && ch === native.decimal && ch !== latn.decimal) {
      out += latn.decimal;
    } else if (native && ch === native.group && ch !== latn.group) {
      out += latn.group;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Strip everything that can't be part of a typed amount, for the `onChange` of
 * an amount field.
 *
 * Lives here rather than in each input because there are five of them (the
 * composer's two, the edit dialog, the AI review grid, the bulk grid) and they
 * were five copies of `/[^\d.,\s]/g` — an ASCII-only class that silently ate
 * every keystroke from an Arabic, Devanagari or Bengali keyboard. `\p{Nd}`
 * keeps the digit, and `normalizeNumerals` turns it into something
 * `parseAmountInput` can read.
 */
const stripCache = new Map<string, RegExp>();

export function stripNonAmountChars(
  value: string,
  locale: string = DEFAULT_LOCALE,
): string {
  // Compiled once per locale — this runs on every keystroke.
  let disallowed = stripCache.get(locale);
  if (!disallowed) {
    const native = nativeSeparators(locale);
    const extra = native ? native.group + native.decimal : "";
    const escaped = extra.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
    disallowed = new RegExp(`[^\\p{Nd}.,\\s${escaped}]`, "gu");
    stripCache.set(locale, disallowed);
  }
  // `lastIndex` doesn't survive a `g` regex between calls of `replace`, which
  // resets it — but the instance is shared, so this is stated rather than
  // assumed.
  disallowed.lastIndex = 0;
  return value.replace(disallowed, "");
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
  // Normalised first, so a cap meant to stop at 12 digits doesn't let 20
  // through the moment they're typed in Devanagari.
  const normalized = normalizeNumerals(value, locale);
  const decimalAt = normalized.indexOf(decimal);
  const intPart = decimalAt === -1 ? normalized : normalized.slice(0, decimalAt);
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

  // Before the sign, the separators or the digit check — all three are written
  // in ASCII and would reject a perfectly valid amount typed in the locale's
  // own numerals.
  let s = normalizeNumerals(raw, locale).trim();
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
