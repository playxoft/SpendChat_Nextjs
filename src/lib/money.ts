import { getCurrency } from "./currencies";

/** Convert a major-unit amount (e.g. 12.50) into integer minor units (1250). */
export function toMinorUnits(value: number | string, currencyCode: string): number {
  const c = getCurrency(currencyCode);
  const num =
    typeof value === "string" ? Number(value.replace(/[^0-9.\-]/g, "")) : value;
  if (!Number.isFinite(num)) throw new Error("Invalid amount");
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

/** Plain (unsigned) amount in major units as a string, for inputs/CSV. */
export function minorToInputString(minor: number, currencyCode: string): string {
  const c = getCurrency(currencyCode);
  return fromMinorUnits(Math.abs(minor), currencyCode).toFixed(c.decimals);
}
