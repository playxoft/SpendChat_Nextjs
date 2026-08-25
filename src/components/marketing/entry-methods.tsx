"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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
import { DemoBulkDialog } from "@/components/marketing/demo/bulk-dialog";
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
import { toMinorUnits } from "@/lib/money";
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
 * Two things hold still and one moves. The section heading pins at the top and
 * the widget pins beneath it, because they're the constants — the same claim,
 * the same composer, all the way down. They pin as a single element, so they
 * also *leave* as one when the section runs out; two sticky boxes each release
 * at their own `top + height`, which had the widget sliding away out from under
 * a heading that was still stuck to the top. The four descriptions are ordinary
 * blocks in the flow: they scroll past like the rest of the page, fading up as
 * they approach the reading line and back out as they leave it. That fade is
 * computed from each block's distance to that line on every frame rather than
 * toggled by a class, so it tracks the scroll wheel exactly instead of playing
 * a fixed-length animation after a threshold trips.
 *
 * The reading line isn't a magic number: it's the middle of whatever space is
 * left once the pinned parts are measured. On a wide screen the widget sits
 * beside the copy and only the heading is overhead; on a narrow one the widget
 * is overhead too and the copy reads underneath it. Measuring the rendered
 * boxes covers both without a media query here having to agree with the `lg:`
 * ones in the markup.
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
  | "bulk-open"
  | "bulk-typing"
  | "bulk-preview"
  | "bulk-importing"
  | "saved";

/** A block caret, appended to the value being typed rather than overlaid — an
 * absolutely-positioned one has to reproduce the field's metrics exactly. */
const CARET = "▌";

/**
 * Clearance for the floating nav pill (`h-14` inside `pt-4`), which is the
 * height the pinned heading has to start below — matching `top-20` on it.
 */
const NAV_CLEARANCE_PX = 80;

/**
 * The fade, as fractions of the viewport height: a block is fully opaque while
 * its centre is within `FADE_FULL` of the reading line and gone by `FADE_GONE`.
 * Blocks are ~70vh apart, so at most one is legible at a time and the handover
 * happens as one leaves rather than by cutting between them.
 */
const FADE_FULL = 0.12;
const FADE_GONE = 0.38;

/** How long the bulk dialog takes to arrive before anything is typed into it. */
const DIALOG_MS = 420;

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
  const headerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  // The scroll handler switches methods from outside React's render, so the
  // script reads the method from a ref rather than from state one commit behind.
  const methodRef = useRef<Method>("chat");
  const startedRef = useRef(false);

  /**
   * How far down the pinned heading reaches, so the widget sits directly
   * beneath it. Measured rather than assumed: the heading wraps to a different
   * number of lines at every width, and its description is hidden below `sm`.
   */
  const [pinTop, setPinTop] = useState<number | null>(null);
  /**
   * The height of the whole pinned block — heading plus widget. Only the
   * stacked layout needs it, where it's how far down the copy has to start to
   * clear what's overhead.
   */
  const [pinnedHeight, setPinnedHeight] = useState<number | null>(null);

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

    // Bulk opens a dialog over the app, so the demo does too: the box appears
    // first and everything after it happens inside.
    setStage("bulk-open");
    const rowCharMs = CHAR_MS * 0.45;
    let elapsed = DIALOG_MS;
    bulkRows.forEach((row, index) => {
      for (let i = 1; i <= row.length; i++) {
        at(elapsed + i * rowCharMs, () => {
          setStage("bulk-typing");
          setBulkText([...bulkRows.slice(0, index), row.slice(0, i)].join("\n"));
        });
      }
      elapsed += row.length * rowCharMs + 200;
    });
    // No separate "now parse" beat: the rows appear as they're typed, because
    // that's what the app does and what the copy beside this claims.
    at(elapsed, () => setStage("bulk-preview"));
    const importAt = elapsed + 1100;
    at(importAt, () => setStage("bulk-importing"));
    at(importAt + 280, () => {
      commit(bulkDraftsFromText(bulkRows.join("\n")));
      setBulkText("");
      // "saved" closes the dialog, which is the point of the beat: the rows are
      // in the feed behind it.
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
   * Measure the pinned heading. `ResizeObserver` fires once as soon as it
   * observes, so this needs no priming call — which is just as well, since
   * setting state from an effect body is a lint error and, here, a wasted
   * render before the browser has laid the heading out anyway.
   */
  useEffect(() => {
    const heading = headerRef.current;
    const pinned = pinnedRef.current;
    if (!heading || !pinned) return;
    const observer = new ResizeObserver(() => {
      setPinTop(NAV_CLEARANCE_PX + heading.offsetHeight);
      setPinnedHeight(pinned.offsetHeight);
    });
    observer.observe(heading);
    observer.observe(pinned);
    return () => observer.disconnect();
  }, []);

  /**
   * The scroll pass: fade each block by its distance to the reading line, and
   * make the nearest one the active method.
   *
   * This is a per-frame measurement rather than an `IntersectionObserver`
   * because the two jobs want different answers. Activeness is a threshold —
   * one method at a time — but the fade is continuous, and an observer can only
   * report that a box crossed a line, not how far past it the box now is. Both
   * fall out of the same `getBoundingClientRect`, read once per frame.
   *
   * Nothing here writes to React state except `setActive`, and that only when
   * the method actually changes: opacity goes straight onto the node. Rendering
   * four blocks on every scroll frame to change one number would drop frames on
   * exactly the phones this section is longest on.
   */
  useEffect(() => {
    const copy = copyRef.current;
    const widget = widgetRef.current;
    const header = headerRef.current;
    const blocks = stepRefs.current.filter(Boolean) as HTMLDivElement[];
    if (!copy || !widget || !header || blocks.length === 0) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      const copyBox = copy.getBoundingClientRect();
      const widgetBox = widget.getBoundingClientRect();

      // Off screen: nothing to fade, and nothing to play. A homepage animation
      // that runs while it's still three sections below the fold has finished
      // by the time anyone arrives — so leaving marks it unplayed, and the
      // script starts again on the way back in.
      if (copyBox.bottom < 0 || copyBox.top > vh) {
        startedRef.current = false;
        return;
      }

      // Side by side, or stacked? Taken from the boxes themselves so this
      // doesn't have to restate the `lg:` breakpoint in the markup — and so it
      // still holds if the columns ever swap or the widget moves.
      const beside =
        widgetBox.left >= copyBox.right - 1 || widgetBox.right <= copyBox.left + 1;
      // Whatever is pinned above the copy: always the heading, plus the widget
      // when it's stacked on top rather than alongside.
      const covered = beside
        ? header.getBoundingClientRect().bottom
        : Math.max(header.getBoundingClientRect().bottom, widgetBox.bottom);
      const focus = (Math.max(0, Math.min(covered, vh)) + vh) / 2;

      let nearest = 0;
      let nearestDistance = Infinity;

      blocks.forEach((el, i) => {
        const box = el.getBoundingClientRect();
        // Signed: negative once the block has risen past the reading line.
        const offset = box.top + box.height / 2 - focus;
        const distance = Math.abs(offset);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = i;
        }
        if (reduced) return;
        // The last method fades in and then stays. A block fades out to make
        // room for the next one, and there isn't one — fading it would leave
        // the widget demonstrating a paste with nothing left saying what the
        // paste is. It goes when the whole block goes, still readable.
        const past = offset < 0 && i === blocks.length - 1;
        const opacity = past
          ? 1
          : Math.max(
              0,
              Math.min(1, (FADE_GONE * vh - distance) / ((FADE_GONE - FADE_FULL) * vh)),
            );
        const next = opacity.toFixed(2);
        if (el.style.opacity !== next) el.style.opacity = next;
      });

      const id = METHODS[nearest].id;
      // The first pass also starts the show. Without it the section's opening
      // method would sit there idle — the reader arrives already on it, so
      // "changed method" never fires for it.
      if (id !== methodRef.current || !startedRef.current) {
        methodRef.current = id;
        startedRef.current = true;
        setActive(id);
        clearTimers();
        run();
      }
    };

    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [clearTimers, reduced, run]);

  // Keep the newest bubble in view, inside the widget's own scroller.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.txns, stage]);

  const method = METHODS.find((m) => m.id === active) ?? METHODS[0];
  // What the composer *behind* the dialog shows. Bulk is manual entry with a
  // dialog over it, not an AI pane.
  const mode: EntryMode = active === "ai" || active === "voice" ? "ai" : "manual";
  // Bulk runs over the manual composer rather than replacing it — the dialog
  // covers the app, it doesn't become the app.
  const manualPane = active === "chat" || active === "bulk";
  const bulkOpen =
    stage === "bulk-open" ||
    stage === "bulk-typing" ||
    stage === "bulk-preview" ||
    stage === "bulk-importing";
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

  const vars: CSSProperties = {};
  if (pinTop !== null) (vars as Record<string, string>)["--pin-top"] = `${pinTop}px`;
  if (pinnedHeight !== null)
    (vars as Record<string, string>)["--pinned-h"] = `${pinnedHeight}px`;

  return (
    <div
      ref={containerRef}
      className="grid grid-cols-1 lg:grid-cols-2 lg:gap-12"
      style={pinTop === null && pinnedHeight === null ? undefined : vars}
    >
      {/*
        The heading and the widget are **one** sticky block, not two.

        That's what makes them arrive and leave as a set. Two sticky elements
        release at their own `top + height`, so a widget pinned lower and taller
        than the heading above it starts sliding away while the heading is still
        stuck to the top — the section came apart at exactly the moment it
        should have been leaving in one piece. As a single element there's only
        one release point, and the last method's copy, the heading over it and
        the widget beside it all go up the page together.

        It sits in the same grid cell as the copy rather than above it, so the
        copy runs the full height of the section and this rides over it. Hence
        `pointer-events-none` on the block and `-auto` on its two visible
        halves: on a wide screen the empty left half of this row lies directly
        over the copy's links.
      */}
      <div
        ref={pinnedRef}
        // `col-end` rather than `col-span`: a span leaves the column start
        // implicit, and auto-placement can't fit a two-column item into row 1
        // once the copy has claimed column 1 — so it invents a third column and
        // parks the whole block in the right half. Both edges stated, both
        // items explicitly placed, no auto-placement involved.
        className="pointer-events-none sticky top-20 z-10 col-start-1 col-end-2 row-start-1 self-start lg:col-end-3"
      >
        {/*
          Opaque, and full width rather than the width of the text, because the
          copy scrolls up behind it — this is what stops the two ever being
          legible on top of each other.
        */}
        <div ref={headerRef} className="pointer-events-auto bg-background pb-6">
          <div className="mx-auto max-w-2xl text-center">{header}</div>
        </div>

        <div className="lg:grid lg:grid-cols-2 lg:gap-12">
          {/* The copy's half of the row: left empty, and see-through. */}
          <div aria-hidden className="hidden lg:block" />
          {/*
            Beside the copy on a wide screen, above it on a narrow one — where
            it also has to mask the copy passing behind. Its height is what's
            left of the viewport once the pinned heading has taken its share,
            with a lower ceiling on small screens so there's still room to read
            underneath.
          */}
          <div
            ref={widgetRef}
            className="pointer-events-auto bg-background pb-6 lg:pb-0"
          >
            <DemoFrame
              label="Interactive entry demo"
              sidebar={false}
              overlay={
                <DemoBulkDialog
                  open={bulkOpen}
                  text={stage === "bulk-typing" ? `${bulkText}${CARET}` : bulkText}
                  drafts={bulkParsed.drafts.map((draft) => ({
                    type: draft.type,
                    amount: String(draft.amount),
                    title: draft.title || draft.note || "Transaction",
                    categoryName: draft.categoryName ?? undefined,
                  }))}
                  money={money}
                  pressed={stage === "bulk-importing"}
                />
              }
              className="h-[min(20rem,calc(100svh_-_var(--pin-top,9rem)_-_15rem))] lg:h-[min(38rem,calc(100svh_-_var(--pin-top,15rem)_-_4rem))]"
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
                    {manualPane ? (
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

                  {manualPane && (
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
        </div>
      </div>

      {/*
        Four ordinary blocks in the flow — this column is what gives the section
        its length, and scrolling it is what drives everything else. Each block
        is a viewport-and-a-bit tall so its copy has the screen to itself on the
        way past, and centred in that space so it meets the reading line the
        fade is measured against.

        They're never unmounted or hidden, only faded, so all four descriptions
        are in the server-rendered HTML and read in order by assistive tech —
        and if the fade never runs (no JS, reduced motion) the section degrades
        to four readable blocks rather than three blank ones.

        It shares a cell with the pinned block, so it starts far enough down to
        clear whatever is overhead: the whole block when they're stacked, just
        the heading when the widget is alongside. The fallbacks are only for the
        first paint, before the measurement lands.
      */}
      <div
        ref={copyRef}
        className="col-start-1 col-end-2 row-start-1 pt-[var(--pinned-h,26rem)] lg:pt-[calc(var(--pin-top,15rem)_-_5rem)]"
      >
          {METHODS.map((m, i) => {
            const target = getFeature(m.slug);
            return (
              <div
                key={m.id}
                data-method={m.id}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                className="flex min-h-[62vh] flex-col justify-center lg:min-h-[70vh]"
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

          {/*
            A beat at the end. The pinned block releases when the column runs
            out, and the last method's beat lands with most of its own block
            still below the fold — without this the widget would start leaving
            while the paste it is demonstrating was still being typed. Short on
            purpose: long enough to watch the import land, not so long that the
            section overstays after there's nothing left to read.
          */}
          <div aria-hidden className="h-[25vh]" />
      </div>
    </div>
  );
}
