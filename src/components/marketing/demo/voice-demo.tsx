"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import {
  EntryModeToggle,
  MODE_ROW_DENSE,
  type EntryMode,
} from "@/components/app/entry-mode-toggle";
import { AI_BTN } from "@/components/app/ai-accent";
import { VoiceListeningStrip, VoiceMicButton } from "@/components/app/voice-mic";
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
import { comboFor } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * One scripted dictation per language option.
 *
 * The Hindi and Tamil scripts are written the way people actually speak them to
 * a phone — English nouns, the local grammar around them — because that's the
 * case this page is about and a page claiming it should show it.
 *
 * **The amounts are seeded in USD minor units**, like every other demo's data,
 * and converted per visitor by `demoAmountInput`. A literal "4.50" fails two
 * ways at once: it is not a number a comma-decimal reader can save —
 * `toMinorUnits` throws on it from inside an onClick, which unwinds the whole
 * feature page to its error boundary — and "₹4.50 for a coffee" is exactly the
 * mismatch `use-demo-currency` exists to prevent.
 *
 * The sentence is built from the same strings the draft rows carry, and the
 * transcript is simply the last partial recognition, so a spoken amount and the
 * row it produces can't drift apart. It's also why no interim step spells a
 * number out in words: "four fifty" is only true of one currency.
 *
 * The Spanish script speaks its amounts with Spanish separators ("4,50") while
 * its rows show the visitor's own — which is the point it was written to make.
 * A comma decimal is a real thing the transcription has to normalise before the
 * amount can be parsed, and here you can watch it happen.
 *
 * **Except where the visitor's currency has no minor units.** For JPY, KRW,
 * VND, CLP or ISK both sides render "540" — no separator anywhere on screen, so
 * a caption promising comma decimals would be describing something that isn't
 * there. Forcing a fractional part onto a currency that has none would be a
 * worse lie than the caption, so the *caption* is what gives way: a script may
 * carry a `plainCaption` for that case, and `scriptsFor` picks between them by
 * looking at the amounts it just rendered rather than at a currency list that
 * would need maintaining.
 */
type ScriptSpec = {
  id: string;
  /** Chip label — the language in its own script, plus English where it's mixed. */
  label: string;
  /** Read out under the chips, in English. */
  caption: string;
  /**
   * Read instead of `caption` when the spoken amounts come out with no decimal
   * separator in them at all — only worth setting on a script whose caption is
   * *about* the separator. See `scriptsFor`.
   */
  plainCaption?: string;
  /**
   * The locale the *speaker* writes numbers in, where that's part of the point.
   * Defaults to the visitor's own.
   */
  speechLocale?: string;
  /** What was bought — one draft row each, seeded in USD minor units. */
  items: { usdMinor: number; title: string; categoryName: string }[];
  /**
   * Partial recognitions, shown one at a time while "recording", built from the
   * spoken amounts. The last one is the final transcript.
   */
  interim: (amounts: string[]) => string[];
};

/** One dictation with the visitor's currency filled in — what the demo plays. */
type Script = {
  id: string;
  label: string;
  caption: string;
  interim: string[];
  transcript: string;
  drafts: DemoDraft[];
};

const SCRIPTS: ScriptSpec[] = [
  {
    id: "en",
    label: "English",
    caption: "Plain English — one sentence, two purchases.",
    items: [
      { usdMinor: 360, title: "Coffee", categoryName: "Food & Dining" },
      { usdMinor: 6200, title: "Groceries", categoryName: "Groceries" },
    ],
    interim: ([coffee, groceries]) => [
      "coffee",
      `coffee ${coffee}`,
      `coffee ${coffee} and ${groceries}`,
      `coffee ${coffee} and ${groceries} on groceries`,
    ],
  },
  {
    id: "hi",
    label: "हिन्दी + English",
    caption: "Hinglish — Hindi grammar, English nouns, mid-sentence switching.",
    items: [
      { usdMinor: 360, title: "Chai", categoryName: "Food & Dining" },
      { usdMinor: 6200, title: "Groceries", categoryName: "Groceries" },
    ],
    interim: ([chai, groceries]) => [
      "chai",
      `chai ${chai}`,
      `chai ${chai} aur`,
      `chai ${chai} aur groceries ${groceries}`,
    ],
  },
  {
    id: "ta",
    label: "தமிழ் + English",
    caption: "Tamil mixed with English — the same sentence, a different grammar.",
    items: [
      { usdMinor: 360, title: "Coffee", categoryName: "Food & Dining" },
      { usdMinor: 6200, title: "Groceries", categoryName: "Groceries" },
    ],
    interim: ([coffee, groceries]) => [
      "coffee",
      `coffee-ku ${coffee}`,
      `coffee-ku ${coffee}, groceries`,
      `coffee-ku ${coffee}, groceries-ku ${groceries}`,
    ],
  },
  {
    id: "es",
    label: "Español",
    caption: "Spanish, comma decimals and all — normalised on the way in.",
    plainCaption: "Spanish — the same two purchases, dictated in a fourth language.",
    speechLocale: "es-ES",
    items: [
      { usdMinor: 360, title: "Café", categoryName: "Food & Dining" },
      { usdMinor: 6200, title: "La compra", categoryName: "Groceries" },
    ],
    interim: ([cafe, compra]) => [
      "café",
      `café ${cafe}`,
      `café ${cafe} y la compra`,
      `café ${cafe} y la compra ${compra}`,
    ],
  },
];

/** The four scripts, priced and formatted for one visitor. */
function scriptsFor(money: DemoMoneyFormat): Script[] {
  return SCRIPTS.map((spec) => {
    const spoken = spec.speechLocale ? { ...money, locale: spec.speechLocale } : money;
    const spokenAmounts = spec.items.map((item) => demoAmountInput(item.usdMinor, spoken));
    const interim = spec.interim(spokenAmounts);
    // Asked of the rendered strings rather than of `currency.decimals`, so the
    // caption is answering for what is actually on screen: `demoAmountInput`
    // emits Latin digits and no grouping, so any non-digit left in one of them
    // *is* the decimal separator the caption is about.
    const spokenHasSeparator = spokenAmounts.some((amount) => /\D/.test(amount));
    return {
      id: spec.id,
      label: spec.label,
      caption: spokenHasSeparator ? spec.caption : (spec.plainCaption ?? spec.caption),
      interim,
      transcript: interim[interim.length - 1] ?? "",
      drafts: spec.items.map((item, i) => ({
        key: i + 1,
        type: "expense" as const,
        amount: demoAmountInput(item.usdMinor, money),
        title: item.title,
        categoryName: item.categoryName,
      })),
    };
  });
}

type Stage = "idle" | "recording" | "transcribing" | "parsing" | "review" | "saved";

const INTERIM_MS = 560;
const TRANSCRIBE_MS = 950;
const PARSE_MS = 900;
const ROW_STAGGER_MS = 150;
const LEVEL_TICK_MS = 90;

/**
 * Push-to-talk entry, scripted.
 *
 * The mic button and the listening strip are the app's own components
 * (`voice-mic.tsx`) — both are purely presentational, driven by state the AI
 * pane owns, so a marketing page can drive them with a script instead and the
 * visitor sees exactly the control they'd get after signing up, halo and all.
 *
 * **No microphone is requested.** A landing page asking for mic permission is a
 * bounce, and the browser would rightly treat it as hostile. Holding the button
 * runs the chosen script; the level meter moves on a deterministic waveform
 * rather than on real audio.
 *
 * Like the AI demo it server-renders its finished state, so the transcript and
 * drafts are in the HTML rather than appearing only after hydration.
 */
export function VoiceDemo() {
  const feed = useDemoFeed("Personal");
  const money = useDemoMoney();
  const reduced = useReducedMotion();

  const scripts = useMemo(() => scriptsFor(money), [money]);
  const [scriptId, setScriptId] = useState(SCRIPTS[0].id);
  const script = useMemo(
    () => scripts.find((s) => s.id === scriptId) ?? scripts[0],
    [scripts, scriptId],
  );

  const [mode, setMode] = useState<EntryMode>("ai");
  const [stage, setStage] = useState<Stage>("review");
  const [interimIdx, setInterimIdx] = useState(0);
  const [level, setLevel] = useState(0);
  // `null` means "untouched", so the transcript and the drafts follow both the
  // chosen language and the detected currency; seeding state from a script
  // would freeze whatever the server rendered, in dollars.
  const [noteOverride, setNoteOverride] = useState<string | null>(null);
  const [rowsOverride, setRowsOverride] = useState<DemoDraft[] | null>(null);
  const [visibleOverride, setVisibleOverride] = useState<number | null>(null);

  const note = noteOverride ?? script.transcript;
  const rows = rowsOverride ?? script.drafts;
  const visibleRows = visibleOverride ?? rows.length;

  const levelTimer = useRef<number | null>(null);
  const tick = useRef(0);

  /**
   * Stop the waveform meter. It's the one beat `useScriptedDemo` can't own: a
   * real hold has no scripted length — it runs until the pointer lifts — so it
   * ticks on an interval rather than as a queue of timeouts, and this file
   * still clears that interval by hand.
   */
  const stopLevel = useCallback(() => {
    if (levelTimer.current !== null) {
      window.clearInterval(levelTimer.current);
      levelTimer.current = null;
    }
  }, []);

  /** Jump straight to the finished state — the reduced-motion path. */
  const showResult = useCallback(() => {
    stopLevel();
    setMode("ai");
    setNoteOverride(null);
    setRowsOverride(null);
    setVisibleOverride(null);
    setLevel(0);
    setStage("review");
  }, [stopLevel]);

  /** Everything after the mic is released: transcribe → parse → drafts. */
  const finish = useCallback(
    (at: ScriptAt, s: Script) => {
      stopLevel();
      setStage("transcribing");
      setLevel(0);

      at(TRANSCRIBE_MS, () => {
        setNoteOverride(s.transcript);
        setStage("parsing");
      });
      at(TRANSCRIBE_MS + PARSE_MS, () => {
        setRowsOverride(s.drafts);
        setVisibleOverride(0);
        setStage("review");
      });
      s.drafts.forEach((_, i) => {
        at(TRANSCRIBE_MS + PARSE_MS + i * ROW_STAGGER_MS, () =>
          setVisibleOverride(i + 1),
        );
      });
    },
    [stopLevel],
  );

  /**
   * Begin the scripted dictation. `autoStop` is for the autoplay path, where
   * nobody is holding the button — a real hold ends when the pointer lifts.
   *
   * Takes the scheduler as an argument rather than closing over it, so it can
   * be handed to `useScriptedDemo` below and still be called straight from the
   * mic button (see the hook's note on why `play` is shaped this way).
   */
  const record = useCallback(
    (at: ScriptAt, s: Script, autoStop: boolean) => {
      stopLevel();
      setMode("ai");
      setNoteOverride("");
      setRowsOverride([]);
      setVisibleOverride(0);
      setInterimIdx(0);
      setStage("recording");

      // A deterministic waveform, so the meter breathes without pretending to
      // measure anything. Two out-of-phase sines read as speech; one reads as a
      // metronome.
      tick.current = 0;
      levelTimer.current = window.setInterval(() => {
        tick.current += 1;
        const t = tick.current;
        const value = 0.28 + 0.34 * Math.abs(Math.sin(t / 3.1)) + 0.22 * Math.abs(Math.sin(t / 1.7));
        setLevel(Math.min(1, value));
      }, LEVEL_TICK_MS);

      s.interim.forEach((_, i) => at(i * INTERIM_MS, () => setInterimIdx(i)));

      if (autoStop) {
        // Every interim beat has fired by the time this one does, so there's
        // nothing left to cancel — `finish` simply picks up the sequence.
        at(s.interim.length * INTERIM_MS + 300, () => finish(at, s));
      }
    },
    [finish, stopLevel],
  );

  /** The whole sequence, from the top, in whichever language is selected. */
  const play = useCallback(
    (at: ScriptAt) => {
      if (reduced) {
        showResult();
        return;
      }
      record(at, script, true);
    },
    [record, reduced, script, showResult],
  );

  // Plays once when it scrolls into view: autoplaying on mount would run the
  // whole dictation above the fold before anyone had scrolled to it. `start` is
  // the same entry point Replay uses, so both cancel what's queued first.
  const { containerRef, at, clearTimers, start } = useScriptedDemo(play, {
    threshold: 0.35,
  });

  /** Cancel everything in flight: the hook's beats, plus our own meter. */
  const cancel = useCallback(() => {
    clearTimers();
    stopLevel();
  }, [clearTimers, stopLevel]);

  useEffect(() => stopLevel, [stopLevel]);

  function pickScript(s: Script) {
    setScriptId(s.id);
    cancel();
    if (reduced) showResult();
    else record(at, s, true);
  }

  // Exactly what "Add N" would add, already converted — the button counts the
  // same array `confirm` commits, so a row the visitor has corrected into
  // something unparseable leaves both at once.
  const ready = useMemo(() => draftsToTxns(rows, money), [money, rows]);

  function confirm() {
    if (ready.length === 0) return;
    feed.addMany(ready);
    cancel();
    setStage("saved");
    setNoteOverride("");
    setRowsOverride([]);
  }

  const listening = stage === "recording" || stage === "transcribing";
  const voiceState =
    stage === "recording" ? "recording" : stage === "transcribing" ? "transcribing" : "idle";

  return (
    <div ref={containerRef}>
      {/* Language picker — the point of the demo, so it sits above the frame
          rather than buried inside the composer. */}
      <div className="mb-3 flex flex-col items-center gap-2">
        <div className="flex flex-wrap justify-center gap-1.5">
          {scripts.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pickScript(s)}
              aria-pressed={s.id === script.id}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-sm transition-colors",
                s.id === script.id
                  ? "border-foreground bg-foreground text-background"
                  : "hover:bg-muted",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">{script.caption}</p>
      </div>

      <DemoFrame
        label="Interactive voice entry demo"
        active="/app"
        // Pinned, for the same reason as the AI demo: the footer's height
        // differs a lot between listening and reviewing.
        className="h-[44rem]"
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
            <div className={MODE_ROW_DENSE}>
              <EntryModeToggle mode={mode} onChange={setMode} dense pane={mode} />
              {/* Gated on the pane as well as the stage: switching to Manual
                  mid-review left "Review 2 transactions" sitting over the
                  placeholder that says voice lives in the AI pane — a caption
                  for rows that are no longer on screen. */}
              {mode === "ai" && stage === "review" && rows.length > 0 && (
                <p className="min-w-0 flex-1 truncate text-sm font-medium">
                  Review {rows.length} transaction{rows.length === 1 ? "" : "s"}
                </p>
              )}
            </div>

            {mode === "manual" ? (
              <div className="flex min-h-[4.625rem] items-center justify-center rounded-xl border border-dashed px-4 text-center text-sm text-muted-foreground">
                Voice lives in the AI pane — switch back to hear it.
              </div>
            ) : stage === "saved" ? (
              <div className="flex min-h-[4.625rem] flex-col items-center justify-center gap-2 py-2 text-center">
                <p className="text-sm font-medium">Added to the feed above.</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Nothing was saved anywhere, and no microphone was used — the
                  dictation is a script.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={start}
                  className="mt-1 h-8 gap-1.5"
                >
                  <Play className="size-3.5" /> Say it again
                </Button>
              </div>
            ) : listening || stage === "parsing" || rows.length === 0 ? (
              <div className="flex flex-col gap-1.5">
                {/*
                 * The app's own listening strip, driven by the script — and
                 * `inert`, which is the one thing this page changes about it.
                 *
                 * The strip is a `role="status" aria-live="polite"` region
                 * (`voice-mic.tsx`), and in the app that is exactly right: you
                 * held the mic, so the words coming back are yours to hear.
                 * Here nobody asked for anything. This demo autoplays when it
                 * scrolls into view and pushes a new partial every 560ms, so a
                 * screen reader would read the whole dictation out — "chai",
                 * "chai 3.60", "chai 3.60 aur", …, "Transcribing…" — to a
                 * visitor who did nothing but scroll past it, and again on
                 * every language chip. That's WCAG 2.2.2: content that updates
                 * on its own, with nothing to pause it.
                 *
                 * `inert` takes the subtree out of the accessibility tree, and
                 * the live region goes with it. Nothing here is interactive and
                 * nothing here is content — the transcript this produces lands
                 * in the note box below, which a reader reaches at their own
                 * pace — so there is nothing left to lose. It's the same guard
                 * the homepage composer already carries in
                 * `entry-methods.tsx`, which is why the homepage never had
                 * this bug. The strip itself is shared with the app and stays
                 * as it is.
                 *
                 * `contents` so the wrapper is not a flex item of its own: the
                 * strip renders nothing at all while idle, and a real box
                 * around it would leave a `gap-1.5` hanging above the note box
                 * for the whole parse.
                 */}
                <div inert className="contents">
                  <VoiceListeningStrip
                    state={voiceState}
                    interim={script.interim[interimIdx] ?? ""}
                    level={level}
                    liveSupported
                  />
                </div>
                <div className="relative flex flex-col">
                  <Textarea
                    value={note}
                    readOnly
                    rows={2}
                    placeholder="Hold the mic and say what you spent"
                    aria-label="Describe your transactions"
                    className="min-h-[4.625rem] resize-none pr-20 pb-10"
                  />
                  <div className="absolute right-1.5 bottom-1 flex items-center gap-1">
                    <VoiceMicButton
                      state={voiceState}
                      level={level}
                      // Reduced motion is honoured here too, not just on the
                      // two entry points that schedule the script (`play` and
                      // `pickScript`). Pressing the mic is the *most* animated
                      // way into this demo: `record` starts a 90ms interval
                      // that drives the level meter and scales the halo behind
                      // the button with it, which is precisely the motion the
                      // preference asks us not to run. So the press does what
                      // the other two do — jump to the finished state.
                      onStart={() => {
                        cancel();
                        if (reduced) showResult();
                        else record(at, script, false);
                      }}
                      // Still fires under reduced motion: `showResult` flips
                      // the footer to the review pane, which unmounts this
                      // button mid-hold, and the button reports that as a
                      // release. There is nothing to finish — the demo is
                      // already on its last frame.
                      onStop={() => {
                        if (reduced) return;
                        cancel();
                        finish(at, script);
                      }}
                      hint={`hold ${comboFor("tracker.voice").toUpperCase()}`}
                      dense
                    />
                    {/*
                     * `inert`, for the reason the AI demo's identical button is
                     * (`ai-demo.tsx`): it has no `onClick` and shouldn't get
                     * one — the script decides when this note is sent — so left
                     * plain it was a focusable, focus-ringed control announcing
                     * "Turn your note into transactions" and doing nothing when
                     * pressed. `inert` takes it out of the tab order and the
                     * accessibility tree, `pointer-events-none` removes the
                     * hover and the cursor. Not `disabled`: that would grey it
                     * out beside a live mic button and read as broken.
                     *
                     * On the button itself rather than on the row around it:
                     * the mic sharing that row is the one control on this frame
                     * the visitor *is* meant to press.
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
                <p className="px-0.5 text-xs text-muted-foreground">
                  Type or hold{" "}
                  <Kbd combo={comboFor("tracker.voice")} className="align-middle" describe />{" "}
                  to speak — no microphone is used in this demo.
                </p>
              </div>
            ) : (
              <>
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {note}
                </p>
                <DemoDraftRows
                  rows={rows}
                  visible={visibleRows}
                  onPatch={(key, changes) => setRowsOverride(patchDraft(rows, key, changes))}
                  onRemove={(key) => setRowsOverride(rows.filter((r) => r.key !== key))}
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 text-xs text-muted-foreground">
                    Heard it wrong? Fix the row, then save.
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
        <div className="h-full overflow-y-auto px-4 py-3">
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
