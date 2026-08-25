"use client";

import { ArrowUp, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, signedMinor, toMinorUnits } from "@/lib/money";
import type { DemoMoneyFormat } from "@/hooks/use-demo-currency";
import { cn } from "@/lib/utils";

/**
 * The app's bulk-add dialog, as a still.
 *
 * Bulk import is the one entry method that doesn't happen in the composer: in
 * the app it opens a dialog over the tracker, you paste a block of rows into
 * it, and it fills a grid you can correct before anything is saved. Showing it
 * as another box in the composer footer told the wrong story about where the
 * feature lives, which is what this replaces — the demo now opens over the
 * widget the way the real thing opens over the app.
 *
 * Trimmed rather than reproduced: the real grid has six editable columns and a
 * date picker per row, none of which fits a demo frame half a viewport wide.
 * What's kept is what carries the claim — the paste box, and every pasted line
 * turned into a row you can read before you commit it.
 *
 * Presentational and inert. The parent owns the script and passes the state in,
 * so the typing here stays in step with the feed underneath.
 */
export function DemoBulkDialog({
  text,
  drafts,
  money,
  pressed = false,
  open,
}: {
  /** Paste-box contents — the caret is the caller's, appended to the string. */
  text: string;
  /**
   * Rows the real parser made of `text` — re-parsed on every keystroke, which
   * is the claim the copy beside this makes, so there's no separate "now
   * parse" beat to stagger.
   */
  drafts: { type: "income" | "expense"; amount: string; title: string; categoryName?: string }[];
  money: DemoMoneyFormat;
  /** The import button mid-press. */
  pressed?: boolean;
  /** Drives the open/close transition rather than mounting and unmounting, so
   * the dialog fades instead of blinking. */
  open: boolean;
}) {
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
          {/* The format line is the first thing to go on a phone: the frame is
              a third the height there, and a two-line subtitle costs a row of
              the preview — which is the part worth seeing. */}
          <p className="hidden text-xs text-muted-foreground sm:block">
            One transaction per line — amount, note, category, type, date.
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
          {/* Two lines on a phone, three from `sm`. `rows` can't be
              responsive, so the height comes from the class instead. */}
          <Textarea
            readOnly
            rows={2}
            value={text}
            placeholder="Paste rows here"
            aria-label="Paste rows"
            spellCheck={false}
            className="min-h-0 resize-none font-mono text-xs sm:min-h-[5.25rem]"
          />

          {drafts.length > 0 && (
            // The grid the paste becomes. Same reading order as the app's:
            // what kind, how much, what for, filed where.
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <tbody className="[&>tr]:border-t [&>tr:first-child]:border-t-0 [&>tr>td]:px-2 [&>tr>td]:py-1.5">
                  {drafts.map((row, i) => {
                    const Icon = row.type === "income" ? Plus : Minus;
                    return (
                      <tr key={i}>
                        <td className="w-6">
                          <Icon
                            className={cn(
                              "size-3.5",
                              row.type === "income"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400",
                            )}
                          />
                        </td>
                        <td className="w-24 text-right tabular-nums">
                          {formatMoney(
                            signedMinor(
                              row.type,
                              toMinorUnits(row.amount, money.code, money.locale),
                            ),
                            money.code,
                            money.locale,
                            { signed: true },
                          )}
                        </td>
                        <td className="min-w-0">
                          <span className="block truncate">{row.title}</span>
                        </td>
                        <td className="hidden w-28 truncate text-muted-foreground sm:table-cell">
                          {row.categoryName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-muted/20 px-4 py-3">
          <p className="text-xs text-muted-foreground">{drafts.length} ready</p>
          <Button
            type="button"
            className={cn("h-9 shrink-0 gap-1.5 transition-transform", pressed && "scale-90")}
          >
            <ArrowUp className="size-4" /> Import {drafts.length}
          </Button>
        </div>
      </div>
    </div>
  );
}
