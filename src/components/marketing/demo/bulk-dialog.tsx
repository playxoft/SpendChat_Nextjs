"use client";

import { ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DemoMoneyFormat } from "@/hooks/use-demo-currency";
import { cn } from "@/lib/utils";

/**
 * The app's bulk-add dialog, as a still.
 *
 * Bulk import is the one entry method that doesn't happen in the composer: in
 * the app it opens a dialog over the tracker, and what that dialog *is* is an
 * editable grid — a row per transaction, every cell a field you can fix before
 * anything is saved. A paste is one way of filling it, and the demo shows what
 * a paste *produces* rather than the pasting: the block arrives at once, so the
 * grid fills a row at a time. There's no paste box here and nothing types —
 * this is the one entry method that isn't typed, and a caret blinking through a
 * text box would say the opposite.
 *
 * So this is the grid, with the shapes the real one uses: the pill type toggle,
 * `h-8` inputs, the currency prefix inside the amount, a select for the
 * category, a row-delete on the end. Two columns don't survive the trip —
 * Description and Date — because a demo frame is a third the width of the real
 * dialog, and those are the two a reader can most afford to imagine. Category
 * goes too below `sm`.
 *
 * Everything is `readOnly` and inert. This is a film of the dialog, not a fork
 * of it, and a cell you can type into that does nothing is worse than one that
 * plainly isn't yours.
 *
 * Presentational: the parent owns the script and passes the state in, so the
 * rows land in step with the feed underneath.
 */
export function DemoBulkDialog({
  drafts,
  visible,
  money,
  pressed = false,
  open,
}: {
  /** Every row the paste produced, as the app's own parser read it. */
  drafts: {
    type: "income" | "expense";
    amount: string;
    title: string;
    categoryName?: string;
  }[];
  /**
   * How many rows have landed. A paste arrives as a block, so the grid fills
   * a row at a time rather than a character at a time — there is no typing
   * here, and a caret blinking through a paste box would be the wrong story
   * for the one method that isn't typed.
   */
  visible: number;
  money: DemoMoneyFormat;
  /** The import button mid-press. */
  pressed?: boolean;
  /** Drives the open/close transition rather than mounting and unmounting, so
   * the dialog fades instead of blinking. */
  open: boolean;
}) {
  const rows = drafts.slice(0, visible);

  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center p-3 transition-opacity duration-300",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {/* The scrim the app's dialog puts over the page. */}
      <div className="absolute inset-0 bg-black/50" />

      <div
        className={cn(
          "relative flex max-h-full w-full flex-col overflow-hidden rounded-xl border bg-background shadow-2xl transition-all duration-300",
          open ? "translate-y-0 scale-100" : "translate-y-1 scale-[0.98]",
        )}
      >
        <div className="flex shrink-0 flex-col gap-0.5 border-b px-4 py-3">
          <p className="text-sm font-semibold">Bulk add transactions</p>
          {/* The subtitle is the first thing to go on a phone: the frame is a
              third the height there, and a second line costs a row of the grid
              — which is the part worth seeing. */}
          <p className="hidden text-xs text-muted-foreground sm:block">
            A row per transaction. Fix anything before it saves.
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
          <div className="shrink-0 overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/70">
                <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:text-left [&>th]:font-medium sm:[&>th]:py-1.5">
                  <th className="w-16">Type</th>
                  <th className="w-24">Amount</th>
                  <th className="min-w-28">Title</th>
                  <th className="hidden w-28 sm:table-cell">Category</th>
                  <th className="w-8" />
                </tr>
              </thead>
              {/* Tighter rows on a phone, where the frame is a third the
                  height and the grid still has to fit inside the dialog. */}
              <tbody className="[&>tr>td]:px-2 [&>tr>td]:py-1 [&>tr]:border-t sm:[&>tr>td]:py-1.5">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted-foreground">
                      Paste rows to fill this in.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <TypeToggle type={row.type} />
                      </td>
                      <td>
                        <div className="relative">
                          <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">
                            {money.currency.symbol}
                          </span>
                          <Input
                            readOnly
                            value={row.amount}
                            aria-label="Amount"
                            className="h-7 pl-6 tabular-nums sm:h-8"
                          />
                        </div>
                      </td>
                      <td>
                        <Input
                          readOnly
                          value={row.title}
                          aria-label="Title"
                          className="h-7 sm:h-8"
                        />
                      </td>
                      <td className="hidden sm:table-cell">
                        {/* Shaped like the real row's category select. Inert: a
                            live one would need the workspace's categories. */}
                        <span className="flex h-7 w-full items-center justify-between gap-1 rounded-md border px-2 text-sm sm:h-8">
                          <span className="min-w-0 truncate">
                            {row.categoryName || (
                              <span className="text-muted-foreground">None</span>
                            )}
                          </span>
                          <ChevronDown className="size-3.5 shrink-0 opacity-50" />
                        </span>
                      </td>
                      <td>
                        <span className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground sm:size-8">
                          <Trash2 className="size-3.5" />
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* The row of actions under the grid in the real dialog. First to go
              when there's no room: on a phone the grid carries this alone. */}
          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
              <Plus className="size-3.5" /> Add row
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
              <ChevronDown className="size-3.5 rotate-180" /> Paste from spreadsheet
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {rows.length} ready
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-muted/20 px-4 py-3">
          <p className="text-xs text-muted-foreground sm:hidden">{rows.length} ready</p>
          <Button
            type="button"
            className={cn(
              "ml-auto h-9 shrink-0 gap-1.5 transition-transform",
              pressed && "scale-90",
            )}
          >
            Import {rows.length}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The dialog's per-row expense/income switch — the composer's pill toggle
 * shrunk to two icons, tinted the way the real one tints the active side.
 */
function TypeToggle({ type }: { type: "income" | "expense" }) {
  return (
    <span className="inline-flex items-center rounded-full border bg-muted/60 p-0.5">
      {(["expense", "income"] as const).map((t) => {
        const active = type === t;
        const Icon = t === "income" ? Plus : Minus;
        return (
          <span
            key={t}
            className={cn(
              "inline-flex items-center justify-center rounded-full px-1.5 py-0.5",
              active
                ? t === "income"
                  ? "bg-emerald-500/15 shadow-sm ring-1 ring-emerald-500/40 dark:bg-emerald-500/25"
                  : "bg-rose-500/15 shadow-sm ring-1 ring-rose-500/40 dark:bg-rose-500/25"
                : "opacity-45",
            )}
          >
            <Icon
              className={cn(
                "size-3.5",
                t === "income"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400",
              )}
            />
          </span>
        );
      })}
    </span>
  );
}
