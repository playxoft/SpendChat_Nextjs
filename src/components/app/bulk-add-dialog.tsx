"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { bulkDelimiter, parseBulk, type BulkDraft } from "@/lib/bulk-parser";
import {
  amountPlaceholder,
  formatAmountInput,
  parseAmountInput,
} from "@/lib/parse-amount";
import { addBulkTransactions } from "@/actions/transactions";
import { getCurrency } from "@/lib/currencies";
import { useIsMac } from "@/hooks/use-shortcut";
import { cn } from "@/lib/utils";
import type { Category, Profile } from "@/db/schema";

const NONE = "none";

type DraftRow = {
  key: number;
  type: "income" | "expense";
  amount: string;
  title: string;
  description: string;
  categoryName: string;
  profileId: string;
  date: string;
};

/**
 * Minimized expense/income switch — the tracker's pill toggle stripped to
 * icons to fit a table cell. Each side carries a hover tooltip so the color +
 * sign ("+" in / "−" out) is never the only cue for what it means.
 */
function TypeToggle({
  value,
  onChange,
}: {
  value: "income" | "expense";
  onChange: (t: "income" | "expense") => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border bg-muted/60 p-0.5">
      {(["expense", "income"] as const).map((t) => {
        const active = value === t;
        const Icon = t === "income" ? Plus : Minus;
        const color =
          t === "income"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400";
        const activeBg =
          t === "income"
            ? "bg-emerald-500/15 ring-emerald-500/40 dark:bg-emerald-500/25"
            : "bg-rose-500/15 ring-rose-500/40 dark:bg-rose-500/25";
        return (
          <Tooltip key={t}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange(t)}
                aria-label={t}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center justify-center rounded-full px-3 py-1 transition-all",
                  active ? cn("shadow-sm ring-1", activeBg) : "opacity-45 hover:opacity-90",
                )}
              >
                <Icon className={cn("size-4", color)} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t === "income" ? "Income · money in" : "Expense · money out"}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function BulkAddDialog({
  trigger,
  today,
  categories,
  profiles,
  activeProfileId,
  allProfiles = false,
  currency = "USD",
  locale = "en-US",
  open: openProp,
  onOpenChange,
}: {
  /** Optional — omit when the dialog is opened from a keyboard shortcut. */
  trigger?: ReactNode;
  today: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  activeProfileId?: string;
  /** Only when viewing "All profiles" can rows target different profiles;
   * otherwise every row goes to the active profile. */
  allProfiles?: boolean;
  currency?: string;
  /** Drives how typed/pasted amounts are read, and the paste delimiter. */
  locale?: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const defaultProfile = activeProfileId ?? profiles[0]?.id ?? "";
  const showProfileColumn = allProfiles && profiles.length > 1;
  const idRef = useRef(3);
  const nextKey = () => ++idRef.current;

  // Spreadsheet-style keyboard navigation across the editable text cells.
  const NAV_COLS = ["amount", "title", "description"];
  const scrollRef = useRef<HTMLDivElement>(null);
  // The column an Enter returns to. Set by clicking/entering a cell — Tab moves
  // across columns without disturbing it, so Amount → Tab → Title → Enter lands
  // on the next row's Amount (like Google Sheets).
  const anchorColRef = useRef("amount");
  const tabbingRef = useRef(false);
  const pendingFocusRef = useRef<{ row: number; col: string } | null>(null);

  // Date stamped on rows created from here on. Changing it never rewrites rows
  // that already exist — they keep whatever date they were given.
  const [defaultDate, setDefaultDate] = useState(today);

  const emptyRow = (key: number): DraftRow => ({
    key,
    type: "expense",
    amount: "",
    title: "",
    description: "",
    categoryName: "",
    profileId: defaultProfile,
    date: defaultDate,
  });

  const controlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlled ? openProp : internalOpen;
  const setOpen = controlled ? onOpenChange! : setInternalOpen;
  const [rows, setRows] = useState<DraftRow[]>(() => [0, 1, 2].map((k) => emptyRow(k)));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  // Flip on after a failed import so invalid fields light up (and clear live).
  const [showErrors, setShowErrors] = useState(false);
  const [pending, startTransition] = useTransition();
  const isMac = useIsMac();

  const symbol = getCurrency(currency).symbol;
  // "0.00" / "0,00", and the delimiter the paste box expects (";" where a comma
  // is the decimal point) — both have to match what this user actually types.
  const placeholder = amountPlaceholder(locale);
  const delimiter = bulkDelimiter("", locale);
  const pasteExample = [
    `${formatAmountInput(12.5, locale)}${delimiter} Lunch${delimiter} Food & Dining`,
    `-40${delimiter} Groceries${delimiter} Groceries${delimiter} expense${delimiter} 2026-06-15`,
    `+2000${delimiter} June salary${delimiter} Salary${delimiter} income`,
  ].join("\n");

  function patch(key: number, change: Partial<DraftRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow(nextKey())]);
  }
  function removeRow(key: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }

  // Set the date for new rows, and roll it onto rows the user hasn't started
  // yet (blank amount *and* title). Rows with real content keep their own date.
  function changeDefaultDate(iso: string) {
    setDefaultDate(iso);
    setRows((rs) =>
      rs.map((r) => (!r.amount.trim() && !r.title.trim() ? { ...r, date: iso } : r)),
    );
  }

  // Move focus to a specific cell (row index + column), selecting its text so
  // typing overwrites — the way stepping into a spreadsheet cell behaves.
  function focusCell(row: number, col: string) {
    const el = scrollRef.current?.querySelector<HTMLInputElement>(
      `input[data-row="${row}"][data-col="${col}"]`,
    );
    el?.focus();
    el?.select();
  }

  // After Enter appends a row, focus the cell we queued for it (the row didn't
  // exist yet when the key was pressed).
  useEffect(() => {
    const pf = pendingFocusRef.current;
    if (!pf) return;
    pendingFocusRef.current = null;
    focusCell(pf.row, pf.col);
  }, [rows.length]);

  // Tab moves across columns (browser default). We only record that the next
  // focus came from Tab, so it doesn't overwrite the anchor column.
  function onGridFocus(e: React.FocusEvent<HTMLElement>) {
    if (tabbingRef.current) {
      tabbingRef.current = false;
      return;
    }
    const col = e.target.dataset.col;
    if (col && NAV_COLS.includes(col)) anchorColRef.current = col;
  }

  // Enter drops down to the anchor column of the next row, spawning a fresh row
  // when we're already on the last one. Shift+Enter steps back up.
  function onGridKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    // ⌘E (mac) / Ctrl+E flips the focused row between expense and income — the
    // same shortcut the tracker uses. Gate on the platform's mod key only so it
    // doesn't hijack macOS's Ctrl+E "move to end of line" inside the inputs.
    if ((isMac ? e.metaKey : e.ctrlKey) && (e.key === "e" || e.key === "E")) {
      const cur = rows[Number((e.target as HTMLElement).dataset.row)];
      if (!cur) return;
      e.preventDefault();
      patch(cur.key, {
        type: cur.type === "expense" ? "income" : "expense",
        categoryName: "",
      });
      return;
    }
    if (e.key === "Tab") {
      tabbingRef.current = true;
      return;
    }
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    const col = target.dataset.col;
    if (!col || !NAV_COLS.includes(col)) return; // let selects/date keep Enter
    e.preventDefault();
    const row = Number(target.dataset.row);
    if (Number.isNaN(row)) return;
    const dir = e.shiftKey ? -1 : 1;
    const next = row + dir;
    if (next < 0) return;
    if (next >= rows.length) {
      if (dir < 0) return;
      pendingFocusRef.current = { row: rows.length, col: anchorColRef.current };
      addRow();
      return;
    }
    focusCell(next, anchorColRef.current);
  }

  // Amounts are read against the user's locale: "1,50" is 1.50 for a de-DE
  // user and 1000 (from "1,000") for an en-US one. null = unreadable.
  const parseAmount = (s: string) => parseAmountInput(s, locale);
  const isPositiveAmount = (s: string) => {
    const n = parseAmount(s);
    return n !== null && n > 0;
  };
  // A row the user hasn't started at all is ignored (the dialog opens with a few
  // blank rows); a started row must have a valid amount and a title.
  const isRowEmpty = (r: DraftRow) =>
    !r.amount.trim() && !r.title.trim() && !r.description.trim() && !r.categoryName;
  const rowErrors = (r: DraftRow) => ({
    amount: !isPositiveAmount(r.amount),
    title: !r.title.trim(),
  });

  const filledRows = rows.filter((r) => !isRowEmpty(r));

  const drafts: BulkDraft[] = filledRows
    .filter((r) => isPositiveAmount(r.amount) && r.title.trim())
    .map((r) => ({
      type: r.type,
      amount: parseAmount(r.amount)!,
      title: r.title.trim(),
      description: r.description.trim() || undefined,
      note: "",
      categoryName: r.categoryName || null,
      profileId: r.profileId || undefined,
      occurredOn: r.date || today,
    }));

  function handleParse() {
    const { drafts: parsed, errors } = parseBulk(pasteText, defaultDate, locale);
    if (parsed.length === 0) {
      toast.error("Couldn't read any rows from the pasted text");
      return;
    }
    setRows((rs) => {
      const kept = rs.filter((r) => isPositiveAmount(r.amount));
      const added = parsed.map((d) => ({
        key: nextKey(),
        type: d.type,
        amount: formatAmountInput(d.amount, locale),
        title: d.note ?? "",
        description: "",
        categoryName: d.categoryName ?? "",
        profileId: defaultProfile,
        date: d.occurredOn,
      }));
      return [...kept, ...added];
    });
    setPasteText("");
    setPasteOpen(false);
    if (errors.length) toast.warning(`${errors.length} line(s) couldn't be parsed`);
  }

  function handleImport() {
    if (filledRows.length === 0) {
      toast.error("Add at least one row with an amount and a title");
      return;
    }
    const invalid = filledRows.some((r) => {
      const e = rowErrors(r);
      return e.amount || e.title;
    });
    if (invalid) {
      setShowErrors(true);
      toast.error("Each row needs a number for the amount and a title");
      return;
    }
    setShowErrors(false);
    startTransition(async () => {
      const res = await addBulkTransactions(drafts);
      if (res.ok) {
        toast.success(`Imported ${res.count} transaction${res.count === 1 ? "" : "s"}`);
        setRows([0, 1, 2].map((k) => emptyRow(k)));
        setShowErrors(false);
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        onOpenAutoFocus={(e) => {
          // Land in the first amount cell so typing starts immediately — and so
          // the type toggle isn't auto-focused, which would pop its tooltip open
          // the moment the dialog mounts.
          const first = scrollRef.current?.querySelector<HTMLInputElement>(
            'input[data-col="amount"]',
          );
          if (first) {
            e.preventDefault();
            first.focus();
          }
        }}
        className="sm:max-w-[min(86.4rem,85.5vw)]"
      >
        <DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <DialogTitle>Bulk add transactions</DialogTitle>
            <div className="flex shrink-0 items-center gap-1.5 sm:pr-10">
              <Tooltip>
                <TooltipTrigger asChild>
                  <label
                    htmlFor="bulk-default-date"
                    className="cursor-help text-sm whitespace-nowrap text-muted-foreground"
                  >
                    New rows:
                  </label>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  New rows — and any still-blank rows — use this date. Rows with an
                  amount or title keep their own.
                </TooltipContent>
              </Tooltip>
              <DatePicker
                id="bulk-default-date"
                value={defaultDate}
                max={today}
                onChange={changeDefaultDate}
                compact
                className="h-8 w-auto"
              />
            </div>
          </div>
        </DialogHeader>

        <div
          ref={scrollRef}
          onKeyDownCapture={onGridKeyDown}
          onFocusCapture={onGridFocus}
          className="max-h-[55vh] overflow-auto rounded-lg border"
        >
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur-sm">
              <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                <th className="w-28">Type</th>
                <th className="w-28">Amount</th>
                <th className="min-w-32">Title</th>
                <th className="min-w-48">Description</th>
                <th className="w-40">Category</th>
                <th className="w-40">Date</th>
                {showProfileColumn && <th className="w-36">Profile</th>}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="[&>tr>td]:px-2 [&>tr>td]:py-1.5 [&>tr]:border-t">
              {rows.map((r, i) => {
                const cats = categories.filter((c) => c.kind === r.type);
                const err = showErrors && !isRowEmpty(r) ? rowErrors(r) : null;
                return (
                  <tr key={r.key}>
                    <td>
                      <TypeToggle
                        value={r.type}
                        onChange={(t) => patch(r.key, { type: t, categoryName: "" })}
                      />
                    </td>
                    <td>
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">
                          {symbol}
                        </span>
                        <Input
                          inputMode="decimal"
                          value={r.amount}
                          // Numbers only — drop anything that isn't a digit or a
                          // decimal/thousands separator so text can't be entered.
                          onChange={(e) =>
                            patch(r.key, {
                              amount: e.target.value.replace(/[^\d.,\s]/g, ""),
                            })
                          }
                          placeholder={placeholder}
                          aria-label="Amount"
                          aria-invalid={err?.amount || undefined}
                          data-row={i}
                          data-col="amount"
                          className="h-8 pl-6 tabular-nums"
                        />
                      </div>
                    </td>
                    <td>
                      <Input
                        value={r.title}
                        onChange={(e) => patch(r.key, { title: e.target.value })}
                        placeholder="Title"
                        aria-label="Title"
                        aria-invalid={err?.title || undefined}
                        maxLength={40}
                        data-row={i}
                        data-col="title"
                        className="h-8"
                      />
                    </td>
                    <td>
                      <Input
                        value={r.description}
                        onChange={(e) => patch(r.key, { description: e.target.value })}
                        placeholder="Description"
                        aria-label="Description"
                        maxLength={150}
                        data-row={i}
                        data-col="description"
                        className="h-8"
                      />
                    </td>
                    <td>
                      <Select
                        value={r.categoryName || NONE}
                        onValueChange={(v) =>
                          patch(r.key, { categoryName: v === NONE ? "" : v })
                        }
                      >
                        <SelectTrigger className="h-8 w-full" aria-label="Category">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>No category</SelectItem>
                          {cats.map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.icon ? `${c.icon} ` : ""}
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td>
                      <DatePicker
                        value={r.date}
                        max={today}
                        onChange={(iso) => patch(r.key, { date: iso })}
                        className="h-8"
                      />
                    </td>
                    {showProfileColumn && (
                      <td>
                        <Select
                          value={r.profileId}
                          onValueChange={(v) => patch(r.key, { profileId: v })}
                        >
                          <SelectTrigger className="h-8 w-full" aria-label="Profile">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {profiles.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.icon ? `${p.icon} ` : ""}
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    )}
                    <td>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove row"
                        onClick={() => removeRow(r.key)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={addRow}>
            <Plus className="size-4" /> Add row
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPasteOpen((v) => !v)}
          >
            <ChevronDown
              className={cn("size-4 transition-transform", pasteOpen && "rotate-180")}
            />
            Paste from spreadsheet
          </Button>
          <span className="ml-auto text-sm text-muted-foreground">
            {drafts.length} ready
          </span>
        </div>

        {pasteOpen && (
          <div className="space-y-2">
            <Textarea
              rows={4}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={pasteExample}
              className="font-mono text-xs"
              aria-label="Paste rows"
            />
            <Button type="button" variant="secondary" size="sm" onClick={handleParse}>
              Add parsed rows
            </Button>
          </div>
        )}

        <DialogDescription className="text-xs leading-relaxed">
          Fill in a row per transaction. Each row needs an amount and a title. Tab
          moves across, Enter jumps to the next row (and adds one at the end).
          Press <Kbd combo="mod+e" className="mx-1 align-middle" /> on a row to
          switch it between expense and income.
        </DialogDescription>

        <DialogFooter>
          <Button onClick={handleImport} disabled={pending || filledRows.length === 0}>
            Import {drafts.length > 0 ? drafts.length : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
