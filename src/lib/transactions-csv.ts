import { toCsv, rowsToCsv, type Cell } from "@/lib/csv";
import { fromMinorUnits, signedMinor, formatMoney } from "@/lib/money";
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
    ["Total income", formatMoney(incomeMinor, currency, locale)],
    ["Total expense", formatMoney(expenseMinor, currency, locale)],
    ["Net (income − expense)", formatMoney(netMinor, currency, locale)],
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
