import { getCurrency } from "./currencies";
import { parseAmountInput } from "./parse-amount";

/**
 * Minor-unit conversion and money formatting — the only sanctioned way to move
 * between `amount_minor` and anything a person sees or types.
 *
 * **Two kinds of formatter live in this file, and the difference is load-bearing.**
 *
 * - *Display* formatters (`formatMoney`) render an amount only ever read by a
 *   human, so they keep the locale's own numerals: an `ar-EG` balance should
 *   read "٤٠٫٠٠ ج.م.‏", and forcing Latin digits there would be wrong.
 * - *Round-tripping* formatters (`minorToInputString`) produce a string that
 *   goes straight back into an amount input and is re-read by
 *   `parseAmountInput`, which accepts **ASCII 0-9 only**. Those must pin
 *   `numberingSystem: "latn"`, exactly as every formatter in `parse-amount.ts`
 *   does.
 *
 * Getting that backwards doesn't look broken: the field renders a perfectly
 * legible "٤٠٫٠٠" that the app then refuses to save ("That amount isn't
 * clear"), and only for locales nobody on the team is running. It has now
 * happened twice — so if you add a formatter here, decide which of the two it
 * is before you write the options object.
 */

/**
 * Convert a major-unit amount (e.g. 12.50) into integer minor units (1250).
 *
 * A string is parsed against `locale`'s separators, so "1,50" is 1.50 for a
 * comma-decimal user and "1,250.50" is 1250.50 for a dot-decimal one. Anything
 * ambiguous throws rather than being coerced — see `parse-amount.ts`.
 */
export function toMinorUnits(
  value: number | string,
  currencyCode: string,
  locale = "en-US",
): number {
  const c = getCurrency(currencyCode);
  const num = parseAmountInput(value, locale);
  if (num === null) throw new Error("Invalid amount");
  return Math.round(num * 10 ** c.decimals);
}

/** Convert integer minor units back into a major-unit number. */
export function fromMinorUnits(minor: number, currencyCode: string): number {
  const c = getCurrency(currencyCode);
  return minor / 10 ** c.decimals;
}

/**
 * Format minor units as a localized currency string.
 * Pass a negative value (or `signed`) to show the sign.
 *
 * Display-only, so the numbering system is left to the locale — this is the one
 * formatter here whose output is meant to be read rather than re-parsed.
 */
export function formatMoney(
  minor: number,
  currencyCode: string,
  locale = "en-US",
  opts: { signed?: boolean } = {},
): string {
  const c = getCurrency(currencyCode);
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: c.code,
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  }).format(fromMinorUnits(Math.abs(minor), currencyCode));
  if (opts.signed) return `${minor < 0 ? "−" : "+"}${formatted}`;
  return minor < 0 ? `−${formatted}` : formatted;
}

/** Signed minor units for a transaction (expense is negative). */
export function signedMinor(type: "income" | "expense", amountMinor: number): number {
  return type === "expense" ? -Math.abs(amountMinor) : Math.abs(amountMinor);
}

/**
 * Plain (unsigned) amount in major units as a string, for amount inputs.
 *
 * Formatted with the user's decimal separator so it round-trips back through
 * `parseAmountInput` — a de-DE user editing a row must see "40,00", not the
 * "40.00" their locale reads as malformed grouping.
 *
 * Round-tripping, so the digits are pinned to `latn`. `ar-EG`, `bn-IN`,
 * `fa-IR` and friends are real `user_settings.locale` values (set from
 * `Accept-Language` at bootstrap), and without the pin this returns "٤٠٫٠٠" —
 * which `parseAmountInput` rejects, so opening Edit on any row and pressing
 * Save fails until the user retypes the amount in ASCII.
 */
export function minorToInputString(
  minor: number,
  currencyCode: string,
  locale = "en-US",
): string {
  const c = getCurrency(currencyCode);
  const value = fromMinorUnits(Math.abs(minor), currencyCode);
  try {
    return new Intl.NumberFormat(locale, {
      numberingSystem: "latn",
      useGrouping: false,
      minimumFractionDigits: c.decimals,
      maximumFractionDigits: c.decimals,
    }).format(value);
  } catch {
    return value.toFixed(c.decimals);
  }
}
