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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { amountToneClass } from "@/components/app/transaction-bubble";
import { COLUMN_LABELS } from "@/components/app/transaction-columns-store";
import { DemoFrame } from "./demo-frame";
import { DemoDateChip, DemoTypeFilter, type DemoTypeFilterValue } from "./demo-controls";
import { type DemoTxnType } from "./demo-data";
import { demoAmount, useDemoMoney } from "@/hooks/use-demo-currency";
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

/**
 * The export's date range, written the way the visitor's locale writes it:
 * "Aug 1 – 21" in en-US, "1–21 août" in fr-FR, "1～21日" in ja-JP.
 *
 * The chip used to be the literal string "Aug 1 – 21", sitting directly above a
 * table whose every date cell goes through `formatDateShort(row.date,
 * money.locale)` — so a French visitor read an English range over French rows
 * describing the same fortnight. `formatRange` is what collapses the shared
 * month rather than printing it twice, and it's given the exact options
 * `formatDateShort` uses, so the endpoints match the rows they bracket
 * character for character.
 *
 * UTC, and parsed from the same `YYYY-MM-DDT00:00:00Z` form, because these are
 * date-only values: read in the runtime's own zone, anywhere west of Greenwich
 * would render the previous day.
 */
function formatRangeShort(fromISO: string, toISO: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).formatRange(new Date(`${fromISO}T00:00:00Z`), new Date(`${toISO}T00:00:00Z`));
}

/** Pad a seed row out to the shape the exporter takes. */
function toReportRow(seed: Seed, i: number, amountMinor: number): ReportRow {
  return {
    id: `demo-${i}`,
    type: seed.type,
    amountMinor,
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
  const [type, setType] = useState<DemoTypeFilterValue>("all");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const money = useDemoMoney();

  const rows = useMemo(
    () =>
      SEED.filter((row) => {
        if (type !== "all" && row.type !== type) return false;
        if (category !== CATEGORIES[0] && row.categoryName !== category) return false;
        return true;
      }),
    [type, category],
  );

  // Newest first. That is the transactions table's default *and* the order the
  // export always uses — the route resolves filters but not sort, so the file
  // is newest-first whichever column the table happens to be sorted by.
  const csv = useMemo(
    () =>
      transactionsToReportCsv({
        rows: rows.map((row, i) => toReportRow(row, i, demoAmount(row.amountMinor, money))),
        currency: money.code,
        locale: money.locale,
        workspaceName: WORKSPACE_NAME,
        profileName: PROFILE_NAME,
        from: RANGE.from,
        to: RANGE.to,
      }),
    [rows, money],
  );

  // The file is CRLF (RFC 4180, and what Excel expects). A lone CR inside a
  // React text node survives into the DOM but not through the HTML parser, so
  // the *displayed* copy is LF-normalized to keep hydration stable; the blob
  // below is the untouched bytes.
  const display = csv.replace(/\r\n/g, "\n");
  const lineCount = csv.split("\r\n").length;

  const net = rows.reduce((sum, r) => sum + signedMinor(r.type, demoAmount(r.amountMinor, money)), 0);

  // The anchor is put in the document and the revoke is deferred a task, both
  // for the same reason: a synthetic download isn't finished when `click()`
  // returns. Firefox ignores a click on a detached anchor outright, and it and
  // older Safari start reading the blob asynchronously — revoking in the same
  // tick hands them a URL that no longer resolves, so the file arrives empty or
  // not at all. A macrotask is enough of a gap, and still frees the blob.
  function downloadCsv() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = FILENAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <DemoFrame
      label="Interactive export demo"
      active="/app/transactions"
      className="h-[38rem]"
      header={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
          <DemoTypeFilter value={type} onChange={setType} />
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
          <DemoDateChip label={formatRangeShort(RANGE.from, RANGE.to, money.locale)} />
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
            {/* Zero is neither income nor a sign. Keyed on `net >= 0`, filtering
                down to nothing printed an emerald "+$0.00 net" beside "Nothing
                matches those filters" — money in, from no rows at all. Both the
                emerald accent and the sign are reserved for a net that has one. */}
            <span
              className={cn(
                "tabular-nums",
                net > 0 && "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {formatMoney(net, money.code, money.locale, { signed: net !== 0 })}
            </span>{" "}
            net
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Printer className="size-3.5" aria-hidden />
            Print the same view
            {/* A chip inside a sentence, so it carries `describe`: without it
                the line reads aloud as "Print the same view" and the key it is
                telling you about is dropped. */}
            <Kbd combo={comboFor("global.print")} describe className="opacity-70" />
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
        <div className="scrollbar-slim min-h-0 min-w-0 overflow-auto">
          {/*
            * A raw `<table>`, not the shared `<Table>` — because of the sticky
            * header above it.
            *
            * `<Table>` wraps its table in `<div class="… overflow-x-auto">`, and
            * per css-overflow-3 that div's `overflow-y: visible` computes to
            * `auto`, making it a scroll container and therefore the nearest
            * scrollport for anything sticky inside it. Nothing constrains its
            * height, so its `scrollTop` is pinned at 0 forever: the header held
            * still against a box that never scrolls while the rows scrolled
            * away in the pane outside it — visible at desktop width, where this
            * left pane is exactly the thing that overflows. Directly inside the
            * one element that actually scrolls, `sticky` sticks. Same shape as
            * the two sticky theads that work in this repo
            * (`bulk-add-dialog.tsx`, `attachments/attachment-viewer.tsx`); the wrapper's own
            * classes are covered here already, since this scroller carries
            * `scrollbar-slim` and `overflow-auto` handles both axes.
            */}
          <table className="w-full caption-bottom text-sm">
            {/* The table's accessible name — the only one a screen reader's
                table list would have. */}
            <caption className="sr-only">
              The transactions being exported, as the app lists them — the same
              rows, in the same order, as the file beside this table.
            </caption>
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
                      {formatDateShort(row.date, money.locale)}
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
                        signedMinor(row.type, demoAmount(row.amountMinor, money)),
                        money.code,
                        money.locale,
                        { signed: true },
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </table>
        </div>

        {/* The file */}
        <div className="flex min-h-0 min-w-0 flex-col bg-muted/20">
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
            <FileSpreadsheet className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate font-mono">{FILENAME}</span>
            <span className="ml-auto shrink-0 tabular-nums">{lineCount} lines</span>
          </div>
          <div className="scrollbar-slim min-h-0 min-w-0 flex-1 overflow-auto">
            <pre className="p-3 font-mono text-[11px] leading-5">{display}</pre>
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}
