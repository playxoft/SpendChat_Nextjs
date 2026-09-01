"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EntryModeToggle,
  MODE_ROW_DENSE,
  type EntryMode,
} from "@/components/app/entry-mode-toggle";
import { AI_BTN } from "@/components/app/ai-accent";
import { DemoFrame } from "./demo-frame";
import { DemoReplay } from "./demo-replay";
import { DemoFeed } from "./demo-feed";
import { DemoSummaryBar } from "./demo-summary-bar";
import { DemoProfilePicker } from "./demo-controls";
import {
  DemoDraftRows,
  draftsToTxns,
  patchDraft,
  type DemoDraft,
} from "./demo-draft-rows";
import {
  demoAmountInput,
  useDemoMoney,
  type DemoMoneyFormat,
} from "@/hooks/use-demo-currency";
import { useDemoFeed } from "./use-demo-feed";
import { useScriptedDemo, type ScriptAt } from "./use-scripted-demo";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The sentence the demo types out, and the drafts a parse of it "returns".
 *
 * Both are derived from the visitor's currency rather than hard-coded, so an
 * Indian reader sees a sentence with rupee-sized numbers in it instead of a
 * ₹12.50 lunch. Deliberately messy prose either way — that's the point.
 */
function noteFor(money: DemoMoneyFormat): string {
  return `lunch ${demoAmountInput(1250, money)}, groceries ${demoAmountInput(6200, money)}, and ${demoAmountInput(4000, money)} for the taxi home`;
}

function parsedFor(money: DemoMoneyFormat): DemoDraft[] {
  return [
    { key: 1, type: "expense", amount: demoAmountInput(1250, money), title: "Lunch", categoryName: "Food & Dining" },
    { key: 2, type: "expense", amount: demoAmountInput(6200, money), title: "Groceries", categoryName: "Groceries" },
    { key: 3, type: "expense", amount: demoAmountInput(4000, money), title: "Taxi home", categoryName: "Transport" },
  ];
}

type Stage = "typing" | "parsing" | "review" | "saved";

const CHAR_MS = 38;
const PAUSE_MS = 450;
const PARSE_MS = 1200;
const ROW_STAGGER_MS = 140;

/**
 * The AI composer, scripted.
 *
 * It starts on the **finished** review state rather than an empty box, for two
 * reasons. A crawler reads the server-rendered HTML and nothing else, so the
 * parsed drafts — the actual subject of this page — have to be in it. And a
 * demo that begins empty and animates on load reserves no height until it
 * fills, which is a layout shift on the one metric Google measures directly.
 * The animation then replays on scroll-into-view, once, for anyone who hasn't
 * asked for reduced motion.
 *
 * No model is called. A marketing page has no session, no quota and no
 * business spending inference tokens on a visitor who hasn't signed up; the
 * parse is a fixed script. What's real is everything around it — the gradient
 * comes from `AI_BTN`, the row switch is the app's own `RowTypeToggle`, and the
 * amounts convert through `toMinorUnits`.
 */
export function AiDemo() {
  const feed = useDemoFeed("Personal");
  const { reset: resetFeed } = feed;
  const money = useDemoMoney();
  const reduced = useReducedMotion();

  const [mode, setMode] = useState<EntryMode>("ai");
  const [stage, setStage] = useState<Stage>("review");
  // `null` means "untouched", so the note and drafts follow the detected
  // currency once it resolves after hydration; seeding state directly would
  // freeze whatever the server rendered.
  const [typedOverride, setTypedOverride] = useState<string | null>(null);
  const [rowsOverride, setRowsOverride] = useState<DemoDraft[] | null>(null);

  const note = noteFor(money);
  // One array per currency, not one per render. `parsed` is what the untouched
  // `rows` are, so a fresh identity on every frame of the typing animation
  // would re-run every memo hanging off it and hand `play` a new closure ~80
  // times on the way through one sentence.
  const parsed = useMemo(() => parsedFor(money), [money]);
  const typed = typedOverride ?? note;
  const rows = rowsOverride ?? parsed;
  // The same `null`-means-untouched marker as the two overrides above, and for
  // a sharper reason than symmetry: this component server-renders its *finished*
  // state so a crawler reads the parsed drafts, so the count it starts on is
  // part of the HTML. Seeded as a literal `3` it would have shipped three of
  // four rows to crawlers the day the script grew a row, and stayed wrong until
  // something called `play` or `showResult`. Derived from `rows`, it can't.
  const [visibleOverride, setVisibleOverride] = useState<number | null>(null);
  const visibleRows = visibleOverride ?? rows.length;

  /**
   * Keep the newest row in view. The feed is bottom-anchored inside its own
   * scroller, so once the seeds plus a day divider exceed the frame the rows a
   * visitor just added land below the fold — the footer says "added to the feed
   * above" while the feed still shows yesterday. Scoped to this scroller, so it
   * never moves the page under the reader.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.txns]);

  /** Back to the finished state immediately — the reduced-motion path, and
   * what "Replay" falls back to when motion is off. */
  const showResult = useCallback(() => {
    // Replaying restores the feed too. Without it a second "Add" appends
    // another copy of the same three rows, and the balance drifts to a number
    // the demo never meant to show.
    resetFeed();
    setMode("ai");
    setTypedOverride(null);
    setRowsOverride(null);
    setVisibleOverride(null);
    setStage("review");
  }, [resetFeed]);

  /** Run the whole sequence from the top: type → parse → reveal the drafts. */
  const play = useCallback(
    (at: ScriptAt) => {
      if (reduced) {
        showResult();
        return;
      }

      // Same reason as `showResult`: a replay starts the story over, so the
      // feed goes back to its seeds rather than keeping the rows the last run
      // added.
      resetFeed();
      setMode("ai");
      setRowsOverride(null);
      setVisibleOverride(0);
      setTypedOverride("");
      setStage("typing");

      for (let i = 1; i <= note.length; i++) {
        at(i * CHAR_MS, () => setTypedOverride(note.slice(0, i)));
      }

      const parseStart = note.length * CHAR_MS + PAUSE_MS;
      at(parseStart, () => setStage("parsing"));

      const reviewStart = parseStart + PARSE_MS;
      at(reviewStart, () => setStage("review"));
      parsed.forEach((_, i) => {
        at(reviewStart + i * ROW_STAGGER_MS, () => setVisibleOverride(i + 1));
      });
    },
    [resetFeed, note, parsed, reduced, showResult],
  );

  // Plays once when it scrolls into view: autoplaying on mount would run the
  // whole sequence above the fold before anyone had scrolled to it. `start` is
  // the same entry point the Replay button uses, so both paths cancel whatever
  // is queued before beginning again.
  const { containerRef, clearTimers, start } = useScriptedDemo(play, {
    threshold: 0.35,
  });

  function patch(key: number, changes: Partial<DemoDraft>) {
    setRowsOverride(patchDraft(rows, key, changes));
  }

  // Exactly what "Add N" would add, already converted — the button counts the
  // same array `confirm` commits, so the two can't disagree, and rows the
  // visitor has edited into something unparseable are gone from both.
  const ready = useMemo(() => draftsToTxns(rows, money), [money, rows]);

  function confirm() {
    if (ready.length === 0) return;
    feed.addMany(ready);
    clearTimers();
    setStage("saved");
    setTypedOverride("");
    setRowsOverride([]);
  }

  const isNoteStage = stage === "typing" || stage === "parsing";

  return (
    <div ref={containerRef}>
      <DemoFrame
        label="Interactive AI entry demo"
        active="/app"
        // Pinned height. The footer is much taller in review than while the
        // note is being typed, and without a fixed frame that difference moves
        // every section below it on the page. The feed absorbs it instead.
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
          // Sizes to its content, like the app's composer: the note box is
          // short, the review list is tall, and the difference is absorbed by
          // the feed above rather than by the page below — the frame itself is
          // pinned, which is what keeps this off the layout-shift budget.
          <div className="flex shrink-0 flex-col gap-2 border-t bg-muted/20 px-4 py-3">
            <div className={MODE_ROW_DENSE}>
              <EntryModeToggle mode={mode} onChange={setMode} dense pane={mode} />
              {/* Gated on the pane, not just the stage. The visitor can switch
                  to Manual mid-review, and the count is a caption for the
                  drafts below it — over the manual placeholder it announced
                  "Review 3 transactions" above a line explaining that manual
                  entry is the other half of the composer. The app can't have
                  this problem: its review row lives *inside* the AI pane. */}
              {mode === "ai" && stage === "review" && (
                <p className="min-w-0 flex-1 truncate text-sm font-medium">
                  Review {rows.length} transaction{rows.length === 1 ? "" : "s"}
                </p>
              )}
            </div>

            {mode === "manual" ? (
              <div className="flex min-h-[4.625rem] items-center justify-center rounded-xl border border-dashed px-4 text-center text-sm text-muted-foreground">
                Manual entry is the other half of the composer — amount,
                category, send.
              </div>
            ) : isNoteStage ? (
              <div className="relative flex flex-col">
                <Textarea
                  // The caret is part of the value rather than an overlay: an
                  // absolutely-positioned one has to reproduce the textarea's
                  // font, padding, wrapping and line-height exactly, and any
                  // drift leaves a block floating beside the text.
                  value={stage === "typing" ? `${typed}\u258C` : typed}
                  readOnly
                  rows={2}
                  aria-label="Describe your transactions"
                  className="min-h-[4.625rem] resize-none pr-14 pb-10"
                />
                <div className="absolute right-1.5 bottom-1 flex items-center gap-1">
                  {/*
                   * The send button is part of the film, so it is `inert`.
                   *
                   * It has no `onClick` and shouldn't get one: the script owns
                   * when this note is sent, and a second way in would race the
                   * beats already queued. Left plain it was the lie the
                   * `readOnly` note box above was written to avoid, only louder
                   * — tabbable, focus-ringed, and announcing "Turn your note
                   * into transactions" to a reader who could then press it and
                   * watch nothing happen. `inert` takes it out of the tab order
                   * and out of the accessibility tree; `pointer-events-none` is
                   * what removes the hover state and the pointer cursor, which
                   * `inert` leaves alone.
                   *
                   * Not `disabled`, which would grey it out and say the app's
                   * send button is broken — and the spinner it shows mid-parse
                   * is the one thing here that has to keep reading as normal.
                   * Same treatment, for the same reason, as the bulk dialog
                   * (`demo/bulk-dialog.tsx`) and the homepage composer
                   * (`entry-methods.tsx`). The *review* button further down is
                   * the opposite case and stays live: it has a real `onClick`
                   * and a real `disabled`, because saving the drafts is the
                   * visitor's move, not the script's.
                   */}
                  <Button
                    type="button"
                    inert
                    aria-label="Turn your note into transactions"
                    className={cn(
                      "pointer-events-none size-8 shrink-0 rounded-full p-0",
                      AI_BTN,
                    )}
                  >
                    {stage === "parsing" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowUp className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            ) : stage === "saved" ? (
              <div className="flex min-h-[4.625rem] flex-col items-center justify-center gap-2 py-2 text-center">
                <p className="text-sm font-medium">
                  Added to the feed above — check the balance.
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Nothing was saved anywhere; this is a demo. In the app they&apos;d
                  now be ordinary transactions you can edit or delete.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={start}
                  className="mt-1 h-8 gap-1.5"
                >
                  <Play className="size-3.5" /> Try another sentence
                </Button>
              </div>
            ) : (
              <>
                {/* The note that produced these drafts, so the parse can be
                    checked against what was typed. */}
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {note}
                </p>

                <DemoDraftRows
                  rows={rows}
                  visible={visibleRows}
                  onPatch={patch}
                  onRemove={(key) => setRowsOverride(rows.filter((r) => r.key !== key))}
                />

                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 text-xs text-muted-foreground">
                    Edit anything that looks off, then save.
                  </p>
                  <Button
                    type="button"
                    onClick={confirm}
                    disabled={ready.length === 0}
                    className={cn("h-9 shrink-0 gap-1.5", AI_BTN)}
                  >
                    <ArrowUp className="size-4" />
                    Add {ready.length}
                  </Button>
                </div>
              </>
            )}
          </div>
        }
      >
        <div
          ref={scrollRef}
          tabIndex={0}
          role="group"
          aria-label="Transaction feed"
          className="h-full overflow-y-auto px-4 py-3"
        >
          {/* Bottom-anchored, like the app's chat feed. */}
          <div className="flex min-h-full flex-col justify-end">
            <DemoFeed txns={feed.txns} />
          </div>
        </div>
      </DemoFrame>
      <DemoReplay onClick={start} />
    </div>
  );
}
