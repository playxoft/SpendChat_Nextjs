"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { amountToneClass } from "@/components/app/transaction-bubble";
import { COLUMN_LABELS } from "@/components/app/transaction-columns-store";
import { DemoFrame } from "./demo-frame";
import { DemoDateChip, DemoTypeToggle } from "./demo-controls";
import { DEMO_CURRENCY, DEMO_LOCALE, type DemoTxnType } from "./demo-data";
import { transactionsToReportCsv } from "@/lib/transactions-csv";
import { formatDateShort } from "@/lib/dates";
import { formatMoney, signedMinor } from "@/lib/money";
import { comboFor } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * The row shape `transactionsToReportCsv` serializes, derived from the function
 * itself rather than imported. `TransactionRow` lives in `@/lib/queries`, which
 * reaches the database — a marketing page must never pull that in, and taking
 * the type off the signature keeps the demo honest about the contract without
 * naming the module.
 */
type ReportRow = Parameters<typeof transactionsToReportCsv>[0]["rows"][number];

type Seed = {
  date: string;
  type: DemoTxnType;
  amountMinor: number;
  title: string;
  categoryName: string;
  categoryIcon: string;
};

/**
 * A fortnight of activity, with two rows chosen for what they do to the file
 * rather than for what they say.
 *
 * The restaurant row carries both a comma and a pair of quotes, so the reader
 * can watch RFC 4180 quoting happen to text they can see. The cinema row starts
 * with "+", which Excel and Sheets would read as a formula — the exporter
 * prefixes it with an apostrophe. Neither is a contrived string; both are the
 * kind of thing people actually type into a title field, which is the point.
 */
const SEED: Seed[] = [
  { date: "2026-08-21", type: "expense", amountMinor: 4000, title: "Weekly groceries", categoryName: "Groceries", categoryIcon: "🛒" },
  { date: "2026-08-21", type: "expense", amountMinor: 1250, title: "Lunch with the team", categoryName: "Food & Dining", categoryIcon: "🍽️" },
  { date: "2026-08-20", type: "expense", amountMinor: 8650, title: 'Dinner at "The Laughing Fig", split three ways', categoryName: "Food & Dining", categoryIcon: "🍽️" },
  { date: "2026-08-20", type: "expense", amountMinor: 2400, title: "Bus pass top-up", categoryName: "Transport", categoryIcon: "🚆" },
  { date: "2026-08-18", type: "expense", amountMinor: 6800, title: "Electricity bill", categoryName: "Utilities", categoryIcon: "💡" },
  { date: "2026-08-15", type: "income", amountMinor: 35000, title: "Design side project", categoryName: "Freelance", categoryIcon: "🧾" },
  { date: "2026-08-12", type: "expense", amountMinor: 3299, title: "Pharmacy", categoryName: "Health", categoryIcon: "⚕️" },
  { date: "2026-08-09", type: "expense", amountMinor: 1899, title: "+1 cinema ticket for Sam", categoryName: "Entertainment", categoryIcon: "🎬" },
  { date: "2026-08-05", type: "expense", amountMinor: 120000, title: "Rent", categoryName: "Housing", categoryIcon: "🏠" },
  { date: "2026-08-01", type: "income", amountMinor: 200000, title: "August salary", categoryName: "Salary", categoryIcon: "💼" },
];

const CATEGORIES = ["All categories", ...new Set(SEED.map((s) => s.categoryName))];

/**
 * Fixed strings, never `new Date()`. The demo server-renders so a crawler reads
 * a real CSV rather than an empty box, and a clock read during render differs
 * between the server pass and hydration.
 */
const RANGE = { from: "2026-08-01", to: "2026-08-21" };
const WORKSPACE_NAME = "Alex's Workspace";
const PROFILE_NAME = "Personal";
const FILENAME = `spendchat-${RANGE.to}.csv`;

/** Pad a seed row out to the shape the exporter takes. */
function toReportRow(seed: Seed, i: number): ReportRow {
  return {
    id: `demo-${i}`,
    type: seed.type,
    amountMinor: seed.amountMinor,
    title: seed.title,
    description: null,
    note: seed.title,
    occurredOn: seed.date,
    createdAt: new Date(`${seed.date}T09:00:00.000Z`),
    categoryId: null,
    categoryName: seed.categoryName,
    categoryIcon: seed.categoryIcon,
    profileId: "demo-profile",
    profileName: PROFILE_NAME,
    profileIcon: "👤",
    userId: "demo-user",
    userName: null,
    userEmail: null,
    attachments: [],
  };
}

/**
 * Export, running the app's real serializer.
 *
 * `transactionsToReportCsv` is the exact function behind
 * `/api/transactions/export` — the branded header, the totals block, the column
 * order, the quoting and the CRLF line endings all come from there, not from
 * string concatenation written for this page. It's pure (rows in, string out),
 * so the marketing bundle can call it directly and every filter change
 * regenerates the file for real.
 *
 * That matters because the claim this page makes is "the file is the view".
 * Mocking the output would be asserting that with a fake, and the two awkward
 * rows in the seed — one with a comma and quotes, one starting with a "+" —
 * only prove anything if the escaping is the shipped escaping.
 */
export function ExportDemo() {
  const [type, setType] = useState<DemoTxnType | "all">("all");
  const [category, setCategory] = useState(CATEGORIES[0]);

  const rows = useMemo(
    () =>
      SEED.filter((row) => {
        if (type !== "all" && row.type !== type) return false;
        if (category !== CATEGORIES[0] && row.categoryName !== category) return false;
        return true;
      }),
    [type, category],
  );

  // Newest first, the transactions table's default sort — and the export
  // follows the sort, so the file's row order is the screen's row order.
  const csv = useMemo(
    () =>
      transactionsToReportCsv({
        rows: rows.map(toReportRow),
        currency: DEMO_CURRENCY,
        locale: DEMO_LOCALE,
        workspaceName: WORKSPACE_NAME,
        profileName: PROFILE_NAME,
        from: RANGE.from,
        to: RANGE.to,
      }),
    [rows],
  );

  // The file is CRLF (RFC 4180, and what Excel expects). A lone CR inside a
  // React text node survives into the DOM but not through the HTML parser, so
  // the *displayed* copy is LF-normalized to keep hydration stable; the blob
  // below is the untouched bytes.
  const display = csv.replace(/\r\n/g, "\n");
  const lineCount = csv.split("\r\n").length;

  const net = rows.reduce((sum, r) => sum + signedMinor(r.type, r.amountMinor), 0);

  function downloadCsv() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = FILENAME;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DemoFrame
      label="Interactive export demo"
      active="/app/transactions"
      className="h-[38rem]"
      header={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
          <DemoTypeToggle
            dense
            type={type === "all" ? "expense" : type}
            onChange={(t) => setType(type === t ? "all" : t)}
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 w-auto min-w-40 gap-1" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DemoDateChip label="Aug 1 – 21" className="hidden sm:inline-flex" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadCsv}
            className="ml-auto h-8 shrink-0 gap-1.5"
          >
            <Download className="size-3.5" /> Download CSV
          </Button>
        </div>
      }
      bodyClassName="overflow-hidden"
      footer={
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t bg-muted/20 px-4 py-2.5 text-xs">
          <span className="text-muted-foreground">
            {rows.length} of {SEED.length} rows ·{" "}
            <span className={cn("tabular-nums", net >= 0 && "text-emerald-600 dark:text-emerald-400")}>
              {formatMoney(net, DEMO_CURRENCY, DEMO_LOCALE, { signed: true })}
            </span>{" "}
            net
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Printer className="size-3.5" aria-hidden />
            Print the same view
            <Kbd combo={comboFor("global.print")} className="opacity-70" />
          </span>
          <p className="basis-full text-[11px] text-muted-foreground/80">
            Commas and quotes inside a title are quoted and doubled; a cell
            starting with <code className="rounded bg-muted px-1">=</code>,{" "}
            <code className="rounded bg-muted px-1">+</code>,{" "}
            <code className="rounded bg-muted px-1">-</code> or{" "}
            <code className="rounded bg-muted px-1">@</code> is prefixed with an
            apostrophe so a spreadsheet reads it as text instead of running it.
          </p>
        </div>
      }
    >
      <div className="grid h-full grid-rows-2 divide-y md:grid-cols-2 md:grid-rows-1 md:divide-x md:divide-y-0">
        {/* The view. `min-w-0` on both panes matters: a grid item defaults to
            `min-width: auto`, so one long CSV line would stretch its column and
            squeeze the table instead of scrolling inside its own box. */}
        <div className="min-h-0 min-w-0 overflow-auto">
          <Table className="w-full">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-20">{COLUMN_LABELS.date}</TableHead>
                <TableHead>{COLUMN_LABELS.title}</TableHead>
                <TableHead className="w-28 text-right">{COLUMN_LABELS.amount}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-16 text-center text-muted-foreground">
                    Nothing matches those filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, i) => (
                  <TableRow key={`${row.date}-${i}`}>
                    <TableCell className="whitespace-nowrap align-top text-muted-foreground">
                      {formatDateShort(row.date, DEMO_LOCALE)}
                    </TableCell>
                    <TableCell className="align-top">
                      {/* Wrapping rather than truncating: the whole point of the
                          awkward rows is that you can read them next to the file. */}
                      <span className="block break-words">{row.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        <span aria-hidden>{row.categoryIcon}</span> {row.categoryName}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "align-top text-right tabular-nums",
                        amountToneClass(row.type),
                      )}
                    >
                      {formatMoney(
                        signedMinor(row.type, row.amountMinor),
                        DEMO_CURRENCY,
                        DEMO_LOCALE,
                        { signed: true },
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* The file */}
        <div className="flex min-h-0 min-w-0 flex-col bg-muted/20">
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
            <FileSpreadsheet className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate font-mono">{FILENAME}</span>
            <span className="ml-auto shrink-0 tabular-nums">{lineCount} lines</span>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            <pre className="p-3 font-mono text-[11px] leading-5">{display}</pre>
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}
