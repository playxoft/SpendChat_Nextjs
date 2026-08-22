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
import { DemoFeed } from "./demo-feed";
import { DemoSummaryBar } from "./demo-summary-bar";
import { DemoProfilePicker } from "./demo-controls";
import {
  DemoDraftRows,
  isValidDraft,
  patchDraft,
  type DemoDraft,
} from "./demo-draft-rows";
import { demoCategory } from "./demo-data";
import { useDemoMoney } from "@/hooks/use-demo-currency";
import { useDemoFeed } from "./use-demo-feed";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { toMinorUnits } from "@/lib/money";
import { comboFor } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * One scripted dictation per language option.
 *
 * The Hindi and Tamil scripts are written the way people actually speak them to
 * a phone — English nouns, the local grammar around them — because that's the
 * case this page is about and a page claiming it should show it. The Spanish
 * one keeps its comma decimal ("4,50"), which is both correct and a real thing
 * the transcription has to normalise before the amount can be parsed.
 */
type Script = {
  id: string;
  /** Chip label — the language in its own script, plus English where it's mixed. */
  label: string;
  /** Read out under the chips, in English. */
  caption: string;
  /** Partial recognitions, shown one at a time while "recording". */
  interim: string[];
  transcript: string;
  drafts: DemoDraft[];
};

const SCRIPTS: Script[] = [
  {
    id: "en",
    label: "English",
    caption: "Plain English — one sentence, two purchases.",
    interim: ["coffee", "coffee four fifty", "coffee 4.50 and 62", "coffee 4.50 and 62 on groceries"],
    transcript: "coffee 4.50 and 62 on groceries",
    drafts: [
      { key: 1, type: "expense", amount: "4.50", title: "Coffee", categoryName: "Food & Dining" },
      { key: 2, type: "expense", amount: "62.00", title: "Groceries", categoryName: "Groceries" },
    ],
  },
  {
    id: "hi",
    label: "हिन्दी + English",
    caption: "Hinglish — Hindi grammar, English nouns, mid-sentence switching.",
    interim: ["chai", "chai 20", "chai 20 aur", "chai 20 aur groceries 620"],
    transcript: "chai 20 aur groceries 620",
    drafts: [
      { key: 1, type: "expense", amount: "20.00", title: "Chai", categoryName: "Food & Dining" },
      { key: 2, type: "expense", amount: "620.00", title: "Groceries", categoryName: "Groceries" },
    ],
  },
  {
    id: "ta",
    label: "தமிழ் + English",
    caption: "Tamil mixed with English — the same sentence, a different grammar.",
    interim: ["coffee", "coffee-ku 45", "coffee-ku 45, groceries", "coffee-ku 45, groceries-ku 620"],
    transcript: "coffee-ku 45, groceries-ku 620",
    drafts: [
      { key: 1, type: "expense", amount: "45.00", title: "Coffee", categoryName: "Food & Dining" },
      { key: 2, type: "expense", amount: "620.00", title: "Groceries", categoryName: "Groceries" },
    ],
  },
  {
    id: "es",
    label: "Español",
    caption: "Spanish, comma decimals and all — normalised on the way in.",
    interim: ["café", "café 4,50", "café 4,50 y la compra", "café 4,50 y la compra 62"],
    transcript: "café 4,50 y la compra 62",
    drafts: [
      { key: 1, type: "expense", amount: "4.50", title: "Café", categoryName: "Food & Dining" },
      { key: 2, type: "expense", amount: "62.00", title: "La compra", categoryName: "Groceries" },
    ],
  },
];

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

  const [scriptId, setScriptId] = useState(SCRIPTS[0].id);
  const script = useMemo(
    () => SCRIPTS.find((s) => s.id === scriptId) ?? SCRIPTS[0],
    [scriptId],
  );

  const [mode, setMode] = useState<EntryMode>("ai");
  const [stage, setStage] = useState<Stage>("review");
  const [interimIdx, setInterimIdx] = useState(0);
  const [level, setLevel] = useState(0);
  const [note, setNote] = useState(SCRIPTS[0].transcript);
  const [rows, setRows] = useState<DemoDraft[]>(SCRIPTS[0].drafts);
  const [visibleRows, setVisibleRows] = useState(SCRIPTS[0].drafts.length);

  const containerRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const levelTimer = useRef<number | null>(null);
  const tick = useRef(0);
  const played = useRef(false);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
    if (levelTimer.current !== null) {
      window.clearInterval(levelTimer.current);
      levelTimer.current = null;
    }
  }, []);

  const at = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  /** Jump straight to the finished state — the reduced-motion path. */
  const showResult = useCallback(
    (s: Script) => {
      clearTimers();
      setMode("ai");
      setNote(s.transcript);
      setRows(s.drafts);
      setVisibleRows(s.drafts.length);
      setLevel(0);
      setStage("review");
    },
    [clearTimers],
  );

  /** Everything after the mic is released: transcribe → parse → drafts. */
  const finish = useCallback(
    (s: Script) => {
      clearTimers();
      setStage("transcribing");
      setLevel(0);

      at(TRANSCRIBE_MS, () => {
        setNote(s.transcript);
        setStage("parsing");
      });
      at(TRANSCRIBE_MS + PARSE_MS, () => {
        setRows(s.drafts);
        setVisibleRows(0);
        setStage("review");
      });
      s.drafts.forEach((_, i) => {
        at(TRANSCRIBE_MS + PARSE_MS + i * ROW_STAGGER_MS, () => setVisibleRows(i + 1));
      });
    },
    [at, clearTimers],
  );

  /**
   * Begin the scripted dictation. `autoStop` is for the autoplay path, where
   * nobody is holding the button — a real hold ends when the pointer lifts.
   */
  const startRecording = useCallback(
    (s: Script, autoStop: boolean) => {
      clearTimers();
      setMode("ai");
      setNote("");
      setRows([]);
      setVisibleRows(0);
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
        at(s.interim.length * INTERIM_MS + 300, () => finish(s));
      }
    },
    [at, clearTimers, finish],
  );

  // Play once when it scrolls into view, unless motion is off.
  useEffect(() => {
    if (reduced) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !played.current) {
            played.current = true;
            startRecording(SCRIPTS[0], true);
          }
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced, startRecording]);

  useEffect(() => clearTimers, [clearTimers]);

  function pickScript(s: Script) {
    setScriptId(s.id);
    if (reduced) showResult(s);
    else startRecording(s, true);
  }

  const validRows = useMemo(() => rows.filter(isValidDraft), [rows]);

  function confirm() {
    if (validRows.length === 0) return;
    feed.addMany(
      validRows.map((r) => ({
        type: r.type,
        amountMinor: toMinorUnits(r.amount, money.code, money.locale),
        title: r.title.trim(),
        categoryName: r.categoryName || "Other",
        categoryIcon: demoCategory(r.categoryName)?.icon ?? "💸",
      })),
    );
    clearTimers();
    setStage("saved");
    setNote("");
    setRows([]);
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
          {SCRIPTS.map((s) => (
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
              {stage === "review" && rows.length > 0 && (
                <p className="min-w-0 flex-1 truncate text-sm font-medium">
                  Review {rows.length} transaction{rows.length === 1 ? "" : "s"}
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => (reduced ? showResult(script) : startRecording(script, true))}
                className="ml-auto h-8 shrink-0 gap-1.5 text-xs text-muted-foreground"
              >
                <Play className="size-3.5" /> Replay
              </Button>
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
                  onClick={() => (reduced ? showResult(script) : startRecording(script, true))}
                  className="mt-1 h-8 gap-1.5"
                >
                  <Play className="size-3.5" /> Say it again
                </Button>
              </div>
            ) : listening || stage === "parsing" || rows.length === 0 ? (
              <div className="flex flex-col gap-1.5">
                {/* The app's own listening strip, driven by the script. */}
                <VoiceListeningStrip
                  state={voiceState}
                  interim={script.interim[interimIdx] ?? ""}
                  level={level}
                  liveSupported
                />
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
                      onStart={() => startRecording(script, false)}
                      onStop={() => finish(script)}
                      hint={`hold ${comboFor("tracker.voice").toUpperCase()}`}
                      dense
                    />
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
                <p className="px-0.5 text-xs text-muted-foreground">
                  Type or hold <Kbd combo={comboFor("tracker.voice")} className="align-middle" />{" "}
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
                  onPatch={(key, changes) =>
                    setRows((prev) => patchDraft(prev, key, changes))
                  }
                  onRemove={(key) => setRows((prev) => prev.filter((r) => r.key !== key))}
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 text-xs text-muted-foreground">
                    Heard it wrong? Fix the row, then save.
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
