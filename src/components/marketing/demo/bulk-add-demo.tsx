"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DemoFrame } from "./demo-frame";
import { DemoReplay } from "./demo-replay";
import { DemoFeed } from "./demo-feed";
import { DemoSummaryBar } from "./demo-summary-bar";
import { DemoProfilePicker } from "./demo-controls";
import { draftsToTxns, isValidDraft, type DemoDraft } from "./demo-draft-rows";
import { demoAmountInput, useDemoMoney, type DemoMoneyFormat } from "@/hooks/use-demo-currency";
import { useDemoFeed } from "./use-demo-feed";
import { bulkDelimiter, parseBulk } from "@/lib/bulk-parser";
import { formatMoney, signedMinor, toMinorUnits } from "@/lib/money";
import { formatAmountInput } from "@/lib/parse-amount";
import { cn } from "@/lib/utils";

/**
 * Fixed so nothing reads the clock during render — a date resolved at render
 * time differs between the server pass and hydration, which React reports as a
 * mismatch and throws the subtree away.
 */
const TODAY = "2026-08-21";

/**
 * The sample, built for whatever separators the visitor's locale implies —
 * see `demoAmountInput`. The last row is deliberately unparseable, because how
 * an importer reports a bad row is the thing worth showing.
 */
function sampleFor(money: DemoMoneyFormat): string {
  const delimiter = bulkDelimiter("", money.locale);
  const join = delimiter === "\t" ? "\t" : `${delimiter} `;
  const amount = (usdMinor: number) => demoAmountInput(usdMinor, money);
  return [
    [amount(1250), "Lunch with the team", "Food & Dining", "expense"],
    [amount(6200), "Weekly groceries", "Groceries", "expense"],
    [amount(2400), "Bus pass top-up", "Transport", "expense"],
    [amount(200000), "August salary", "Salary", "income"],
    ["lots", "Cinema tickets", "Entertainment", "expense"],
  ]
    .map((row) => row.join(join))
    .join("\n");
}

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
  const money = useDemoMoney();
  // `null` means "untouched", so the sample can follow the detected currency
  // once it resolves after hydration. Holding it in state instead would freeze
  // whatever the server rendered.
  const [edited, setEdited] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const text = edited ?? sampleFor(money);

  // Parsed with the *visitor's* locale, the same one `sampleFor` wrote the
  // sample in. A fixed `en-US` here would read "12,50; Lunch; …" as a broken
  // amount and fail every row for the half of Europe whose decimal mark is a
  // comma — the wall of red this demo exists to avoid. The locale is part of
  // both dependency lists because it lands after hydration, and a memo keyed on
  // the text alone would still be parsing as en-US once it does.
  const result = useMemo(() => parseBulk(text, TODAY, money.locale), [text, money.locale]);
  const delimiter = useMemo(
    () => bulkDelimiter(text.split("\n")[0] ?? "", money.locale),
    [text, money.locale],
  );

  /**
   * Every parsed line, in the shape the shared commit path takes — the rows the
   * preview lists *and* the rows the button commits, mapped once.
   *
   * `parseBulk` hands back an amount as a `number` and the shared mapping reads
   * it as a string *in the visitor's format*, so the hand-off goes through
   * `formatAmountInput` rather than `String()`: `String(12.5)` is "12.5", and
   * in `de-DE` (or `fr-FR`, `es-ES`, `pt-BR`, …) the dot is the *grouping*
   * separator, which `parseAmountInput` rejects as invalid grouping. Every row
   * in the preview would then be dropped as unsaveable and the import would
   * land nothing, silently, for a large part of the world.
   *
   * **The currency's decimals are part of that round trip.** `formatAmountInput`
   * defaults to two, and for KWD, BHD, OMR and JOD the third decimal *is* the
   * minor unit: a typed "99.999" came back "100" and committed 100.000 dinars,
   * while the preview line beside it still read KD 99.999. The one promise this
   * page makes is that you see exactly what would be saved, so the string the
   * preview prices and the string the import saves are now the same string, cut
   * to the same precision the currency actually has.
   */
  const previewDrafts: DemoDraft[] = useMemo(
    () =>
      result.drafts.map((draft, i) => ({
        key: i,
        type: draft.type,
        amount: formatAmountInput(draft.amount, money.locale, money.currency.decimals),
        title: draft.title || draft.note || "Transaction",
        categoryName: draft.categoryName ?? "",
      })),
    [result.drafts, money],
  );

  /**
   * Exactly what Import would write, already converted — through the same
   * mapping the AI, voice and homepage demos use, so "what a draft becomes" is
   * decided once.
   *
   * The count, the button's `disabled` and the commit all read this array and
   * not `result.drafts`, which is the pre-filter list. Counting the wrong one is
   * how the demo came to say "Import 1", call `addMany([])`, clear the box and
   * report "Imported — check the feed above" over an unchanged feed: `parseBulk`
   * happily reads "0.001" as an amount, and it is not a saveable one. Anything
   * `draftsToTxns` drops is shown as dropped in the list below rather than
   * quietly counted as ready.
   */
  const ready = useMemo(() => draftsToTxns(previewDrafts, money), [previewDrafts, money]);

  function importDrafts() {
    if (ready.length === 0) return;
    feed.addMany(ready);
    setEdited("");
    setImported(true);
  }

  function reset() {
    feed.reset();
    setEdited(null);
    setImported(false);
  }

  return (
    <>
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
          </div>

          <Textarea
            value={text}
            onChange={(e) => {
              setEdited(e.target.value);
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
            {previewDrafts.length === 0 && result.errors.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {imported ? "Imported — check the feed above." : "Nothing to preview yet."}
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {previewDrafts.map((draft) => {
                  // A line the parser accepted can still be unsaveable, and
                  // there is exactly one way left: an amount smaller than the
                  // currency's smallest unit ("0.001" in dollars, "0.4" in yen).
                  // `parseBulk` rejects the rest — a blank title falls back to
                  // "Transaction", and a negative or unreadable amount never
                  // reaches this list. Saying so beside the row is the honest
                  // version of dropping it: it is in the paste, it isn't in the
                  // count, and the reader can see which line to fix.
                  const saveable = isValidDraft(draft, money);
                  return (
                    <li
                      key={`draft-${draft.key}`}
                      className="flex items-center justify-between gap-3 px-3 py-1.5"
                    >
                      <span
                        className={cn("min-w-0 truncate", !saveable && "text-muted-foreground")}
                      >
                        {draft.title}
                        {draft.categoryName && (
                          <span className="text-muted-foreground">
                            {" · "}
                            {draft.categoryName}
                          </span>
                        )}
                      </span>
                      {saveable ? (
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
                              toMinorUnits(draft.amount, money.code, money.locale),
                            ),
                            money.code,
                            money.locale,
                            { signed: true },
                          )}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-destructive">
                          Too small to import
                        </span>
                      )}
                    </li>
                  );
                })}
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
            {/* Counted off `ready` — the array the button commits — so the
                number and the outcome agree by construction. */}
            <p className="min-w-0 text-xs text-muted-foreground">
              {ready.length} ready
              {result.errors.length > 0 &&
                ` · ${result.errors.length} ${result.errors.length === 1 ? "line needs" : "lines need"} fixing`}
            </p>
            <Button
              type="button"
              onClick={importDrafts}
              disabled={ready.length === 0}
              className="h-9 shrink-0 gap-1.5"
            >
              <ArrowUp className="size-4" />
              Import {ready.length}
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
    {/* "Reset", not "Replay": you edit this one, so it puts your sample back. */}
    <DemoReplay onClick={reset} label="Reset" />
    </>
  );
}
