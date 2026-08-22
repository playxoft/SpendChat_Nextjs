"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DemoFrame } from "./demo-frame";
import { DemoFeed } from "./demo-feed";
import { DemoSummaryBar } from "./demo-summary-bar";
import { DemoProfilePicker } from "./demo-controls";
import { DEMO_CURRENCY, DEMO_LOCALE, demoCategory } from "./demo-data";
import { useDemoFeed } from "./use-demo-feed";
import { bulkDelimiter, parseBulk } from "@/lib/bulk-parser";
import { formatMoney, signedMinor, toMinorUnits } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Fixed so nothing reads the clock during render — a date resolved at render
 * time differs between the server pass and hydration, which React reports as a
 * mismatch and throws the subtree away.
 */
const TODAY = "2026-08-21";

/** Deliberately includes one broken row, because that's the interesting case. */
const SAMPLE = [
  "12.50, Lunch with the team, Food & Dining, expense",
  "62, Weekly groceries, Groceries, expense",
  "24, Bus pass top-up, Transport, expense",
  "2000, August salary, Salary, income",
  "lots, Cinema tickets, Entertainment, expense",
].join("\n");

/**
 * Bulk import, running the app's real parser.
 *
 * `parseBulk` is a pure function over a string — no database, no account, no
 * server action — so the marketing page imports it directly and every keystroke
 * re-parses for real. That matters more than it might seem: the promise this
 * page makes is "you'll see exactly what would be saved, including what's
 * broken, before anything is". A mocked preview would be making that claim with
 * a fake, and the one row in the sample that doesn't parse is the whole point.
 */
export function BulkAddDemo() {
  const feed = useDemoFeed("Personal");
  const [text, setText] = useState(SAMPLE);
  const [imported, setImported] = useState(false);

  const result = useMemo(() => parseBulk(text, TODAY, DEMO_LOCALE), [text]);
  const delimiter = useMemo(
    () => bulkDelimiter(text.split("\n")[0] ?? "", DEMO_LOCALE),
    [text],
  );

  function importDrafts() {
    if (result.drafts.length === 0) return;
    feed.addMany(
      result.drafts.map((draft) => ({
        type: draft.type,
        amountMinor: toMinorUnits(draft.amount, DEMO_CURRENCY, DEMO_LOCALE),
        title: draft.title || draft.note || "Transaction",
        categoryName: draft.categoryName ?? "Other",
        categoryIcon: demoCategory(draft.categoryName ?? "")?.icon ?? "💸",
      })),
    );
    setText("");
    setImported(true);
  }

  function reset() {
    feed.reset();
    setText(SAMPLE);
    setImported(false);
  }

  return (
    <DemoFrame
      label="Interactive bulk import demo"
      active="/app"
      className="h-[42rem]"
      header={
        <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
          <DemoSummaryBar
            label="August"
            balanceMinor={feed.balanceMinor}
            incomeMinor={feed.totals.incomeMinor}
            expenseMinor={feed.totals.expenseMinor}
            className="min-w-0 flex-1"
          />
          <div className="lg:hidden">
            <DemoProfilePicker profile={feed.profile} onChange={feed.setProfile} />
          </div>
        </div>
      }
      bodyClassName="overflow-hidden"
      footer={
        <div className="flex shrink-0 flex-col gap-2 border-t bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Bulk add</p>
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              amount{delimiter} note{delimiter} category{delimiter} type{delimiter} date
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
              className="ml-auto h-8 shrink-0 gap-1.5 text-xs text-muted-foreground"
            >
              <RotateCcw className="size-3.5" /> Reset
            </Button>
          </div>

          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setImported(false);
            }}
            rows={4}
            spellCheck={false}
            aria-label="Paste transactions"
            placeholder="Paste rows here — one transaction per line"
            className="resize-none font-mono text-xs"
          />

          {/* The preview. Errors are listed with their line number, the way the
              app reports them, so a bad row is findable rather than just counted. */}
          <div className="max-h-32 min-h-0 overflow-y-auto rounded-lg border">
            {result.drafts.length === 0 && result.errors.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {imported ? "Imported — check the feed above." : "Nothing to preview yet."}
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {result.drafts.map((draft, i) => (
                  <li
                    key={`draft-${i}`}
                    className="flex items-center justify-between gap-3 px-3 py-1.5"
                  >
                    <span className="min-w-0 truncate">
                      {draft.title || draft.note}
                      {draft.categoryName && (
                        <span className="text-muted-foreground">
                          {" · "}
                          {draft.categoryName}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums",
                        draft.type === "income" &&
                          "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {formatMoney(
                        signedMinor(
                          draft.type,
                          toMinorUnits(draft.amount, DEMO_CURRENCY, DEMO_LOCALE),
                        ),
                        DEMO_CURRENCY,
                        DEMO_LOCALE,
                        { signed: true },
                      )}
                    </span>
                  </li>
                ))}
                {result.errors.map((error) => (
                  <li
                    key={`error-${error.line}`}
                    className="flex items-start gap-2 px-3 py-1.5 text-destructive"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      <span className="font-medium">Line {error.line}</span> — {error.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-xs text-muted-foreground">
              {result.drafts.length} ready
              {result.errors.length > 0 &&
                ` · ${result.errors.length} ${result.errors.length === 1 ? "line needs" : "lines need"} fixing`}
            </p>
            <Button
              type="button"
              onClick={importDrafts}
              disabled={result.drafts.length === 0}
              className="h-9 shrink-0 gap-1.5"
            >
              <ArrowUp className="size-4" />
              Import {result.drafts.length}
            </Button>
          </div>
        </div>
      }
    >
      <div className="h-full overflow-y-auto px-4 py-3">
        <div className="flex min-h-full flex-col justify-end">
          <DemoFeed txns={feed.txns} />
        </div>
      </div>
    </DemoFrame>
  );
}
