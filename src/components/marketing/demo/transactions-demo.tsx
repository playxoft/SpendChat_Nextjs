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
import { formatDateShort } from "@/lib/dates";
import { formatMoney, signedMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

type Row = {
  id: number;
  date: string;
  type: DemoTxnType;
  amountMinor: number;
  title: string;
  description?: string;
  categoryName: string;
  categoryIcon: string;
};

/**
 * A month of activity — enough rows that filtering and sorting visibly do
 * something.
 *
 * The date is the machine value only. The label is formatted at render through
 * `formatDateShort`, so it follows the same locale as the amount beside it — a
 * seeded "21 Aug" would sit in English next to "1 250,00 €" for a French
 * visitor, and would be a second copy of a value the row already carries.
 */
const ROWS: Row[] = [
  { id: 1, date: "2026-08-21", type: "expense", amountMinor: 4000, title: "Weekly groceries", description: "Big shop, includes the month's coffee", categoryName: "Groceries", categoryIcon: "🛒" },
  { id: 2, date: "2026-08-21", type: "expense", amountMinor: 1250, title: "Lunch with the team", categoryName: "Food & Dining", categoryIcon: "🍽️" },
  { id: 3, date: "2026-08-20", type: "expense", amountMinor: 2400, title: "Bus pass top-up", categoryName: "Transport", categoryIcon: "🚆" },
  { id: 4, date: "2026-08-18", type: "expense", amountMinor: 6800, title: "Electricity bill", description: "July usage", categoryName: "Utilities", categoryIcon: "💡" },
  { id: 5, date: "2026-08-15", type: "income", amountMinor: 35000, title: "Design side project", categoryName: "Freelance", categoryIcon: "🧾" },
  { id: 6, date: "2026-08-12", type: "expense", amountMinor: 3299, title: "Pharmacy", categoryName: "Health", categoryIcon: "⚕️" },
  { id: 7, date: "2026-08-09", type: "expense", amountMinor: 1899, title: "Cinema tickets", categoryName: "Entertainment", categoryIcon: "🎬" },
  { id: 8, date: "2026-08-05", type: "expense", amountMinor: 120000, title: "Rent", categoryName: "Housing", categoryIcon: "🏠" },
  { id: 9, date: "2026-08-01", type: "income", amountMinor: 200000, title: "August salary", categoryName: "Salary", categoryIcon: "💼" },
];

const CATEGORIES = ["All categories", ...new Set(ROWS.map((r) => r.categoryName))];

type SortKey = "date" | "amount";
type SortDir = "asc" | "desc";

/**
 * How each sort reads out loud. "Ascending" is the right word for `aria-sort`
 * and the wrong one for a person: ascending *dates* are the oldest first and
 * ascending *amounts* are the smallest, and only the column knows which.
 */
const SORT_STATE: Record<SortKey, Record<SortDir, string>> = {
  date: { asc: "sorted oldest first", desc: "sorted newest first" },
  amount: { asc: "sorted lowest first", desc: "sorted highest first" },
};

/**
 * The focus ring these header buttons wear.
 *
 * They're the only controls in this demo authored outside the shared `Button`,
 * so they're also the only ones that fell through to the user-agent outline —
 * and the base layer repaints that as `outline-ring/50`, which is 1.5:1 on the
 * header in light mode and 1.9:1 in dark, against the 3:1 WCAG 1.4.11 asks of a
 * non-text indicator. Tabbing into the table landed on the two sort headers
 * first and neither of them looked focused. Same shape and colour as the
 * features menu's rows (`features-menu.tsx`): `--muted-foreground` is the same
 * neutral family as `--ring` and clears the bar in both themes at 4.3:1 and
 * 5.8:1.
 */
const SORT_FOCUS_RING =
  "rounded-sm focus-visible:ring-2 focus-visible:ring-muted-foreground focus-visible:outline-none";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return (
      <ChevronsUpDown
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100"
      />
    );
  }
  return dir === "asc" ? (
    <ArrowUp aria-hidden className="size-3.5 shrink-0" />
  ) : (
    <ArrowDown aria-hidden className="size-3.5 shrink-0" />
  );
}

/**
 * A column header you can sort by, announced as one.
 *
 * The direction is carried three ways on purpose. `aria-sort` on the `<th>` is
 * the spec answer and what a table-navigation mode reads; the arrow glyph is
 * for the eye and stays `aria-hidden`; and the state is repeated in words
 * inside the button, so the control's *accessible name* is "Amount sorted
 * highest first" rather than a bare "Amount". Without that last one the demo is
 * operable but silent — you press Enter, the rows reorder, and nothing you can
 * hear has changed. `aria-sort` alone doesn't cover it: VoiceOver only surfaces
 * it inside table navigation, which is not where the keyboard focus is when
 * you're tabbing through the header buttons.
 *
 * `aria-sort="none"` is set on the sortable-but-inactive column rather than
 * omitted, which is what marks it as sortable at all; the two columns that
 * can't be sorted carry no `aria-sort`.
 */
function SortableHead({
  column,
  active,
  dir,
  onToggle,
  className,
  buttonClassName,
}: {
  column: SortKey;
  active: boolean;
  dir: SortDir;
  onToggle: () => void;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <TableHead
      className={className}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "group flex items-center gap-1 transition-colors hover:text-foreground",
          SORT_FOCUS_RING,
          buttonClassName,
        )}
      >
        {COLUMN_LABELS[column]}
        <span className="sr-only">
          {active ? SORT_STATE[column][dir] : "not sorted"}
        </span>
        <SortIcon active={active} dir={dir} />
      </button>
    </TableHead>
  );
}

/**
 * The transactions table, filtering and sorting for real.
 *
 * Column labels come from the app's own `COLUMN_LABELS`, and the amount tone
 * from `amountToneClass`, so the two can't drift on the details a reader would
 * actually notice. The rows and cells are the shared `ui/table` primitives —
 * everything except the `<Table>` wrapper, for the reason spelled out where the
 * `<table>` is opened — rather than the app's `TransactionsTable`, which
 * carries drag-to-reorder columns, resize handles, an edit dialog and a
 * localStorage-backed layout store: none of which a marketing page should be
 * dragging in.
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
          {/*
            * Part of the toolbar's picture, not a control. Export is its own
            * demo (`ExportDemo`), where the button downloads a real file
            * generated by the app's real serializer; this one has nowhere to
            * send you, and left live it was a full-contrast button that took
            * focus, showed a hover state and answered a click with nothing —
            * beside an identical-looking one, one page over, that works.
            *
            * `inert` takes it out of the tab order and the accessibility tree
            * together, and `pointer-events-none` removes the hover and the
            * pointer cursor, which `inert` leaves alone — the same pair the
            * inert composer in `entry-methods.tsx` uses. Not `disabled`, which
            * would say the app's export is broken; the opacity says "part of
            * the frame" instead.
            */}
          <Button
            inert
            variant="outline"
            size="sm"
            className="pointer-events-none h-8 shrink-0 gap-1.5 opacity-60"
          >
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
          {/* Zero is neither income nor a sign. Keyed on `total >= 0`, an
              empty result set printed an emerald "+$0.00" next to "Nothing
              matches those filters" — money in, from no rows at all. The
              emerald accent and the sign are both reserved for a total that
              actually has one. */}
          <span
            className={cn(
              "tabular-nums",
              total > 0 && "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {formatMoney(total, money.code, money.locale, { signed: total !== 0 })}
          </span>
        </div>
      }
    >
      {/*
        * A raw `<table>`, not the shared `<Table>` — because of the sticky
        * header above it.
        *
        * `<Table>` wraps its table in `<div class="… overflow-x-auto">`, and per
        * css-overflow-3 that div's `overflow-y: visible` computes to `auto`,
        * which makes it a scroll container. It then becomes the nearest
        * scrollport for anything sticky inside it — and since nothing
        * constrains its height, its `scrollTop` is pinned at 0 forever, so the
        * header sat still relative to a box that never scrolls while the rows
        * scrolled away in the box outside it. Directly inside the one element
        * that actually scrolls, `sticky` sticks. It's the shape the two working
        * sticky theads in this repo use (`bulk-add-dialog.tsx`,
        * `attachments/attachment-viewer.tsx`), and the wrapper's own classes are reproduced
        * here: this scroller already carries `scrollbar-slim`, and
        * `overflow-auto` covers the horizontal axis the wrapper was there for.
        */}
      <div className="scrollbar-slim h-full overflow-auto">
        <table className="w-full caption-bottom text-sm">
          {/* The table's accessible name. Visually redundant inside a labelled
              demo frame, and the only name a screen reader's table list has. */}
          <caption className="sr-only">
            A month of sample transactions — filter by type, category or text,
            and sort by date or amount.
          </caption>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <SortableHead
                column="date"
                active={sortKey === "date"}
                dir={sortDir}
                onToggle={() => toggleSort("date")}
                className="w-24"
              />
              <TableHead className="w-40">{COLUMN_LABELS.category}</TableHead>
              <TableHead>{COLUMN_LABELS.title}</TableHead>
              <SortableHead
                column="amount"
                active={sortKey === "amount"}
                dir={sortDir}
                onToggle={() => toggleSort("amount")}
                className="w-32 text-right"
                buttonClassName="ml-auto"
              />
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
                    {formatDateShort(row.date, money.locale)}
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
        </table>
      </div>
    </DemoFrame>
  );
}
