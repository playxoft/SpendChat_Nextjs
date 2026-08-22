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
import { DemoFeed } from "./demo-feed";
import { DemoSummaryBar } from "./demo-summary-bar";
import { DemoProfilePicker } from "./demo-controls";
import {
  DemoDraftRows,
  isValidDraft,
  patchDraft,
  type DemoDraft,
} from "./demo-draft-rows";
import { DEMO_CURRENCY, DEMO_LOCALE, demoCategory } from "./demo-data";
import { useDemoFeed } from "./use-demo-feed";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { toMinorUnits } from "@/lib/money";
import { cn } from "@/lib/utils";

/** The sentence the demo types out. Deliberately messy — that's the point. */
const NOTE = "lunch 12.50, groceries 62, and 40 for the taxi home";

/** What the parse "returns" — one draft per item in the sentence. */
const PARSED: DemoDraft[] = [
  { key: 1, type: "expense", amount: "12.50", title: "Lunch", categoryName: "Food & Dining" },
  { key: 2, type: "expense", amount: "62.00", title: "Groceries", categoryName: "Groceries" },
  { key: 3, type: "expense", amount: "40.00", title: "Taxi home", categoryName: "Transport" },
];

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
  const reduced = useReducedMotion();

  const [mode, setMode] = useState<EntryMode>("ai");
  const [stage, setStage] = useState<Stage>("review");
  const [typed, setTyped] = useState(NOTE);
  const [rows, setRows] = useState<DemoDraft[]>(PARSED);
  const [visibleRows, setVisibleRows] = useState(PARSED.length);

  const containerRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const played = useRef(false);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  const at = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  /** Run the whole sequence from the top: type → parse → reveal the drafts. */
  const play = useCallback(() => {
    clearTimers();
    setMode("ai");
    setRows(PARSED);
    setVisibleRows(0);
    setTyped("");
    setStage("typing");

    for (let i = 1; i <= NOTE.length; i++) {
      at(i * CHAR_MS, () => setTyped(NOTE.slice(0, i)));
    }

    const parseStart = NOTE.length * CHAR_MS + PAUSE_MS;
    at(parseStart, () => setStage("parsing"));

    const reviewStart = parseStart + PARSE_MS;
    at(reviewStart, () => setStage("review"));
    PARSED.forEach((_, i) => {
      at(reviewStart + i * ROW_STAGGER_MS, () => setVisibleRows(i + 1));
    });
  }, [at, clearTimers]);

  /** Back to the finished state immediately — the reduced-motion path, and
   * what "Replay" falls back to when motion is off. */
  const showResult = useCallback(() => {
    clearTimers();
    setMode("ai");
    setTyped(NOTE);
    setRows(PARSED);
    setVisibleRows(PARSED.length);
    setStage("review");
  }, [clearTimers]);

  // Play once, when it scrolls into view. Autoplaying on mount would run the
  // whole sequence above the fold before anyone had scrolled to it.
  useEffect(() => {
    if (reduced) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !played.current) {
            played.current = true;
            play();
          }
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced, play]);

  useEffect(() => clearTimers, [clearTimers]);

  function patch(key: number, changes: Partial<DemoDraft>) {
    setRows((prev) => patchDraft(prev, key, changes));
  }

  const validRows = useMemo(() => rows.filter(isValidDraft), [rows]);

  function confirm() {
    if (validRows.length === 0) return;
    feed.addMany(
      validRows.map((r) => ({
        type: r.type,
        amountMinor: toMinorUnits(r.amount, DEMO_CURRENCY, DEMO_LOCALE),
        title: r.title.trim(),
        categoryName: r.categoryName || "Other",
        categoryIcon: demoCategory(r.categoryName)?.icon ?? "💸",
      })),
    );
    clearTimers();
    setStage("saved");
    setTyped("");
    setRows([]);
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
              {stage === "review" && (
                <p className="min-w-0 flex-1 truncate text-sm font-medium">
                  Review {rows.length} transaction{rows.length === 1 ? "" : "s"}
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={reduced ? showResult : play}
                className="ml-auto h-8 shrink-0 gap-1.5 text-xs text-muted-foreground"
              >
                <Play className="size-3.5" /> Replay
              </Button>
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
                  <Button
                    type="button"
                    aria-label="Turn your note into transactions"
                    className={cn("size-8 shrink-0 rounded-full p-0", AI_BTN)}
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
                  onClick={reduced ? showResult : play}
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
                  {NOTE}
                </p>

                <DemoDraftRows
                  rows={rows}
                  visible={visibleRows}
                  onPatch={patch}
                  onRemove={(key) =>
                    setRows((prev) => prev.filter((r) => r.key !== key))
                  }
                />

                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 text-xs text-muted-foreground">
                    Edit anything that looks off, then save.
                  </p>
                  <Button
                    type="button"
                    onClick={confirm}
                    disabled={validRows.length === 0}
                    className={cn("h-9 shrink-0 gap-1.5", AI_BTN)}
                  >
                    <ArrowUp className="size-4" />
                    Add {validRows.length}
                  </Button>
                </div>
              </>
            )}
          </div>
        }
      >
        <div className="h-full overflow-y-auto px-4 py-3">
          {/* Bottom-anchored, like the app's chat feed. */}
          <div className="flex min-h-full flex-col justify-end">
            <DemoFeed txns={feed.txns} />
          </div>
        </div>
      </DemoFrame>
    </div>
  );
}
