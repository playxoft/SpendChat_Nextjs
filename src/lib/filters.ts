import type { TxnFilters } from "./queries";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse transaction filters from a query getter (URLSearchParams or searchParams). */
export function parseTxnFilters(get: (key: string) => string | null): TxnFilters {
  const type = get("type");
  const category = get("category");
  const from = get("from");
  const to = get("to");
  const q = get("q");

  return {
    type: type === "income" || type === "expense" ? type : undefined,
    categoryId: category && category !== "all" ? category : undefined,
    from: from && DATE_RE.test(from) ? from : undefined,
    to: to && DATE_RE.test(to) ? to : undefined,
    search: q?.trim() ? q.trim() : undefined,
  };
}
