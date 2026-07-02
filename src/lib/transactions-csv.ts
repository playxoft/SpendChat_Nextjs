import { toCsv } from "@/lib/csv";
import { fromMinorUnits, signedMinor } from "@/lib/money";
import { getCurrency } from "@/lib/currencies";
import type { TransactionRow } from "@/lib/queries";

/**
 * Render transactions as CSV (shared by the web `/api/transactions/export`
 * route and the mobile `/api/v1/transactions/export`). Amounts are signed
 * (expenses negative) and formatted to the currency's decimal places.
 */
export function transactionsToCsv(rows: TransactionRow[], currency: string): string {
  const decimals = getCurrency(currency).decimals;
  const header = ["Date", "Type", "Category", "Note", "Amount", "Currency"];
  const data = rows.map((r) => [
    r.occurredOn,
    r.type,
    r.categoryName ?? "Uncategorized",
    r.note ?? "",
    fromMinorUnits(signedMinor(r.type, r.amountMinor), currency).toFixed(decimals),
    currency,
  ]);
  return toCsv(header, data);
}
