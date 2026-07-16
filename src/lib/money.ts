import { getCurrency } from "./currencies";
import { parseAmountInput } from "./parse-amount";

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
      useGrouping: false,
      minimumFractionDigits: c.decimals,
      maximumFractionDigits: c.decimals,
    }).format(value);
  } catch {
    return value.toFixed(c.decimals);
  }
}
