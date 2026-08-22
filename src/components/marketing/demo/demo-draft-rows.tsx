"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RowTypeToggle } from "@/components/app/ai-accent";
import { DemoDateChip } from "./demo-controls";
import { DEMO_CURRENCY, DEMO_LOCALE, demoCategories, type DemoTxnType } from "./demo-data";
import { getCurrency } from "@/lib/currencies";
import { parseAmountInput } from "@/lib/parse-amount";

/** One reviewable draft, edited as strings — the shape the app's review step uses. */
export type DemoDraft = {
  key: number;
  type: DemoTxnType;
  amount: string;
  title: string;
  categoryName: string;
};

/** A draft is saveable once it has a positive amount and a title. */
export function isValidDraft(draft: DemoDraft): boolean {
  const value = parseAmountInput(draft.amount, DEMO_LOCALE);
  return value !== null && value > 0 && draft.title.trim().length > 0;
}

/**
 * Apply a change to one draft, clearing its category when the type flips —
 * an expense category can't apply to income, which is how the app behaves too.
 */
export function patchDraft(
  rows: DemoDraft[],
  key: number,
  changes: Partial<DemoDraft>,
): DemoDraft[] {
  return rows.map((row) => {
    if (row.key !== key) return row;
    const next = { ...row, ...changes };
    if (changes.type && changes.type !== row.type) next.categoryName = "";
    return next;
  });
}

/**
 * The AI review step's editable rows.
 *
 * Shared by the AI demo and the voice demo, because they converge on the same
 * screen: voice produces a transcript, the transcript is parsed, and what comes
 * back is reviewed here. Writing the grid twice would guarantee the two pages
 * eventually disagreed about what reviewing a draft looks like.
 *
 * `visible` drives the staggered reveal — rows past it are held back so they
 * can appear one at a time without the list re-mounting.
 */
export function DemoDraftRows({
  rows,
  visible,
  onPatch,
  onRemove,
}: {
  rows: DemoDraft[];
  /** How many rows to show. Pass `rows.length` for all of them. */
  visible: number;
  onPatch: (key: number, changes: Partial<DemoDraft>) => void;
  onRemove: (key: number) => void;
}) {
  const currency = getCurrency(DEMO_CURRENCY);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* One shared grid template across every row, so columns line up instead
          of shifting row to row — the app uses the same approach. */}
      <div className="min-w-[34rem] space-y-2 pr-1">
        {rows.slice(0, visible).map((row) => (
          <div
            key={row.key}
            className="grid animate-rise grid-cols-[auto_5.5rem_minmax(6rem,1fr)_8.5rem_7rem_auto] items-center gap-x-2 rounded-lg border bg-muted/30 p-2"
          >
            <RowTypeToggle
              value={row.type}
              onChange={(type) => onPatch(row.key, { type })}
            />
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">
                {currency.symbol}
              </span>
              <Input
                inputMode="decimal"
                value={row.amount}
                onChange={(e) =>
                  onPatch(row.key, { amount: e.target.value.replace(/[^\d.,\s]/g, "") })
                }
                aria-label="Amount"
                aria-invalid={!isValidDraft(row) || undefined}
                className="h-8 w-full pl-6 tabular-nums"
              />
            </div>
            <Input
              value={row.title}
              onChange={(e) => onPatch(row.key, { title: e.target.value })}
              aria-label="Title"
              className="h-8 w-full"
            />
            <Select
              value={row.categoryName || "none"}
              onValueChange={(v) =>
                onPatch(row.key, { categoryName: v === "none" ? "" : v })
              }
            >
              <SelectTrigger className="h-8 w-full" aria-label="Category">
                <SelectValue placeholder="No category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {demoCategories(row.type).map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.icon} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DemoDateChip className="w-full" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove transaction"
              onClick={() => onRemove(row.key)}
              className="shrink-0"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
