"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  ListPlus,
  Loader2,
  MessageSquare,
  Mic,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CategoryRow } from "@/components/app/category-row";
import { AI_BTN } from "@/components/app/ai-accent";
import {
  EntryModeToggle,
  MODE_ROW_DENSE,
  type EntryMode,
} from "@/components/app/entry-mode-toggle";
import { VoiceListeningStrip, VoiceMicButton } from "@/components/app/voice-mic";
import { DemoFrame } from "@/components/marketing/demo/demo-frame";
import { DemoFeed } from "@/components/marketing/demo/demo-feed";
import { DemoSummaryBar } from "@/components/marketing/demo/demo-summary-bar";
import {
  DemoControlGroup,
  DemoDateChip,
  DemoProfilePicker,
  DemoTypeToggle,
} from "@/components/marketing/demo/demo-controls";
import {
  DemoDraftRows,
  type DemoDraft,
} from "@/components/marketing/demo/demo-draft-rows";
import { demoCategories, demoCategory } from "@/components/marketing/demo/demo-data";
import { useDemoFeed } from "@/components/marketing/demo/use-demo-feed";
import {
  useScriptedDemo,
  type ScriptAt,
} from "@/components/marketing/demo/use-scripted-demo";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  demoAmountInput,
  useDemoMoney,
  type DemoMoneyFormat,
} from "@/hooks/use-demo-currency";
import { bulkDelimiter, parseBulk } from "@/lib/bulk-parser";
import { featureLink, featurePath, getFeature } from "@/lib/features";
import { formatMoney, signedMinor, toMinorUnits } from "@/lib/money";
import { comboFor } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * "Four ways to add a transaction" — one widget, stepped through by scrolling.
 *
 * The four methods used to be tabs. Tabs put the burden on the reader: nothing
 * happens unless they think to click, and three quarters of the section sits
 * hidden at any moment — which also kept three quarters of the copy out of the
 * server HTML until it was forced to mount. Stepping on scroll inverts that:
 * the reader keeps reading, the composer keeps changing under their eye, and
 * every method's copy is simply on the page.
 *
 * The widget mirrors the app's own layout — history above, composer pinned to
 * the bottom, input where your hands already are. Every method ends the same
 * way, with what you entered sitting in the feed as ordinary transactions,
 * which is the actual argument: four different inputs, one result.
 *
 * Nothing here calls a model, records audio, or saves anything. The composer
 * fields are `readOnly` on purpose — this is a film of the app, not a fork of
 * it, and a field you can type into but that does nothing is worse than one
 * that plainly isn't yours.
 */

type Method = "chat" | "ai" | "voice" | "bulk";

const METHODS: {
  id: Method;
  label: string;
  icon: typeof MessageSquare;
  slug: string;
  heading: string;
  body: string;
  link: string;
  caption: string;
}[] = [
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    slug: "chat-expense-tracker",
    heading: "Two fields and a send key",
    body: "The amount goes in the left box, what it was for in the right, and the category is a chip you tap on the way past. Hit send and it's a bubble in the feed with your balance updated above it — no form, no save dialog, no page change.",
    link: "See how chat entry works",
    caption: "The composer, filling itself in",
  },
  {
    id: "ai",
    label: "AI",
    icon: Sparkles,
    slug: "ai-expense-tracker",
    heading: "Write it the way you'd say it",
    body: "One box, plain language, however it comes out. The AI splits the sentence into transactions and guesses the categories from your own list — then stops and waits for you to check them. Nothing saves on its own.",
    link: "See how AI entry works",
    caption: "One sentence, several transactions",
  },
  {
    id: "voice",
    label: "Voice",
    icon: Mic,
    slug: "voice-expense-tracker",
    heading: "Hold one key and say it",
    body: "The mic sits in the same note box. Hold it, speak, let go: the words appear as you talk, then land as drafts you confirm. Name several languages and a sentence that mixes them still comes back as spoken.",
    link: "See how voice entry works",
    caption: "Transcribed, then the audio is discarded",
  },
  {
    id: "bulk",
    label: "Bulk paste",
    icon: ListPlus,
    slug: "bulk-add",
    heading: "Paste rows straight from a spreadsheet",
    body: "One transaction per line — amount, note, category, type, date. Every keystroke re-parses, so you see exactly what would be saved, and anything that needs fixing, before a single record is.",
    link: "See how bulk import works",
    caption: "The real parser, on every keystroke",
  },
];

type Stage =
  | "idle"
  | "chat-amount"
  | "chat-title"
  | "chat-send"
  | "ai-typing"
  | "ai-parsing"
  | "ai-review"
  | "voice-recording"
  | "voice-transcribing"
  | "voice-parsing"
  | "voice-review"
  | "bulk-typing"
  | "bulk-preview"
  | "saved";

/** A block caret, appended to the value being typed rather than overlaid — an
 * absolutely-positioned one has to reproduce the field's metrics exactly. */
const CARET = "▌";

const CHAR_MS = 42;
const HOLD_MS = 420;
const PARSE_MS = 900;
const ROW_STAGGER_MS = 150;
const INTERIM_MS = 520;
const LEVEL_TICK_MS = 90;
const BULK_TODAY = "2026-08-21";

/**
 * Seeded in USD minor units; converted per visitor by `demoAmountInput`.
 * Keep these the size of the thing they name — a demo full of $360 coffees
 * reads as a mock-up, and once the multiplier lands it reads as broken.
 */
const CHAT_AMOUNT_MINOR = 360;
const CHAT_TITLE = "Afternoon coffee";

function aiNoteFor(money: DemoMoneyFormat): string {
  return `lunch ${demoAmountInput(1250, money)}, groceries ${demoAmountInput(6200, money)}, and ${demoAmountInput(4000, money)} for the taxi home`;
}

function aiDraftsFor(money: DemoMoneyFormat): DemoDraft[] {
  return [
    { key: 1, type: "expense", amount: demoAmountInput(1250, money), title: "Lunch", categoryName: "Food & Dining" },
    { key: 2, type: "expense", amount: demoAmountInput(6200, money), title: "Groceries", categoryName: "Groceries" },
    { key: 3, type: "expense", amount: demoAmountInput(4000, money), title: "Taxi home", categoryName: "Transport" },
  ];
}

/** Hinglish on purpose — mixed-language speech is the case voice is built for. */
const VOICE_INTERIM = ["chai", "chai 20", "chai 20 aur", "chai 20 aur groceries 620"];
const VOICE_TRANSCRIPT = "chai 20 aur groceries 620";

function voiceDraftsFor(money: DemoMoneyFormat): DemoDraft[] {
  return [
    { key: 1, type: "expense", amount: demoAmountInput(25, money), title: "Chai", categoryName: "Food & Dining" },
    { key: 2, type: "expense", amount: demoAmountInput(775, money), title: "Groceries", categoryName: "Groceries" },
  ];
}

/** Built for the visitor's separators — see `demoAmountInput`. */
function bulkRowsFor(money: DemoMoneyFormat): string[] {
  const delimiter = bulkDelimiter("", money.locale);
  const join = delimiter === "\t" ? "\t" : `${delimiter} `;
  return [
    [demoAmountInput(1250, money), "Lunch with the team", "Food & Dining", "expense"],
    [demoAmountInput(6200, money), "Weekly groceries", "Groceries", "expense"],
    [demoAmountInput(200000, money), "August salary", "Salary", "income"],
  ].map((row) => row.join(join));
}

export function EntryMethods({ header }: { header: ReactNode }) {
  const money = useDemoMoney();
  const reduced = useReducedMotion();
  const feed = useDemoFeed("Personal");

  const [active, setActive] = useState<Method>("chat");
  const [stage, setStage] = useState<Stage>("idle");

  const [amountText, setAmountText] = useState("");
  const [titleText, setTitleText] = useState("");
  const [note, setNote] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [interimIdx, setInterimIdx] = useState(0);
  const [level, setLevel] = useState(0);
  const [drafts, setDrafts] = useState<DemoDraft[]>([]);
  const [visibleDrafts, setVisibleDrafts] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  // The observer switches methods from outside React's render, so the script
  // reads the method from a ref rather than from state one commit behind.
  const methodRef = useRef<Method>("chat");

  const chatAmount = demoAmountInput(CHAT_AMOUNT_MINOR, money);
  const aiNote = aiNoteFor(money);
  const aiDrafts = useMemo(() => aiDraftsFor(money), [money]);
  const voiceDrafts = useMemo(() => voiceDraftsFor(money), [money]);
  const bulkRows = useMemo(() => bulkRowsFor(money), [money]);

  const resetSurface = useCallback(() => {
    feed.reset();
    setAmountText("");
    setTitleText("");
    setNote("");
    setBulkText("");
    setInterimIdx(0);
    setLevel(0);
    setDrafts([]);
    setVisibleDrafts(0);
  }, [feed]);

  const commit = useCallback(
    (rows: DemoDraft[]) => {
      feed.addMany(
        rows.map((row) => ({
          type: row.type,
          amountMinor: toMinorUnits(row.amount, money.code, money.locale),
          title: row.title,
          categoryName: row.categoryName || "Other",
          categoryIcon: demoCategory(row.categoryName)?.icon ?? "💸",
        })),
      );
    },
    [feed, money.code, money.locale],
  );

  const bulkDraftsFromText = useCallback(
    (text: string): DemoDraft[] =>
      parseBulk(text, BULK_TODAY, money.locale).drafts.map((draft, i) => ({
        key: i,
        type: draft.type,
        amount: String(draft.amount),
        title: draft.title || draft.note || "Transaction",
        categoryName: draft.categoryName ?? "",
      })),
    [money.locale],
  );

  const play = useCallback((at: ScriptAt) => {
    const method = methodRef.current;
    resetSurface();

    // Reduced motion lands on the same outcome the animation reaches, so
    // nothing is lost except the movement.
    if (reduced) {
      if (method === "chat") {
        commit([{ key: 0, type: "expense", amount: chatAmount, title: CHAT_TITLE, categoryName: "Food & Dining" }]);
      } else if (method === "ai") {
        setNote(aiNote);
        commit(aiDrafts);
      } else if (method === "voice") {
        setNote(VOICE_TRANSCRIPT);
        commit(voiceDrafts);
      } else {
        commit(bulkDraftsFromText(bulkRows.join("\n")));
      }
      setStage("saved");
      return;
    }

    if (method === "chat") {
      setStage("chat-amount");
      for (let i = 1; i <= chatAmount.length; i++) {
        at(i * CHAR_MS, () => setAmountText(chatAmount.slice(0, i)));
      }
      const titleStart = chatAmount.length * CHAR_MS + HOLD_MS;
      at(titleStart, () => setStage("chat-title"));
      for (let i = 1; i <= CHAT_TITLE.length; i++) {
        at(titleStart + i * CHAR_MS, () => setTitleText(CHAT_TITLE.slice(0, i)));
      }
      const sendAt = titleStart + CHAT_TITLE.length * CHAR_MS + HOLD_MS;
      at(sendAt, () => setStage("chat-send"));
      at(sendAt + 260, () => {
        commit([{ key: 0, type: "expense", amount: chatAmount, title: CHAT_TITLE, categoryName: "Food & Dining" }]);
        setAmountText("");
        setTitleText("");
        setStage("saved");
      });
      return;
    }

    if (method === "ai") {
      setStage("ai-typing");
      for (let i = 1; i <= aiNote.length; i++) {
        at(i * CHAR_MS, () => setNote(aiNote.slice(0, i)));
      }
      const parseAt = aiNote.length * CHAR_MS + HOLD_MS;
      at(parseAt, () => setStage("ai-parsing"));
      const reviewAt = parseAt + PARSE_MS;
      at(reviewAt, () => {
        setDrafts(aiDrafts);
        setVisibleDrafts(0);
        setStage("ai-review");
      });
      aiDrafts.forEach((_, i) =>
        at(reviewAt + i * ROW_STAGGER_MS, () => setVisibleDrafts(i + 1)),
      );
      at(reviewAt + aiDrafts.length * ROW_STAGGER_MS + 1200, () => {
        commit(aiDrafts);
        setDrafts([]);
        setNote("");
        setStage("saved");
      });
      return;
    }

    if (method === "voice") {
      setStage("voice-recording");
      const recordingMs = VOICE_INTERIM.length * INTERIM_MS + 300;
      // A deterministic two-sine waveform, scheduled as beats so one
      // `clearTimers` cancels it — an interval would outlive the script.
      for (let t = 1; t * LEVEL_TICK_MS < recordingMs; t++) {
        at(t * LEVEL_TICK_MS, () =>
          setLevel(
            Math.min(
              1,
              0.28 + 0.34 * Math.abs(Math.sin(t / 3.1)) + 0.22 * Math.abs(Math.sin(t / 1.7)),
            ),
          ),
        );
      }
      VOICE_INTERIM.forEach((_, i) => at(i * INTERIM_MS, () => setInterimIdx(i)));

      at(recordingMs, () => {
        setLevel(0);
        setStage("voice-transcribing");
      });
      const parseAt = recordingMs + 900;
      at(parseAt, () => {
        setNote(VOICE_TRANSCRIPT);
        setStage("voice-parsing");
      });
      const reviewAt = parseAt + PARSE_MS;
      at(reviewAt, () => {
        setDrafts(voiceDrafts);
        setVisibleDrafts(0);
        setStage("voice-review");
      });
      voiceDrafts.forEach((_, i) =>
        at(reviewAt + i * ROW_STAGGER_MS, () => setVisibleDrafts(i + 1)),
      );
      at(reviewAt + voiceDrafts.length * ROW_STAGGER_MS + 1200, () => {
        commit(voiceDrafts);
        setDrafts([]);
        setNote("");
        setStage("saved");
      });
      return;
    }

    setStage("bulk-typing");
    const rowCharMs = CHAR_MS * 0.45;
    let elapsed = 0;
    bulkRows.forEach((row, index) => {
      for (let i = 1; i <= row.length; i++) {
        at(elapsed + i * rowCharMs, () =>
          setBulkText([...bulkRows.slice(0, index), row.slice(0, i)].join("\n")),
        );
      }
      elapsed += row.length * rowCharMs + 200;
    });
    at(elapsed, () => setStage("bulk-preview"));
    at(elapsed + 1500, () => {
      commit(bulkDraftsFromText(bulkRows.join("\n")));
      setBulkText("");
      setStage("saved");
    });
  }, [
    aiDrafts,
    aiNote,
    bulkDraftsFromText,
    bulkRows,
    chatAmount,
    commit,
    reduced,
    resetSurface,
    voiceDrafts,
  ]);

  const { containerRef, clearTimers, start, run } = useScriptedDemo(play, {
    autoPlay: false,
  });

  /**
   * One observer over the four steps: whichever holds the middle band of the
   * viewport is the active method, and switching to it replays its script.
   *
   * `rootMargin` collapses the viewport to a thin strip through its centre, so
   * exactly one step qualifies at a time and the widget can't flicker between
   * two of them at a boundary. `setActive` runs in a callback, never an effect
   * body — which is both the lint rule and why the typing doesn't stutter.
   */
  useEffect(() => {
    const els = stepRefs.current.filter(Boolean) as HTMLDivElement[];
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.getAttribute("data-method") as Method | null;
          if (!id || id === methodRef.current) continue;
          methodRef.current = id;
          setActive(id);
          clearTimers();
          run();
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [clearTimers, run]);

  // Keep the newest bubble in view, inside the widget's own scroller.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.txns, stage]);

  const method = METHODS.find((m) => m.id === active) ?? METHODS[0];
  const mode: EntryMode = active === "chat" ? "manual" : "ai";
  const showingDrafts = stage === "ai-review" || stage === "voice-review";
  const voiceState =
    stage === "voice-recording"
      ? "recording"
      : stage === "voice-transcribing"
        ? "transcribing"
        : "idle";

  const bulkParsed = useMemo(
    () => parseBulk(bulkText, BULK_TODAY, money.locale),
    [bulkText, money.locale],
  );

  const cats = useMemo(
    () =>
      demoCategories("expense").map((c) => ({
        id: `expense:${c.name}`,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
      })),
    [],
  );

  return (
    <div ref={containerRef} className="relative">
      {/*
        Scroll drivers. They render nothing — their only jobs are to give the
        section its length and to tell the observer which method the reader has
        reached. The visible row is pinned over the top of them, so the copy
        swaps in place instead of travelling up the page and colliding with the
        section heading above it.
      */}
      <div aria-hidden>
        {METHODS.map((m, i) => (
          <div
            key={m.id}
            data-method={m.id}
            ref={(el) => {
              stepRefs.current[i] = el;
            }}
            className="h-[70vh]"
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-0">
        {/*
          The whole unit pins: the section's heading and description stay put
          while only the method underneath them changes. Pinning the heading is
          what keeps it from scrolling away and, with the copy held in its own
          slot below, what guarantees the two can never collide.
        */}
        <div className="pointer-events-auto sticky top-20 lg:top-24">
          <div className="mx-auto max-w-2xl text-center">{header}</div>

          <div className="mt-6 lg:mt-10 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12">
      <div className="lg:order-2">
        <DemoFrame
          label="Interactive entry demo"
          sidebar={false}
          className="h-[min(20rem,calc(100svh-26rem))] lg:h-[min(38rem,calc(100svh-20rem))]"
          header={
            <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
              <DemoSummaryBar
                label="August"
                balanceMinor={feed.balanceMinor}
                incomeMinor={feed.totals.incomeMinor}
                expenseMinor={feed.totals.expenseMinor}
                className="min-w-0 flex-1"
              />
              <DemoProfilePicker profile={feed.profile} onChange={feed.setProfile} />
            </div>
          }
          bodyClassName="overflow-hidden"
          footer={
            <div className="flex shrink-0 flex-col gap-2 border-t bg-muted/20 px-4 py-3">
              <div className={MODE_ROW_DENSE}>
                <EntryModeToggle mode={mode} onChange={() => {}} dense pane={mode} />
                {active === "chat" ? (
                  <DemoControlGroup>
                    <DemoTypeToggle dense type="expense" onChange={() => {}} />
                    <DemoDateChip />
                    <div className="min-w-0 flex-1">
                      <CategoryRow
                        dense
                        categories={cats}
                        value="expense:Food & Dining"
                        onChange={() => {}}
                      />
                    </div>
                  </DemoControlGroup>
                ) : (
                  <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {showingDrafts
                      ? `Review ${drafts.length} transaction${drafts.length === 1 ? "" : "s"}`
                      : method.caption}
                  </p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={start}
                  className="ml-auto h-8 shrink-0 gap-1.5 text-xs text-muted-foreground"
                >
                  Replay
                </Button>
              </div>

              {active === "chat" && (
                <div className="flex items-end gap-2">
                  <div className="relative shrink-0">
                    <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                      {money.currency.symbol}
                    </span>
                    <Input
                      readOnly
                      value={stage === "chat-amount" ? `${amountText}${CARET}` : amountText}
                      placeholder={demoAmountInput(0, money)}
                      aria-label="Amount"
                      className={cn(
                        "h-9 w-28 pl-7 tabular-nums",
                        stage === "chat-amount" && "ring-2 ring-ring/50",
                      )}
                    />
                  </div>
                  <Input
                    readOnly
                    value={stage === "chat-title" ? `${titleText}${CARET}` : titleText}
                    placeholder="What was it for?"
                    aria-label="Title"
                    className={cn(
                      "h-9 min-w-0 flex-1",
                      stage === "chat-title" && "ring-2 ring-ring/50",
                    )}
                  />
                  <Button
                    type="button"
                    aria-label="Send transaction"
                    className={cn(
                      "h-9 shrink-0 gap-1.5 px-3 transition-transform",
                      stage === "chat-send" && "scale-90",
                    )}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                </div>
              )}

              {(active === "ai" || active === "voice") &&
                (showingDrafts ? (
                  <>
                    {note && (
                      <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                        {note}
                      </p>
                    )}
                    <DemoDraftRows
                      rows={drafts}
                      visible={visibleDrafts}
                      onPatch={() => {}}
                      onRemove={() => {}}
                    />
                    <div className="flex items-center justify-end">
                      <Button type="button" className={cn("h-9 gap-1.5", AI_BTN)}>
                        <ArrowUp className="size-4" /> Add {drafts.length}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {active === "voice" && voiceState !== "idle" && (
                      <VoiceListeningStrip
                        state={voiceState}
                        interim={VOICE_INTERIM[interimIdx] ?? ""}
                        level={level}
                        liveSupported
                      />
                    )}
                    <div className="relative flex flex-col">
                      <Textarea
                        readOnly
                        rows={2}
                        value={stage === "ai-typing" ? `${note}${CARET}` : note}
                        placeholder={
                          active === "voice"
                            ? "Hold the mic and say what you spent"
                            : "Describe your spending"
                        }
                        aria-label="Describe your transactions"
                        className="min-h-[4.625rem] resize-none pr-20 pb-10"
                      />
                      <div className="absolute right-1.5 bottom-1 flex items-center gap-1">
                        {active === "voice" && (
                          <VoiceMicButton
                            state={voiceState}
                            level={level}
                            onStart={() => {}}
                            onStop={() => {}}
                            hint={`hold ${comboFor("tracker.voice").toUpperCase()}`}
                            dense
                          />
                        )}
                        <Button
                          type="button"
                          aria-label="Turn your note into transactions"
                          className={cn("size-8 shrink-0 rounded-full p-0", AI_BTN)}
                        >
                          {stage === "ai-parsing" || stage === "voice-parsing" ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ArrowUp className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

              {active === "bulk" && (
                <div className="flex flex-col gap-2">
                  <Textarea
                    readOnly
                    rows={3}
                    value={stage === "bulk-typing" ? `${bulkText}${CARET}` : bulkText}
                    placeholder="Paste rows here — one transaction per line"
                    aria-label="Paste transactions"
                    spellCheck={false}
                    className="resize-none font-mono text-xs"
                  />
                  {bulkParsed.drafts.length > 0 && (
                    <div className="max-h-24 overflow-y-auto rounded-lg border">
                      <ul className="divide-y text-sm">
                        {bulkParsed.drafts.map((draft, i) => (
                          <li
                            key={i}
                            className="flex items-center justify-between gap-3 px-3 py-1.5"
                          >
                            <span className="min-w-0 truncate">
                              {draft.title || draft.note}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 tabular-nums",
                                draft.type === "income" &&
                                  "text-emerald-600 dark:text-emerald-400",
                              )}
                            >
                              {/* The app's own formatter, so the preview groups
                                  thousands and places the sign exactly as the
                                  feed above it will. The parser hands back
                                  major units; `toMinorUnits` is the only
                                  sanctioned way across that boundary. */}
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
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {bulkParsed.drafts.length} ready
                    </p>
                    <Button type="button" className="h-9 gap-1.5">
                      <ArrowUp className="size-4" /> Import {bulkParsed.drafts.length}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          }
        >
          <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-3">
            {/* Bottom-anchored, like the app's chat feed — and the section's
                argument: whichever way it went in, it ends up here. */}
            <div className="flex min-h-full flex-col justify-end">
              <DemoFeed txns={feed.txns} />
            </div>
          </div>
        </DemoFrame>
      </div>

      {/*
        One slot, four pieces of copy. All four stay in the document — the
        inactive ones are stacked underneath at zero opacity rather than
        unmounted, so every method's description is in the server-rendered HTML
        and readable by assistive tech in order, while a sighted reader sees one
        at a time. `min-h` holds the slot open at the tallest of them, so the
        widget beside it doesn't shift as they swap.
      */}
      <div className="relative mb-6 min-h-[13rem] lg:order-1 lg:mb-0 lg:min-h-[17rem]">
        {METHODS.map((m) => {
          const isActive = m.id === active;
          const target = getFeature(m.slug);
          return (
            <div
              key={m.id}
              className={cn(
                "flex flex-col transition-opacity duration-500",
                isActive
                  ? "relative opacity-100"
                  : "pointer-events-none absolute inset-0 opacity-0",
              )}
            >
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3 py-1 text-xs text-background">
                <m.icon className="size-3.5" />
                {m.label}
              </span>
              <h3 className="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">
                {m.heading}
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{m.body}</p>
              <Link
                href={target ? featurePath(target.slug) : featureLink(m.slug)}
                data-track-event="nav_link_click"
                data-track-params={JSON.stringify({
                  location: "home_entry_methods",
                  label: m.slug,
                })}
                className="mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-medium underline underline-offset-4"
              >
                {m.link}
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          );
        })}
      </div>
          </div>
        </div>
      </div>
    </div>
  );
}
