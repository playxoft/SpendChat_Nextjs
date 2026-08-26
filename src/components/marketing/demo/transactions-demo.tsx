"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { DemoTypeFilter, type DemoTypeFilterValue } from "./demo-controls";
import { type DemoTxnType } from "./demo-data";
import { demoAmount, useDemoMoney } from "@/hooks/use-demo-currency";
import { formatMoney, signedMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

type Row = {
  id: number;
  date: string;
  dateLabel: string;
  type: DemoTxnType;
  amountMinor: number;
  title: string;
  description?: string;
  categoryName: string;
  categoryIcon: string;
};

/** A month of activity — enough rows that filtering and sorting visibly do something. */
const ROWS: Row[] = [
  { id: 1, date: "2026-08-21", dateLabel: "21 Aug", type: "expense", amountMinor: 4000, title: "Weekly groceries", description: "Big shop, includes the month's coffee", categoryName: "Groceries", categoryIcon: "🛒" },
  { id: 2, date: "2026-08-21", dateLabel: "21 Aug", type: "expense", amountMinor: 1250, title: "Lunch with the team", categoryName: "Food & Dining", categoryIcon: "🍽️" },
  { id: 3, date: "2026-08-20", dateLabel: "20 Aug", type: "expense", amountMinor: 2400, title: "Bus pass top-up", categoryName: "Transport", categoryIcon: "🚆" },
  { id: 4, date: "2026-08-18", dateLabel: "18 Aug", type: "expense", amountMinor: 6800, title: "Electricity bill", description: "July usage", categoryName: "Utilities", categoryIcon: "💡" },
  { id: 5, date: "2026-08-15", dateLabel: "15 Aug", type: "income", amountMinor: 35000, title: "Design side project", categoryName: "Freelance", categoryIcon: "🧾" },
  { id: 6, date: "2026-08-12", dateLabel: "12 Aug", type: "expense", amountMinor: 3299, title: "Pharmacy", categoryName: "Health", categoryIcon: "⚕️" },
  { id: 7, date: "2026-08-09", dateLabel: "9 Aug", type: "expense", amountMinor: 1899, title: "Cinema tickets", categoryName: "Entertainment", categoryIcon: "🎬" },
  { id: 8, date: "2026-08-05", dateLabel: "5 Aug", type: "expense", amountMinor: 120000, title: "Rent", categoryName: "Housing", categoryIcon: "🏠" },
  { id: 9, date: "2026-08-01", dateLabel: "1 Aug", type: "income", amountMinor: 200000, title: "August salary", categoryName: "Salary", categoryIcon: "💼" },
];

const CATEGORIES = ["All categories", ...new Set(ROWS.map((r) => r.categoryName))];

type SortKey = "date" | "amount";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return (
      <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
    );
  }
  return dir === "asc" ? (
    <ArrowUp className="size-3.5 shrink-0" />
  ) : (
    <ArrowDown className="size-3.5 shrink-0" />
  );
}

/**
 * The transactions table, filtering and sorting for real.
 *
 * Column labels come from the app's own `COLUMN_LABELS`, and the amount tone
 * from `amountToneClass`, so the two can't drift on the details a reader would
 * actually notice. The table markup itself is the shared `ui/table` primitives
 * rather than the app's `TransactionsTable`, which carries drag-to-reorder
 * columns, resize handles, an edit dialog and a localStorage-backed layout
 * store — none of which a marketing page should be dragging in.
 *
 * Everything here runs on the array above: no query, no account, nothing saved.
 */
export function TransactionsDemo() {
  const [type, setType] = useState<DemoTypeFilterValue>("all");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const money = useDemoMoney();

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = ROWS.filter((row) => {
      if (type !== "all" && row.type !== type) return false;
      if (category !== CATEGORIES[0] && row.categoryName !== category) return false;
      if (!needle) return true;
      // Search covers the note as well as the title, like the app's does.
      return (
        row.title.toLowerCase().includes(needle) ||
        (row.description?.toLowerCase().includes(needle) ?? false)
      );
    });

    return [...filtered].sort((a, b) => {
      const delta =
        sortKey === "amount"
          ? signedMinor(a.type, a.amountMinor) - signedMinor(b.type, b.amountMinor)
          : a.date.localeCompare(b.date);
      return sortDir === "asc" ? delta : -delta;
    });
  }, [type, category, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // Scaled into the visitor's currency before summing, so the footer total and
  // the rows above it can never disagree by a rounding step.
  const total = rows.reduce(
    (sum, r) => sum + signedMinor(r.type, demoAmount(r.amountMinor, money)),
    0,
  );

  return (
    <DemoFrame
      label="Interactive transactions demo"
      active="/app/transactions"
      className="h-[36rem]"
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
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles and notes"
              aria-label="Search transactions"
              className="h-8 w-full pl-8"
            />
          </div>
          <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5">
            <Download className="size-3.5" /> CSV
          </Button>
        </div>
      }
      bodyClassName="overflow-hidden"
      footer={
        <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/20 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">
            {rows.length} of {ROWS.length} transactions
          </span>
          <span className={cn("tabular-nums", total >= 0 && "text-emerald-600 dark:text-emerald-400")}>
            {formatMoney(total, money.code, money.locale, { signed: true })}
          </span>
        </div>
      }
    >
      <div className="scrollbar-slim h-full overflow-auto">
        <Table className="w-full">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-24">
                <button
                  type="button"
                  onClick={() => toggleSort("date")}
                  className="group flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  {COLUMN_LABELS.date}
                  <SortIcon active={sortKey === "date"} dir={sortDir} />
                </button>
              </TableHead>
              <TableHead className="w-40">{COLUMN_LABELS.category}</TableHead>
              <TableHead>{COLUMN_LABELS.title}</TableHead>
              <TableHead className="w-32 text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("amount")}
                  className="group ml-auto flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  {COLUMN_LABELS.amount}
                  <SortIcon active={sortKey === "amount"} dir={sortDir} />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-16 text-center text-muted-foreground">
                  Nothing matches those filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {row.dateLabel}
                  </TableCell>
                  <TableCell>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span aria-hidden className="shrink-0">
                        {row.categoryIcon}
                      </span>
                      <span className="truncate">{row.categoryName}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="block truncate">{row.title}</span>
                    {row.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.description}
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn("text-right tabular-nums", amountToneClass(row.type))}
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
        </Table>
      </div>
    </DemoFrame>
  );
}
