"use client";

import { Loader2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VoiceState } from "@/hooks/use-voice-recorder";

/**
 * The composer's push-to-talk mic and its "we're listening" strip.
 *
 * Both are presentational — `useVoiceRecorder` owns the state and lives in the
 * AI pane, so the button and the strip can't disagree about what's happening.
 */

/** Bars in the level meter. Odd, so there's a true centre to grow out from. */
const BAR_COUNT = 9;

/**
 * Hold to talk: the button records while it's held and stops on release,
 * matching the `M` shortcut rather than offering a second, different gesture.
 *
 * Pointer events (not mouse/touch) so one set of handlers covers mouse, touch
 * and pen. `onPointerLeave` and `onPointerCancel` both stop, because a finger
 * that slides off the button — or a browser that steals the gesture to scroll —
 * never delivers `pointerup` here, and the mic would stay open.
 */
export function VoiceMicButton({
  state,
  level,
  disabled,
  onStart,
  onStop,
  hint,
}: {
  state: VoiceState;
  /** 0–1 microphone level, used for the halo while recording. */
  level: number;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  /** Appended to the tooltip/label, e.g. "hold M". */
  hint?: string;
}) {
  const recording = state === "recording" || state === "starting";
  const busy = state === "transcribing";
  const label = recording
    ? "Release to transcribe"
    : busy
      ? "Transcribing your recording"
      : `Hold to record a voice note${hint ? ` (${hint})` : ""}`;

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled || busy}
      aria-label={label}
      title={label}
      aria-pressed={recording}
      // Keep the browser from turning a press-and-hold into text selection,
      // a scroll gesture, or the touch callout menu mid-recording.
      onPointerDown={(e) => {
        e.preventDefault();
        onStart();
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        onStop();
      }}
      onPointerLeave={() => {
        if (recording) onStop();
      }}
      onPointerCancel={() => {
        if (recording) onStop();
      }}
      // A held Space/Enter on a focused button repeats keydown; ignore the
      // repeats so keyboard users get one recording, not a stutter of starts.
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          onStart();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onStop();
        }
      }}
      className={cn(
        "relative size-10 shrink-0 touch-none rounded-full p-0 select-none",
        recording && "bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-400",
      )}
    >
      {/* A halo that breathes with the mic level — the cue that the mic is
          actually hearing you, not just that the button is down. */}
      {recording && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-red-500/20 transition-transform duration-75"
          style={{ transform: `scale(${1 + level * 0.45})` }}
        />
      )}
      {busy ? (
        <Loader2 className="size-5 animate-spin" />
      ) : (
        <Mic className={cn("relative size-5", recording && "animate-pulse")} />
      )}
    </Button>
  );
}

/**
 * The strip above the note while recording or transcribing.
 *
 * With Web Speech available it shows the interim words as they're recognized;
 * without it (Firefox, some in-app browsers) it shows the level meter alone.
 * Either way the text that finally lands in the composer comes from the server
 * model — this is feedback, never the result — so the interim words are styled
 * as provisional rather than as content.
 */
export function VoiceListeningStrip({
  state,
  interim,
  level,
  liveSupported,
}: {
  state: VoiceState;
  interim: string;
  level: number;
  liveSupported: boolean;
}) {
  if (state === "idle") return null;

  const transcribing = state === "transcribing";
  const status = transcribing
    ? "Transcribing…"
    : liveSupported && interim
      ? null
      : state === "starting"
        ? "Starting…"
        : "Listening…";

  return (
    <div
      // Announce politely: the interim text changes on nearly every word, and an
      // assertive region would interrupt a screen reader continuously.
      role="status"
      aria-live="polite"
      className="flex min-h-9 items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-1.5"
    >
      {transcribing ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <LevelMeter level={level} />
      )}
      <p className="min-w-0 flex-1 truncate text-sm">
        {status ? (
          <span className="text-muted-foreground">{status}</span>
        ) : (
          <span className="text-foreground/70 italic">{interim}</span>
        )}
      </p>
    </div>
  );
}

/**
 * Nine bars rising and falling with the mic level. Each bar is offset from the
 * centre so the shape reads as a voice waveform rather than a progress bar —
 * the point is "the mic hears you", which a single bar conveys poorly.
 */
function LevelMeter({ level }: { level: number }) {
  return (
    <span aria-hidden className="flex h-4 shrink-0 items-center gap-[2px]">
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        // Distance from the middle bar, 0 (centre) → 1 (edge).
        const offset = Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
        const height = 15 + level * 85 * (1 - offset * 0.65);
        return (
          <span
            key={i}
            className="w-[3px] rounded-full bg-red-500/70 transition-[height] duration-75"
            style={{ height: `${height}%` }}
          />
        );
      })}
    </span>
  );
}
