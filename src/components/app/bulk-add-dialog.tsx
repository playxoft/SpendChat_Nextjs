"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
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
import { parseBulk, type BulkDraft } from "@/lib/bulk-parser";
import { addBulkTransactions } from "@/actions/transactions";
import { getCurrency } from "@/lib/currencies";
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

export function BulkAddDialog({
  trigger,
  today,
  categories,
  profiles,
  activeProfileId,
  allProfiles = false,
  currency = "USD",
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

  const emptyRow = (key: number): DraftRow => ({
    key,
    type: "expense",
    amount: "",
    title: "",
    description: "",
    categoryName: "",
    profileId: defaultProfile,
    date: today,
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

  const symbol = getCurrency(currency).symbol;

  function patch(key: number, change: Partial<DraftRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow(nextKey())]);
  }
  function removeRow(key: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
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

  // Amounts may carry comma thousands separators — strip them before parsing.
  const parseAmount = (s: string) => Number(s.replace(/,/g, ""));
  // A row the user hasn't started at all is ignored (the dialog opens with a few
  // blank rows); a started row must have a valid amount and a title.
  const isRowEmpty = (r: DraftRow) =>
    !r.amount.trim() && !r.title.trim() && !r.description.trim() && !r.categoryName;
  const rowErrors = (r: DraftRow) => ({
    amount: !(parseAmount(r.amount) > 0),
    title: !r.title.trim(),
  });

  const filledRows = rows.filter((r) => !isRowEmpty(r));

  const drafts: BulkDraft[] = filledRows
    .filter((r) => parseAmount(r.amount) > 0 && r.title.trim())
    .map((r) => ({
      type: r.type,
      amount: parseAmount(r.amount),
      title: r.title.trim(),
      description: r.description.trim() || undefined,
      note: "",
      categoryName: r.categoryName || null,
      profileId: r.profileId || undefined,
      occurredOn: r.date || today,
    }));

  function handleParse() {
    const { drafts: parsed, errors } = parseBulk(pasteText, today);
    if (parsed.length === 0) {
      toast.error("Couldn't read any rows from the pasted text");
      return;
    }
    setRows((rs) => {
      const kept = rs.filter((r) => Number(r.amount) > 0);
      const added = parsed.map((d) => ({
        key: nextKey(),
        type: d.type,
        amount: String(d.amount),
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
      <DialogContent className="sm:max-w-[min(96rem,95vw)]">
        <DialogHeader>
          <DialogTitle>Bulk add transactions</DialogTitle>
          <DialogDescription>
            Fill in a row per transaction. Each row needs an amount and a title.
            Tab moves across, Enter jumps to the next row (and adds one at the end).
          </DialogDescription>
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
                <th className="w-40">Amount</th>
                <th className="min-w-40">Title</th>
                <th className="min-w-40">Description</th>
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
                      <Select
                        value={r.type}
                        onValueChange={(v) =>
                          patch(r.key, { type: v as "income" | "expense", categoryName: "" })
                        }
                      >
                        <SelectTrigger className="h-8 w-full" aria-label="Type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="income">Income</SelectItem>
                        </SelectContent>
                      </Select>
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
                            patch(r.key, { amount: e.target.value.replace(/[^\d.,]/g, "") })
                          }
                          placeholder="0.00"
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
                        maxLength={100}
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
                        maxLength={250}
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
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="size-4" /> Add row
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
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
              placeholder={`12.50, Lunch, Food & Dining\n-40, Groceries, Groceries, expense, 2026-06-15\n+2000, June salary, Salary, income`}
              className="font-mono text-xs"
              aria-label="Paste rows"
            />
            <Button type="button" variant="secondary" size="sm" onClick={handleParse}>
              Add parsed rows
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleImport} disabled={pending || filledRows.length === 0}>
            Import {drafts.length > 0 ? drafts.length : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
