/**
 * Combined "quick entry" parser for the transaction composer's single-field mode.
 *
 * The leading number is the amount; everything after it is the title:
 *   "100 fruits"          → { amount: 100,   title: "fruits" }
 *   "12.50 lunch w/ team" → { amount: 12.5,  title: "lunch w/ team" }
 *   "100"                 → { amount: 100,   title: "" }
 *   "fruits"              → { amount: null,  title: "fruits" }  (no leading number)
 *
 * A leading currency symbol/whitespace is tolerated ("$100 fruits"). The amount
 * uses "." as the decimal separator, matching the standalone amount field.
 */
export type QuickEntry = { amount: number | null; title: string };

// Optional leading whitespace, one optional currency-symbol char, then a number,
// then optional whitespace, then the rest as the title. Requiring the number up
// front means a title-first string ("fruits 100") is left un-parsed (amount null).
const QUICK_ENTRY_RE = /^\s*[^\d\s]?\s*(\d+(?:\.\d+)?)\s*(.*)$/;

export function parseQuickEntry(raw: string): QuickEntry {
  const trimmed = raw.trim();
  const match = trimmed.match(QUICK_ENTRY_RE);
  if (!match) return { amount: null, title: trimmed };
  const amount = Number(match[1]);
  return {
    amount: Number.isFinite(amount) ? amount : null,
    title: match[2].trim(),
  };
}
