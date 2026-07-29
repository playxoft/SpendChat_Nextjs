"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_RECORDING_MS } from "@/lib/ai-limits";

/**
 * Push-to-talk recording for the composer's mic, with a free live preview.
 *
 * Two things run at once while the mic is held, and they answer different needs:
 *
 *   MediaRecorder     captures the audio that is actually transcribed. Its blob
 *                     goes to the server model on release, and that result is
 *                     what lands in the composer.
 *   SpeechRecognition (the Web Speech API) streams interim words as you speak,
 *                     purely so the button doesn't feel dead for the seconds
 *                     you're talking. It costs nothing and is never saved — its
 *                     accuracy on amounts and merchant names isn't good enough
 *                     to trust, and it can't be told about several languages.
 *
 * Where Web Speech is missing (Firefox ships it behind a flag; some in-app
 * browsers omit it) `liveSupported` is false and the caller shows the level
 * meter instead. Recording and transcription are unaffected — only the
 * word-by-word preview is.
 */

export type VoiceState = "idle" | "starting" | "recording" | "transcribing";

/** The vendor-prefixed constructor, as shipped (Safari still needs the prefix). */
type RecognitionCtor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * The best container this browser will record. Opus in WebM everywhere except
 * Safari, which only does MP4/AAC — both are accepted server-side. An empty
 * string lets MediaRecorder pick, which is the right fallback for anything new.
 */
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Blob → bare base64 (no data: prefix), the wire format for the server action. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the recording"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Below this, a press was a mis-tap rather than speech. Uploading it would spend
 * a quota slot and a provider call to be told there's nothing there.
 */
const MIN_RECORDING_MS = 400;

/**
 * Turn a `getUserMedia` rejection into something the user can act on.
 *
 * Worth the detail: these failures look identical from the UI but have entirely
 * different fixes, and telling someone to "allow it in your browser" when they
 * already have is worse than saying nothing. In particular a
 * `Permissions-Policy: microphone=()` response header (or an embedding iframe
 * without `allow="microphone"`) produces `NotAllowedError` with the permission
 * reading back as `denied` and **no prompt ever shown** — indistinguishable
 * from a user denial unless the Permissions API is consulted, which is what the
 * `denied`-without-a-prompt branch below is for.
 */
async function describeMicError(err: unknown): Promise<string> {
  const name = err instanceof DOMException ? err.name : "";

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone found — connect one and try again.";
  }
  // The device exists but the OS or another app has it. On macOS this is also
  // what a missing system-level mic permission for the browser looks like.
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Your microphone is unavailable — another app may be using it, or the browser needs microphone access in your system settings.";
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    let state: PermissionState | null = null;
    try {
      state = (await navigator.permissions.query({ name: "microphone" as PermissionName })).state;
    } catch {
      /* Permissions API or the "microphone" name is unsupported — fall through */
    }
    if (state === "denied") {
      return "Microphone access is blocked for this site. Allow it in your browser's site settings — if it's already allowed, the page is blocking it with a Permissions-Policy header.";
    }
    return "Microphone access was dismissed — allow it when your browser asks.";
  }
  return "Couldn't start recording.";
}

export function useVoiceRecorder({
  lang,
  onTranscribe,
  onError,
}: {
  /** BCP-47 tag for the live preview only (see `primaryBcp47`). */
  lang: string;
  /** Upload the finished recording and resolve with the transcript. */
  onTranscribe: (audio: { data: string; mimeType: string }) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  /** 0–1, driven by the analyser — the fallback "something is happening" cue. */
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** False once the user lets go — guards the async gap before the mic opens. */
  const wantRecordingRef = useRef(false);
  // Latest callbacks, so the teardown effect never re-runs mid-recording. Synced
  // in an effect rather than during render — they're only ever read from event
  // handlers and timers, which run well after the commit.
  const onTranscribeRef = useRef(onTranscribe);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTranscribeRef.current = onTranscribe;
    onErrorRef.current = onError;
  });

  const liveSupported = typeof window !== "undefined" && recognitionCtor() !== null;

  /** Release the mic, the analyser and the recognizer. Safe to call twice. */
  const teardown = useCallback(() => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    // Stopping every track is what actually clears the browser's recording
    // indicator — releasing the MediaRecorder alone leaves the mic hot.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLevel(0);
  }, []);

  // Never leave the mic open if the composer unmounts (mode switch, navigation).
  useEffect(() => () => teardown(), [teardown]);

  const stop = useCallback(() => {
    wantRecordingRef.current = false;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      // Released before the mic finished opening — `start` sees the flag and
      // tears itself down, so there's nothing to stop.
      return;
    }
    recorder.stop(); // → onstop, which uploads and tears down
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    wantRecordingRef.current = true;
    setInterim("");
    setState("starting");

    // No mic API at all: served over plain http from something other than
    // localhost, or an embedder that stripped it. Worth its own message —
    // "allow it in your browser" is actively wrong here, there's nothing to
    // allow.
    if (!navigator.mediaDevices?.getUserMedia) {
      wantRecordingRef.current = false;
      setState("idle");
      onErrorRef.current(
        window.isSecureContext
          ? "This browser doesn't support recording audio."
          : "Voice entry needs a secure connection — open the app over https (or localhost).",
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      wantRecordingRef.current = false;
      setState("idle");
      onErrorRef.current(await describeMicError(err));
      return;
    }

    // Let go during the permission prompt — honour that, don't start recording.
    if (!wantRecordingRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      setState("idle");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    startedAtRef.current = Date.now();

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      // A browser that reported the type as supported but won't construct with
      // it. Nothing is recoverable from here — release the mic and say so.
      wantRecordingRef.current = false;
      teardown();
      setState("idle");
      onErrorRef.current("This browser can't record audio.");
      return;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const heldMs = Date.now() - startedAtRef.current;
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      recorderRef.current = null;
      teardown();
      setInterim("");

      if (heldMs < MIN_RECORDING_MS || blob.size === 0) {
        setState("idle");
        onErrorRef.current("Hold the mic while you speak.");
        return;
      }

      setState("transcribing");
      try {
        await onTranscribeRef.current({ data: await toBase64(blob), mimeType: type });
      } finally {
        setState("idle");
      }
    };

    recorder.start();
    setState("recording");

    // The release could have landed in the gap between `stop()` finding an
    // inactive recorder (so returning without stopping anything) and this line.
    // Without this re-check a quick tap would record until the auto-stop.
    if (!wantRecordingRef.current) {
      recorder.stop();
      return;
    }

    // Hard stop, so a stuck key (or a forgotten hold) can't run the mic forever.
    autoStopRef.current = setTimeout(() => stop(), MAX_RECORDING_MS);

    // Level meter — the visual heartbeat, and the whole fallback where Web
    // Speech is missing. Reads the time-domain buffer rather than the FFT: peak
    // amplitude tracks "is someone talking" better than any frequency bin.
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          // /128 normalizes to 0–1; the ×2.2 lift makes ordinary speech fill the
          // meter rather than hovering near the floor.
          setLevel(Math.min(1, (peak / 128) * 2.2));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }
    } catch {
      /* the meter is decoration — never fail a recording over it */
    }

    // Live preview. Everything here is best-effort: a recognizer that refuses to
    // start, errors, or isn't supported just means no interim text.
    const Recognition = recognitionCtor();
    if (Recognition) {
      try {
        const recognition = new Recognition();
        recognition.lang = lang;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.onresult = (e) => {
          let text = "";
          for (let i = 0; i < e.results.length; i++) {
            text += e.results[i]![0]!.transcript;
          }
          setInterim(text.trim());
        };
        recognition.onerror = () => {};
        recognition.onend = () => {};
        recognition.start();
        recognitionRef.current = recognition;
      } catch {
        /* no live preview on this browser — the recording is unaffected */
      }
    }
  }, [lang, state, stop, teardown]);

  return { state, interim, level, liveSupported, start, stop };
}
