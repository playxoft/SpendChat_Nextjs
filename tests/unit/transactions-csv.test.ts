import { describe, it, expect } from "vitest";
import { transactionsToCsv, transactionsToReportCsv } from "@/lib/transactions-csv";
import { siteConfig } from "@/lib/site";
import type { TransactionRow } from "@/lib/queries";

function row(over: Partial<TransactionRow>): TransactionRow {
  return {
    id: "id",
    type: "expense",
    amountMinor: 0,
    title: null,
    description: null,
    note: null,
    occurredOn: "2026-01-15",
    createdAt: new Date("2026-01-15T00:00:00Z"),
    categoryId: null,
    categoryName: null,
    categoryIcon: null,
    profileId: "p1",
    profileName: "Personal",
    profileIcon: null,
    ...over,
  };
}

describe("transactionsToReportCsv", () => {
  const rows: TransactionRow[] = [
    row({ type: "income", amountMinor: 500000, title: "Salary", categoryName: "Work", occurredOn: "2026-02-02" }),
    row({ type: "expense", amountMinor: 120000, title: "Rent", categoryName: "Housing", occurredOn: "2026-01-01" }),
  ];

  const csv = transactionsToReportCsv({
    rows,
    currency: "USD",
    locale: "en-US",
    workspaceName: "Acme Inc.",
    profileName: "Personal",
  });

  it("leads with the brand name", () => {
    expect(csv.split("\r\n")[0]).toBe(siteConfig.name);
  });

  it("titles the workspace, profile and date range", () => {
    expect(csv).toContain("Workspace,Acme Inc.");
    expect(csv).toContain("Profile,Personal");
    // Range spans the rows' earliest→latest, in the app's date format (no ISO).
    // Cells with commas are RFC-4180 quoted.
    expect(csv).toContain(`Date range,"Jan 1, 2026 to Feb 2, 2026"`);
    expect(csv).not.toContain("2026-01-01");
  });

  it("includes totals: income, expense and net", () => {
    expect(csv).toContain(`Total income,"$5,000.00"`);
    expect(csv).toContain(`Total expense,"$1,200.00"`);
    expect(csv).toContain(`Net (income − expense),"$3,800.00"`);
  });

  it("puts the totals above the table", () => {
    const lines = csv.split("\r\n");
    const totalsIdx = lines.indexOf(`Total income,"$5,000.00"`);
    const tableIdx = lines.indexOf("Date,Type,Category,Title,Amount,Currency");
    expect(totalsIdx).toBeGreaterThan(-1);
    expect(tableIdx).toBeGreaterThan(-1);
    expect(totalsIdx).toBeLessThan(tableIdx);
  });

  it("adds a Total: column footer under Title/Amount", () => {
    // Net of the signed Amount column: 5000 − 1200 = 3800.
    expect(csv).toContain(",,,Total:,3800.00,USD");
  });

  it("splits the footer across two lines and links the site", () => {
    const lines = csv.split("\r\n");
    expect(lines).toContain(siteConfig.tagline);
    expect(lines).toContain(`Track your spending at ${siteConfig.domain}`);
    expect(csv.trimEnd().endsWith(siteConfig.domain)).toBe(true);
  });

  it("uses the explicit filter bounds when provided", () => {
    const bounded = transactionsToReportCsv({
      rows,
      currency: "USD",
      locale: "en-US",
      workspaceName: "W",
      profileName: "All profiles",
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(bounded).toContain(`Date range,"Jan 1, 2026 to Dec 31, 2026"`);
  });
});

describe("CSV exports neutralise formula injection (B6)", () => {
  // A shared workspace means the author of a title and the person opening the
  // export are different people — an executing formula is cross-user.
  const hostile: TransactionRow[] = [
    row({
      type: "expense",
      amountMinor: 4000,
      title: "=cmd|'/c calc'!A1",
      categoryName: "@SUM(1,2)",
      note: "=cmd|'/c calc'!A1",
      occurredOn: "2026-01-01",
    }),
  ];

  it("escapes hostile cells in the mobile export", () => {
    const csv = transactionsToCsv(hostile, "USD");
    expect(csv).toContain(`"'=cmd|'/c calc'!A1"`);
    expect(csv).toContain(`"'@SUM(1,2)"`);
    expect(csv).not.toMatch(/(^|,)=cmd/m);
    // The signed amount stays a plain number.
    expect(csv).toContain("-40.00");
    expect(csv).not.toContain(`"'-40.00"`);
  });

  it("escapes hostile cells in the branded report export", () => {
    const csv = transactionsToReportCsv({
      rows: hostile,
      currency: "USD",
      locale: "en-US",
      workspaceName: "=HYPERLINK(\"http://evil\")",
      profileName: "Personal",
    });
    expect(csv).toContain(`"'=cmd|'/c calc'!A1"`);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).not.toMatch(/(^|,)=cmd/m);
    expect(csv).toContain("-40.00");
  });
});

