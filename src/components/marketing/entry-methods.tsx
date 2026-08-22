"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  ListPlus,
  Loader2,
  MessageSquare,
  Mic,
  Play,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AI_BTN } from "@/components/app/ai-accent";
import { CategoryRow } from "@/components/app/category-row";
import { VoiceListeningStrip, VoiceMicButton } from "@/components/app/voice-mic";
import { DemoFeed } from "@/components/marketing/demo/demo-feed";
import {
  DemoControlGroup,
  DemoDateChip,
  DemoTypeToggle,
} from "@/components/marketing/demo/demo-controls";
import {
  DemoDraftRows,
  patchDraft,
  type DemoDraft,
} from "@/components/marketing/demo/demo-draft-rows";
import {
  DEMO_SEEDS,
  demoCategories,
  type DemoTxn,
  type DemoTxnType,
} from "@/components/marketing/demo/demo-data";
import { useScriptedDemo } from "@/components/marketing/demo/use-scripted-demo";
import {
  demoAmountInput,
  useDemoMoney,
  type DemoMoneyFormat,
} from "@/hooks/use-demo-currency";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { featurePath, getFeature } from "@/lib/features";
import { bulkDelimiter, parseBulk } from "@/lib/bulk-parser";
import { formatMoney, signedMinor, toMinorUnits } from "@/lib/money";
import { amountPlaceholder } from "@/lib/parse-amount";
import { comboFor } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * "Four ways to add a transaction" — the homepage's routing section.
 *
 * It used to show each method's *result*: a feed, some draft rows, a
 * transcript. That answered the wrong question. Nobody abandons a money tracker
 * because they doubt it can store a number — they abandon it because entering
 * one is a chore. So each tab now animates the **input**: the fields you'd type
 * into, the key you'd hold, the box you'd paste into, with the result arriving
 * afterwards as a consequence rather than as the subject.
 *
 * Everything on screen is the app's own: the real `CategoryRow`, the real
 * `VoiceMicButton` and `VoiceListeningStrip`, the shared `DemoDraftRows`, the
 * one sanctioned AI gradient from `AI_BTN`, and the real `parseBulk` running on
 * every keystroke. The scripts are fixed — a marketing page calls no model and
 * asks for no microphone — but the surface they drive can't drift from the
 * product the way a screenshot would.
 *
 * All four run on one engine (`useScriptedDemo`): timers in a ref, an `at()`
 * scheduler, and a single play-on-scroll-into-view. State lives here rather
 * than in four panel components so that `play()` can be called from an event
 * handler — the tab switch, the Replay button, the observer — and never from an
 * effect body, which `react-hooks/set-state-in-effect` rightly rejects.
 *
 * The initial render is the **finished** state of every tab, not an empty box.
 * A crawler reads the server HTML and nothing else, so the drafts and the
 * bubble have to be in it; and a panel that fills in after mount would reserve
 * no height until it did. The panel is pinned to one height across all four
 * tabs for the same reason — switching tabs must not move the page.
 */

/** Fixed so nothing reads the clock during render — see `demo-data.ts`. */
const BULK_TODAY = "2026-08-01";

/** Beat lengths. Slow enough to read, short enough that nobody waits. */
const CHAR_MS = 42;
const LINE_MS = 300;
const FIELD_PAUSE_MS = 340;
const SEND_MS = 420;
const PARSE_MS = 1100;
const TRANSCRIBE_MS = 850;
const INTERIM_MS = 520;
const LEVEL_TICK_MS = 90;
const ROW_STAGGER_MS = 150;
const HOLD_MS = 420;

/** The block caret that trails the text being typed. */
const CARET = "▌";

/** Both AI and voice resolve to two drafts; the reveal counter starts full. */
const DRAFT_COUNT = 2;

type Method = "chat" | "ai" | "voice" | "bulk";

type Stage =
  | "done"
  | "chat-amount"
  | "chat-title"
  | "chat-send"
  | "ai-typing"
  | "ai-parsing"
  | "voice-recording"
  | "voice-transcribing"
  | "voice-parsing"
  | "bulk-typing";

/* ---------------------------------------------------------------- scripts -- */

/** What the chat tab types, and the bubble it produces. Seeded in USD minor
 * units: `demoAmountInput` renders what a visitor would *type*, `DemoFeed`
 * converts the same seed for what gets *stored*, so the two always agree. */
const CHAT_SEED_MINOR = 450;
const CHAT_TITLE = "Afternoon coffee";

const CHAT_ADDED: DemoTxn = {
  id: 900,
  type: "expense",
  amountMinor: CHAT_SEED_MINOR,
  title: CHAT_TITLE,
  categoryName: "Food & Dining",
  categoryIcon: "🍽️",
  // A fixed label, never `new Date()` — this row is server-rendered.
  timeLabel: "4:20 PM",
};

/** Two rows of history, so the new bubble lands in a feed rather than a void. */
const CHAT_HISTORY = DEMO_SEEDS.Personal.slice(3);

function aiNoteFor(money: DemoMoneyFormat): string {
  return `coffee ${demoAmountInput(450, money)} and ${demoAmountInput(6200, money)} on groceries`;
}

/** The partial recognitions the listening strip shows while "recording". */
function voiceInterimFor(money: DemoMoneyFormat): string[] {
  const a = demoAmountInput(450, money);
  const b = demoAmountInput(6200, money);
  return ["coffee", `coffee ${a}`, `coffee ${a} and`, `coffee ${a} and ${b} on groceries`];
}

function draftsFor(money: DemoMoneyFormat): DemoDraft[] {
  return [
    {
      key: 1,
      type: "expense",
      amount: demoAmountInput(450, money),
      title: "Coffee",
      categoryName: "Food & Dining",
    },
    {
      key: 2,
      type: "expense",
      amount: demoAmountInput(6200, money),
      title: "Groceries",
      categoryName: "Groceries",
    },
  ];
}

/** Built for the visitor's separators — see `demoAmountInput`. */
function bulkSampleFor(money: DemoMoneyFormat): string {
  const delimiter = bulkDelimiter("", money.locale);
  const join = delimiter === "\t" ? "\t" : `${delimiter} `;
  return [
    [demoAmountInput(1250, money), "Lunch with the team", "Food & Dining", "expense"],
    [demoAmountInput(6200, money), "Weekly groceries", "Groceries", "expense"],
    [demoAmountInput(200000, money), "August salary", "Salary", "income"],
  ]
    .map((row) => row.join(join))
    .join("\n");
}

const METHODS = [
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    slug: "chat-expense-tracker",
    link: "See how chat entry works",
    caption: "The composer, filling itself in",
    heading: "Two fields and a send key",
    body: "The amount goes in the left box, what it was for in the right, and the category is a chip you tap on the way past. Hit send and it's a bubble in the feed with your balance updated above it — no form, no save dialog, no page change.",
  },
  {
    id: "ai",
    label: "AI",
    icon: Sparkles,
    slug: "ai-expense-tracker",
    link: "See how AI entry works",
    caption: "One box, one messy sentence",
    heading: "Write it the way you'd say it",
    body: "One box, plain language, however it comes out. The AI splits the sentence into transactions and guesses the categories from your own list — then stops and waits for you to check them. Nothing saves on its own.",
  },
  {
    id: "voice",
    label: "Voice",
    icon: Mic,
    slug: "voice-expense-tracker",
    link: "See how voice entry works",
    caption: "Hold the mic, watch the words arrive",
    heading: "Hold one key and say it",
    body: "The mic sits in the same note box. Hold it, speak, let go: the words appear as you talk, then land as drafts you confirm. Name several languages and a sentence that mixes them still comes back as spoken.",
  },
  {
    id: "bulk",
    label: "Bulk paste",
    icon: ListPlus,
    slug: "bulk-add",
    link: "See how bulk import works",
    caption: "Rows in, parsed preview out",
    heading: "Paste rows straight from a spreadsheet",
    body: "One transaction per line — amount, note, category, type, date. Every keystroke re-parses, so you see exactly what would be saved, and anything that needs fixing, before a single record is.",
  },
] as const;

/* ------------------------------------------------------------- component -- */

export function EntryMethods() {
  const money = useDemoMoney();
  const reduced = useReducedMotion();

  const [tab, setTab] = useState<Method>("chat");
  // Read by `play()`, which the observer calls from outside React's render —
  // `tab` state would be one commit behind on a tab switch.
  const tabRef = useRef<Method>("chat");

  const [stage, setStage] = useState<Stage>("done");

  // `null` means "untouched", so every sample follows the detected currency
  // once it resolves after hydration. Seeding state directly would freeze
  // whatever the server rendered in USD.
  const [noteOverride, setNoteOverride] = useState<string | null>(null);
  const [bulkOverride, setBulkOverride] = useState<string | null>(null);
  const [draftsOverride, setDraftsOverride] = useState<DemoDraft[] | null>(null);

  const [amountText, setAmountText] = useState("");
  const [titleText, setTitleText] = useState("");
  const [chatSent, setChatSent] = useState(true);
  const [chatType, setChatType] = useState<DemoTxnType>("expense");

  const [visibleRows, setVisibleRows] = useState(DRAFT_COUNT);
  const [interimIdx, setInterimIdx] = useState(0);
  const [level, setLevel] = useState(0);

  const feedRef = useRef<HTMLDivElement>(null);

  const chatCats = useMemo(
    () =>
      demoCategories(chatType).map((c) => ({
        // The default set has an "Other" of each kind, so the kind belongs in
        // the key even though only one kind is on screen at a time.
        id: `${c.kind}:${c.name}`,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
      })),
    [chatType],
  );
  const [categoryId, setCategoryId] = useState<string | null>("expense:Food & Dining");

  const aiNote = aiNoteFor(money);
  const voiceInterim = voiceInterimFor(money);
  const voiceTranscript = voiceInterim[voiceInterim.length - 1];
  const drafts = draftsOverride ?? draftsFor(money);
  const note = noteOverride ?? (tab === "voice" ? voiceTranscript : aiNote);
  const bulkText = bulkOverride ?? bulkSampleFor(money);

  // The real parser, running in the browser on whatever is in the box. It's a
  // pure function over a string, so the preview is genuinely the app's answer
  // rather than a mock-up of one.
  const bulk = useMemo(
    () => parseBulk(bulkText, BULK_TODAY, money.locale),
    [bulkText, money.locale],
  );
  const delimiter = useMemo(() => bulkDelimiter("", money.locale), [money.locale]);

  const chatTxns = chatSent ? [...CHAT_HISTORY, CHAT_ADDED] : CHAT_HISTORY;
  const chatAmount = demoAmountInput(CHAT_SEED_MINOR, money);

  /* ------------------------------------------------------------- engine -- */

  /** Everything back to the resting state — the reduced-motion path, and the
   * clean slate each script starts from. */
  function reset() {
    setStage("done");
    setNoteOverride(null);
    setBulkOverride(null);
    setDraftsOverride(null);
    setAmountText("");
    setTitleText("");
    setChatSent(true);
    setVisibleRows(DRAFT_COUNT);
    setInterimIdx(0);
    setLevel(0);
  }

  function play() {
    reset();
    if (reduced) return;
    switch (tabRef.current) {
      case "chat":
        return playChat();
      case "ai":
        return playAi();
      case "voice":
        return playVoice(true);
      case "bulk":
        return playBulk();
    }
  }

  const { containerRef, at, clearTimers, start } = useScriptedDemo(play);

  function playChat() {
    setChatSent(false);
    setAmountText("");
    setTitleText("");
    setCategoryId("expense:Food & Dining");
    setStage("chat-amount");

    for (let i = 1; i <= chatAmount.length; i++) {
      at(i * CHAR_MS, () => setAmountText(chatAmount.slice(0, i)));
    }

    const titleStart = chatAmount.length * CHAR_MS + FIELD_PAUSE_MS;
    at(titleStart, () => setStage("chat-title"));
    for (let i = 1; i <= CHAT_TITLE.length; i++) {
      at(titleStart + i * CHAR_MS, () => setTitleText(CHAT_TITLE.slice(0, i)));
    }

    const sendAt = titleStart + CHAT_TITLE.length * CHAR_MS + FIELD_PAUSE_MS;
    at(sendAt, () => setStage("chat-send"));
    at(sendAt + SEND_MS, () => {
      setStage("done");
      setAmountText("");
      setTitleText("");
      setChatSent(true);
    });
  }

  function playAi() {
    setNoteOverride("");
    setVisibleRows(0);
    setStage("ai-typing");

    for (let i = 1; i <= aiNote.length; i++) {
      at(i * CHAR_MS, () => setNoteOverride(aiNote.slice(0, i)));
    }

    const parseAt = aiNote.length * CHAR_MS + FIELD_PAUSE_MS;
    at(parseAt, () => setStage("ai-parsing"));

    const reviewAt = parseAt + PARSE_MS;
    at(reviewAt, () => {
      setNoteOverride(null);
      setStage("done");
    });
    for (let i = 0; i < DRAFT_COUNT; i++) {
      at(reviewAt + i * ROW_STAGGER_MS, () => setVisibleRows(i + 1));
    }
  }

  /**
   * Scripted dictation. **No microphone is requested** — a landing page asking
   * for mic permission is a bounce, and the browser would be right to treat it
   * as hostile. The level meter runs on a deterministic waveform: two
   * out-of-phase sines read as speech, where one reads as a metronome.
   *
   * `autoStop` is for the autoplay path, where nobody is holding the button. A
   * real hold ends when the pointer lifts, which is what the mic button does.
   */
  function playVoice(autoStop: boolean) {
    setNoteOverride("");
    setDraftsOverride(null);
    setVisibleRows(0);
    setInterimIdx(0);
    setStage("voice-recording");

    const recordMs = voiceInterim.length * INTERIM_MS;
    // Level ticks are scheduled as timeouts rather than an interval so the one
    // `clearTimers` the engine owns cancels them too.
    const ticks = Math.ceil((autoStop ? recordMs : recordMs * 3) / LEVEL_TICK_MS);
    for (let i = 1; i <= ticks; i++) {
      const value =
        0.28 + 0.34 * Math.abs(Math.sin(i / 3.1)) + 0.22 * Math.abs(Math.sin(i / 1.7));
      at(i * LEVEL_TICK_MS, () => setLevel(Math.min(1, value)));
    }

    voiceInterim.forEach((_, i) => at(i * INTERIM_MS, () => setInterimIdx(i)));

    if (autoStop) at(recordMs + HOLD_MS, () => finishVoice());
  }

  /** Everything after the mic is released: transcribe → parse → drafts. */
  function finishVoice() {
    clearTimers();
    setLevel(0);
    setStage("voice-transcribing");

    at(TRANSCRIBE_MS, () => {
      setNoteOverride(null);
      setStage("voice-parsing");
    });

    const reviewAt = TRANSCRIBE_MS + PARSE_MS;
    at(reviewAt, () => {
      setStage("done");
      setVisibleRows(0);
    });
    for (let i = 0; i < DRAFT_COUNT; i++) {
      at(reviewAt + i * ROW_STAGGER_MS, () => setVisibleRows(i + 1));
    }
  }

  function playBulk() {
    const sample = bulkSampleFor(money);
    const lines = sample.split("\n");
    setBulkOverride("");
    setStage("bulk-typing");

    lines.forEach((_, i) => {
      at((i + 1) * LINE_MS, () => setBulkOverride(lines.slice(0, i + 1).join("\n")));
    });
    at(lines.length * LINE_MS + FIELD_PAUSE_MS, () => {
      setBulkOverride(null);
      setStage("done");
    });
  }

  function selectTab(next: string) {
    const method = next as Method;
    tabRef.current = method;
    setTab(method);
    start();
  }

  // Keep the newest bubble in view. Scoped to the panel's own scroller, so it
  // never moves the page under the reader.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatSent, tab]);

  /* ----------------------------------------------------------- rendering -- */

  const voiceState =
    stage === "voice-recording"
      ? "recording"
      : stage === "voice-transcribing"
        ? "transcribing"
        : "idle";

  const aiStatus =
    stage === "ai-typing"
      ? "Waiting for the sentence."
      : stage === "ai-parsing"
        ? "Reading it."
        : `Review ${drafts.length} draft${drafts.length === 1 ? "" : "s"}, then save.`;

  const voiceStatus =
    stage === "voice-recording"
      ? "Listening."
      : stage === "voice-transcribing"
        ? "Transcribing, then discarding the audio."
        : stage === "voice-parsing"
          ? "Reading the transcript."
          : "Heard it wrong? Fix the row, then save.";

  function patch(key: number, changes: Partial<DemoDraft>) {
    setDraftsOverride(patchDraft(drafts, key, changes));
  }

  return (
    <div ref={containerRef}>
      <Tabs value={tab} onValueChange={selectTab} className="w-full gap-6">
        <TabsList className="mx-auto">
          {METHODS.map((method) => (
            <TabsTrigger key={method.id} value={method.id} className="gap-1.5">
              <method.icon className="size-4" />
              {method.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {METHODS.map((method) => {
          const page = getFeature(method.slug);
          return (
            // `forceMount` keeps all four panels in the document, so every
            // method's heading and description is in the server-rendered HTML
            // rather than only the tab that happens to open first. This section
            // is the page's clearest statement of what makes the product
            // different, and three quarters of it being invisible to a crawler
            // is a real cost; Radix still hides the inactive ones with `hidden`,
            // which also keeps them out of the accessibility tree. The *demo*
            // below is still gated on the active tab — mounting four scripted
            // panels would be four times the work for three nobody is looking at.
            <TabsContent
              key={method.id}
              value={method.id}
              forceMount
              // `forceMount` alone leaves every panel visible: this version of
              // Radix hands the hiding back to the consumer once you opt out of
              // unmounting. Hiding with `display:none` also keeps the three
              // inactive panels out of the accessibility tree, so a screen
              // reader hears one tab's content rather than four.
              className="data-[state=inactive]:hidden"
            >
              {/* The preview column is the wider one: the AI and voice tabs
                  render the app's real review grid, which has a minimum width
                  of its own, and an even split leaves it scrolling sideways. */}
              <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
                <div className="min-w-0">
                  <h3 className="text-xl font-medium tracking-tight sm:text-2xl">
                    {method.heading}
                  </h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">
                    {method.body}
                  </p>
                  {page && (
                    <Link
                      href={featurePath(page.slug)}
                      data-track-event="nav_link_click"
                      data-track-params={JSON.stringify({
                        location: "home_entry_methods",
                        label: page.slug,
                      })}
                      className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
                    >
                      {method.link}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  )}
                </div>

                {/* One pinned height across all four tabs. The panels differ a
                    lot in how much they need — a note box against a four-line
                    paste box — and without a fixed frame that difference moves
                    every section below this one each time a tab is clicked. */}
                <div className="flex h-[24rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
                  {tab !== method.id ? null : (
                  <>
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5">
                    <p className="min-w-0 truncate text-xs text-muted-foreground">
                      {method.caption}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={start}
                      className="h-7 shrink-0 gap-1.5 text-xs text-muted-foreground"
                    >
                      <Play className="size-3.5" /> Replay
                    </Button>
                  </div>

                  {method.id === "chat" && (
                    <>
                      <div ref={feedRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                        {/* Bottom-anchored, as the app's feed is: the newest row
                            sits just above the composer instead of leaving a
                            gap under a short history. */}
                        <div className="flex min-h-full flex-col justify-end">
                          <DemoFeed txns={chatTxns} />
                        </div>
                      </div>

                      <div className="shrink-0 space-y-1.5 border-t bg-muted/20 px-3 py-2.5">
                        <DemoControlGroup>
                          <DemoTypeToggle dense type={chatType} onChange={setChatType} />
                          <DemoDateChip />
                          <div className="min-w-0 flex-1">
                            <CategoryRow
                              dense
                              categories={chatCats}
                              value={categoryId}
                              onChange={setCategoryId}
                            />
                          </div>
                        </DemoControlGroup>

                        <div className="flex items-end gap-2">
                          <div className="relative shrink-0">
                            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                              {money.currency.symbol}
                            </span>
                            <Input
                              readOnly
                              inputMode="decimal"
                              placeholder={amountPlaceholder(
                                money.locale,
                                money.currency.decimals,
                              )}
                              // The caret is part of the value rather than an
                              // overlay: a positioned one has to reproduce the
                              // field's font, padding and line-height exactly,
                              // and any drift leaves a block floating beside it.
                              value={stage === "chat-amount" ? `${amountText}${CARET}` : amountText}
                              aria-label="Amount"
                              className={cn(
                                "h-9 w-28 pl-7 tabular-nums",
                                stage === "chat-amount" && "ring-2 ring-ring/50",
                              )}
                            />
                          </div>
                          <Input
                            readOnly
                            placeholder="What was it for?"
                            value={stage === "chat-title" ? `${titleText}${CARET}` : titleText}
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
                            <Kbd
                              combo={comboFor("tracker.submit")}
                              className="hidden opacity-80 sm:inline-flex"
                            />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}

                  {method.id === "ai" && (
                    <>
                      <div className="shrink-0 border-b bg-muted/20 px-3 py-2.5">
                        <div className="relative flex flex-col">
                          <Textarea
                            readOnly
                            rows={2}
                            value={stage === "ai-typing" ? `${note}${CARET}` : note}
                            aria-label="Describe your transactions"
                            className="min-h-[4.625rem] resize-none pr-14 pb-10"
                          />
                          <div className="absolute right-1.5 bottom-1 flex items-center gap-1">
                            <Button
                              type="button"
                              aria-label="Turn your note into transactions"
                              className={cn("size-8 shrink-0 rounded-full p-0", AI_BTN)}
                            >
                              {stage === "ai-parsing" ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <ArrowUp className="size-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">{aiStatus}</p>
                        <DemoDraftRows
                          rows={drafts}
                          visible={visibleRows}
                          onPatch={patch}
                          onRemove={(key) =>
                            setDraftsOverride(drafts.filter((r) => r.key !== key))
                          }
                        />
                      </div>
                    </>
                  )}

                  {method.id === "voice" && (
                    <>
                      <div className="shrink-0 space-y-1.5 border-b bg-muted/20 px-3 py-2.5">
                        <VoiceListeningStrip
                          state={voiceState}
                          interim={voiceInterim[interimIdx] ?? ""}
                          level={level}
                          liveSupported
                        />
                        <div className="relative flex flex-col">
                          <Textarea
                            readOnly
                            rows={2}
                            value={note}
                            placeholder="Hold the mic and say what you spent"
                            aria-label="Describe your transactions"
                            className="min-h-[4.625rem] resize-none pr-20 pb-10"
                          />
                          <div className="absolute right-1.5 bottom-1 flex items-center gap-1">
                            {/* The app's own mic button, driven by the script.
                                It's presentational — the recorder lives in the
                                AI pane — so it can be held here without any
                                microphone being touched. */}
                            <VoiceMicButton
                              state={voiceState}
                              level={level}
                              onStart={() => {
                                clearTimers();
                                playVoice(false);
                              }}
                              onStop={finishVoice}
                              hint={`hold ${comboFor("tracker.voice").toUpperCase()}`}
                              dense
                            />
                            <Button
                              type="button"
                              aria-label="Turn your note into transactions"
                              className={cn("size-8 shrink-0 rounded-full p-0", AI_BTN)}
                            >
                              {stage === "voice-parsing" ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <ArrowUp className="size-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">{voiceStatus}</p>
                        <DemoDraftRows
                          rows={drafts}
                          visible={visibleRows}
                          onPatch={patch}
                          onRemove={(key) =>
                            setDraftsOverride(drafts.filter((r) => r.key !== key))
                          }
                        />
                      </div>
                    </>
                  )}

                  {method.id === "bulk" && (
                    <>
                      <div className="shrink-0 space-y-1.5 border-b bg-muted/20 px-3 py-2.5">
                        <p className="truncate text-xs text-muted-foreground">
                          amount{delimiter} note{delimiter} category{delimiter} type
                          {delimiter} date
                        </p>
                        <Textarea
                          value={stage === "bulk-typing" ? `${bulkText}${CARET}` : bulkText}
                          onChange={(e) => {
                            // Typing mid-script takes over: cancel the
                            // remaining beats and drop the caret glyph, which
                            // is part of the *value* rather than an overlay.
                            clearTimers();
                            setStage("done");
                            setBulkOverride(e.target.value.split(CARET).join(""));
                          }}
                          rows={4}
                          spellCheck={false}
                          aria-label="Paste transactions"
                          placeholder="Paste rows here — one transaction per line"
                          className="resize-none font-mono text-xs"
                        />
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">
                          {bulk.drafts.length} ready
                          {bulk.errors.length > 0 &&
                            ` · ${bulk.errors.length} ${bulk.errors.length === 1 ? "line needs" : "lines need"} fixing`}
                          {" — edit the box and watch it re-parse."}
                        </p>
                        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
                          {bulk.drafts.length === 0 ? (
                            <p className="px-3 py-2 text-sm text-muted-foreground">
                              Nothing to preview yet.
                            </p>
                          ) : (
                            <ul className="divide-y text-sm">
                              {bulk.drafts.map((draft, i) => (
                                <li
                                  key={i}
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
                                    {/* The app's own conversion and formatter,
                                        so the preview groups thousands and
                                        places the sign exactly as the feed
                                        does. The parser hands back major units;
                                        `toMinorUnits` is the only sanctioned
                                        way to cross that boundary. */}
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
                          )}
                        </div>
                      </div>
                    </>
                  )}
                  </>
                  )}
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
