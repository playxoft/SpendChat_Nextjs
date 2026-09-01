import { toCsv, rowsToCsv, type Cell } from "@/lib/csv";
import { fromMinorUnits, signedMinor } from "@/lib/money";
import { getCurrency } from "@/lib/currencies";
import { formatDateLabel } from "@/lib/dates";
import { siteConfig } from "@/lib/site";
import type { TransactionRow } from "@/lib/queries";

/**
 * Render transactions as plain CSV (used by the mobile `/api/v1/transactions/export`).
 * Amounts are signed (expenses negative) and formatted to the currency's decimals.
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

/**
 * Render transactions as a branded CSV *report* (used by the web
 * `/api/transactions/export`): a titled header with workspace/profile/date
 * range, the data table (dates in the app format), totals, and a footer link.
 */
export function transactionsToReportCsv({
  rows,
  currency,
  locale,
  workspaceName,
  profileName,
  from,
  to,
}: {
  rows: TransactionRow[];
  currency: string;
  locale: string;
  workspaceName: string;
  profileName: string;
  from?: string;
  to?: string;
}): string {
  const decimals = getCurrency(currency).decimals;

  let incomeMinor = 0;
  let expenseMinor = 0;
  for (const r of rows) {
    if (r.type === "income") incomeMinor += r.amountMinor;
    else expenseMinor += r.amountMinor;
  }
  const netMinor = incomeMinor - expenseMinor;

  // Prefer the explicit filter bounds; otherwise span the exported rows.
  const isoDates = rows.map((r) => r.occurredOn).sort();
  const earliest = from ?? isoDates[0];
  const latest = to ?? isoDates[isoDates.length - 1];
  const rangeLabel =
    earliest && latest
      ? `${formatDateLabel(earliest, locale)} to ${formatDateLabel(latest, locale)}`
      : "All transactions";

  // Net of the signed Amount column (income positive, expense negative).
  const netAmount = fromMinorUnits(netMinor, currency).toFixed(decimals);

  const report: Cell[][] = [
    [siteConfig.name],
    ["Transactions report"],
    [],
    ["Workspace", workspaceName],
    ["Profile", profileName],
    ["Date range", rangeLabel],
    [],
    // Totals up top, before the table.
    //
    // Written the same way as the Amount column — a plain number and the
    // currency beside it — rather than through `formatMoney`.
    //
    // `formatMoney` is a *display* formatter, and its output is not a number to
    // a spreadsheet. Its negative sign is U+2212 MINUS SIGN, not ASCII "-", so
    // Excel and Sheets read the Net cell as text: it can't be summed, compared
    // or charted, and no error says why. Under a locale with its own numerals
    // (`ar-EG`, `bn-IN`, `fa-IR` — real `user_settings.locale` values, set from
    // `Accept-Language`) it also emits Arabic-Indic digits and a right-to-left
    // mark straight into the file.
    //
    // This is the same split `src/lib/money.ts` documents between display and
    // round-tripping formatters; a CSV cell is read by a machine, so it takes
    // the round-tripping side.
    ["Total income", fromMinorUnits(incomeMinor, currency).toFixed(decimals), currency],
    ["Total expense", fromMinorUnits(expenseMinor, currency).toFixed(decimals), currency],
    ["Net (income − expense)", fromMinorUnits(netMinor, currency).toFixed(decimals), currency],
    [],
    ["Date", "Type", "Category", "Title", "Amount", "Currency"],
    ...rows.map((r) => [
      formatDateLabel(r.occurredOn, locale),
      r.type === "income" ? "Income" : "Expense",
      r.categoryName ?? "Uncategorized",
      r.title ?? "",
      fromMinorUnits(signedMinor(r.type, r.amountMinor), currency).toFixed(decimals),
      currency,
    ]),
    // Column total under Title/Amount at the foot of the table.
    ["", "", "", "Total:", netAmount, currency],
    [],
    // Footer split across two lines.
    [siteConfig.tagline],
    [`Track your spending at ${siteConfig.domain}`],
  ];

  return rowsToCsv(report);
}
