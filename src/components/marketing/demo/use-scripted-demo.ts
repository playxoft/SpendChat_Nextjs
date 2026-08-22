"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The scheduler every scripted marketing demo runs on.
 *
 * The feature-page demos (`ai-demo.tsx`, `voice-demo.tsx`) each grew their own
 * copy of the same four things: an array of timer ids, an `at(ms, fn)` helper
 * that queues one beat against it, a `clearTimers` on unmount, and an
 * `IntersectionObserver` that plays the sequence once when the demo scrolls
 * into view. This is that shape, extracted, so the homepage's four entry
 * previews share one engine instead of adding a fifth and sixth copy.
 *
 * Three properties are worth stating, because they're the reasons it looks like
 * this rather than like a `useEffect` that animates:
 *
 * **It never starts on mount.** A homepage runs its animations above the fold
 * before anyone has scrolled to them, and by the time the section is on screen
 * the show is over. The observer is what fixes that, and it fires once.
 *
 * **`play` is never called from an effect body.** It sets state synchronously,
 * and `react-hooks/set-state-in-effect` fails the build on that — correctly, in
 * fact, since a render-phase-adjacent write here is the double-render bug that
 * makes a typing animation stutter. Every call site is a callback: the observer,
 * a click, a tab change. That's also why `play` lives in a ref — the observer
 * effect runs once, so a directly-captured `play` would be frozen at whatever
 * the state (and the visitor's resolved currency) was on the first render.
 *
 * **Reduced motion is the caller's business.** The hook has no opinion about
 * what "finished" looks like, so `play` checks `useReducedMotion()` itself and
 * jumps to the end state instead of scheduling anything.
 */

/** Queue one beat, `ms` after the sequence started. */
export type ScriptAt = (ms: number, fn: () => void) => void;

export function useScriptedDemo(
  play: () => void,
  { threshold = 0.3 }: { threshold?: number } = {},
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const played = useRef(false);

  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  const at = useCallback<ScriptAt>((ms, fn) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  /** Cancel whatever is running and play from the top. */
  const start = useCallback(() => {
    played.current = true;
    clearTimers();
    playRef.current();
  }, [clearTimers]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !played.current) {
            played.current = true;
            clearTimers();
            playRef.current();
          }
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [clearTimers, threshold]);

  useEffect(() => clearTimers, [clearTimers]);

  return { containerRef, at, clearTimers, start };
}
