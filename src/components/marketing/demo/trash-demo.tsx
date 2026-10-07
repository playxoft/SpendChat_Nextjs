"use client";

import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DemoFrame } from "./demo-frame";
import { DemoReplay } from "./demo-replay";
import { demoAmount, useDemoMoney } from "@/hooks/use-demo-currency";
import { formatMoney } from "@/lib/money";
import { TRASH_DAYS } from "@/lib/trash";
import { cn } from "@/lib/utils";

/**
 * Delete, Undo, restore — the trash as the app runs it.
 *
 * A delete takes the row off the list and drops it into the trash with the
 * full window on its countdown; the message that follows carries an Undo that
 * puts back exactly what went, the way `toastMovedToTrash` does in the app.
 * The trash below lists what's waiting, with the same "Deletes in N days"
 * badge — amber in the last three days — plus Restore and Delete forever.
 *
 * One row is seeded as already nearly due, so the amber state is visible
 * without waiting a month. Its label is a fixed string, never computed from
 * the clock, so the server render and hydration agree. Amounts are USD seeds
 * rescaled by `demoAmount()`.
 */

type Row = { id: string; title: string; icon: string; category: string; amountUsd: number };
type Trashed = Row & { left: string; soon: boolean };

const LIVE: Row[] = [
  { id: "rent", title: "Rent", icon: "🏠", category: "Housing", amountUsd: 120_000 },
  { id: "shop", title: "Weekly shop", icon: "🛒", category: "Groceries", amountUsd: 6_200 },
  { id: "phone", title: "Phone bill", icon: "📱", category: "Bills", amountUsd: 3_500 },
  { id: "coffee", title: "Coffee", icon: "☕", category: "Dining", amountUsd: 450 },
];

const SEEDED_TRASH: Trashed[] = [
  { id: "gym", title: "Gym membership", icon: "🏋️", category: "Health", amountUsd: 4_000, left: "Deletes in 2 days", soon: true },
];

const FRESH = `Deletes in ${TRASH_DAYS} days`;

type Notice = { text: string; detail: string; undo: Row | null };

export function TrashDemo() {
  const money = useDemoMoney();
  const [rows, setRows] = useState<Row[]>(LIVE);
  const [trash, setTrash] = useState<Trashed[]>(SEEDED_TRASH);
  const [notice, setNotice] = useState<Notice | null>(null);

  const fmt = (usd: number) => formatMoney(demoAmount(usd, money), money.code, money.locale);
  /** Put a row back in its original place in the list. */
  const putBack = (list: Row[], row: Row) => {
    const order = [...LIVE, ...SEEDED_TRASH].map((r) => r.id);
    return [...list, row].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  };

  function remove(row: Row) {
    setRows((r) => r.filter((x) => x.id !== row.id));
    setTrash((t) => [{ ...row, left: FRESH, soon: false }, ...t]);
    setNotice({
      text: "Moved to trash",
      detail: `You can restore it from the trash for ${TRASH_DAYS} days.`,
      undo: row,
    });
  }

  function restore(row: Row, how: "undo" | "restore") {
    setTrash((t) => t.filter((x) => x.id !== row.id));
    setRows((r) => putBack(r, row));
    setNotice({
      text: "Restored 1 transaction",
      detail: how === "undo" ? "Back where it was, with its category and date." : "It's back in the list.",
      undo: null,
    });
  }

  function destroy(row: Trashed) {
    setTrash((t) => t.filter((x) => x.id !== row.id));
    setNotice({ text: "Deleted forever", detail: "That one can't come back.", undo: null });
  }

  function reset() {
    setRows(LIVE);
    setTrash(SEEDED_TRASH);
    setNotice(null);
  }

  return (
    <>
      <DemoFrame
        label="Interactive trash demo"
        active="/app/transactions"
        className="h-[36rem]"
        header={
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-medium">Transactions</p>
            <p className="text-xs text-muted-foreground">Press the bin on any row</p>
          </div>
        }
        footer={
          <div className="shrink-0 border-t px-4 py-3" aria-live="polite">
            {notice ? (
              <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{notice.text}</p>
                  <p className="truncate text-xs text-muted-foreground">{notice.detail}</p>
                </div>
                {notice.undo && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 shrink-0 px-3 text-xs"
                    onClick={() => restore(notice.undo!, "undo")}
                  >
                    Undo
                  </Button>
                )}
              </div>
            ) : (
              <p className="py-2 text-center text-xs text-muted-foreground">
                Every delete here goes to the trash first.
              </p>
            )}
          </div>
        }
        bodyClassName="overflow-y-auto"
      >
        <div className="space-y-5 px-4 py-4">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              Everything&apos;s in the trash. Undo, or restore it below.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border bg-background" aria-label="Transactions">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                  <span aria-hidden className="text-base">{r.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.category}</p>
                  </div>
                  <span className="text-sm tabular-nums">{fmt(r.amountUsd)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${r.title}`}
                    onClick={() => remove(r)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <section aria-label="Trash">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Trash2 className="size-3.5" /> Trash · {trash.length}
            </p>
            {trash.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                Nothing in the trash.
              </p>
            ) : (
              <ul className="mt-2 divide-y rounded-lg border bg-background">
                {trash.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
                    <span aria-hidden className="text-base text-muted-foreground">{t.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.category} · {fmt(t.amountUsd)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 font-normal",
                        t.soon && "border-amber-500/50 text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {t.left}
                    </Badge>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => restore(t, "restore")}
                      >
                        <RotateCcw className="size-3.5" /> Restore
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => destroy(t)}
                      >
                        Delete forever
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DemoFrame>
      <DemoReplay onClick={reset} label="Reset" />
    </>
  );
}
