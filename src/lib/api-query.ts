import { getCurrency } from "@/lib/currencies";

/**
 * Parse `?limit=&offset=` for list endpoints. `limit` defaults to 100 and is
 * clamped to [1, 500]; `offset` defaults to 0. Invalid values fall back to the
 * defaults rather than erroring — friendlier for a mobile client.
 */
export function parsePagination(sp: URLSearchParams): { limit: number; offset: number } {
  const rawLimit = Number(sp.get("limit"));
  const rawOffset = Number(sp.get("offset"));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : 100;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

/** `meta.currency` block so clients can format the minor-unit amounts. */
export function currencyMeta(currency: string) {
  const c = getCurrency(currency);
  return { currency: { code: c.code, symbol: c.symbol, decimals: c.decimals } };
}
