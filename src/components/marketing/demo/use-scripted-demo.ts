"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The scheduler every scripted marketing demo runs on.
 *
 * The feature-page demos (`ai-demo.tsx`, `voice-demo.tsx`) each grew their own
 * copy of the same four things: an array of timer ids, an `at(ms, fn)` helper
 * that queues one beat against it, a `clearTimers` on unmount, and an
 * `IntersectionObserver` that plays the sequence once when the demo scrolls
 * into view. This is that shape, extracted; both of them and the homepage's
 * four entry previews now run on it, so there is one scheduler to fix rather
 * than three that had already drifted apart.
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

/**
 * How finely the observer is asked to report.
 *
 * `thresholds` decide only *when* the callback is queued, never what counts as
 * visible — so the gate below has to compare ratios itself, and it can only
 * compare the ratios it is woken up for. A container taller than the viewport
 * never reaches a high ratio at all (see `coveredEnough`), so asking for the
 * caller's single threshold would mean, on a short screen, exactly one callback
 * — the one at a single visible pixel — and a demo that never plays. Sampling
 * every 5% costs a handful of callbacks per scroll-through, and the observer
 * disconnects itself the moment the script starts.
 */
const RATIO_STEPS = Array.from({ length: 21 }, (_, i) => i / 20);

/**
 * Has enough of the demo arrived to be worth starting it?
 *
 * **Not `entry.isIntersecting`.** That is true for a *single* intersecting
 * pixel whatever `threshold` says, so gating on it made the option dead: the
 * false→true transition fires at a ratio of ~0.001, which started these scripts
 * the moment the container's top edge crossed the bottom of the viewport — on
 * the AI feature page, ~700px of scrolling before the composer everyone is
 * meant to watch is on screen. A ~4s script could finish unseen, which is the
 * precise failure the observer exists to prevent.
 *
 * The fraction is measured against `min(element, viewport)` rather than against
 * the element alone, because these containers are routinely taller than the
 * screen: the AI demo's is ~716px and the voice demo's ~814px, so on a
 * landscape phone (~380px tall) the ratio *tops out* near 0.47, and on anything
 * shorter than ~285px it can never reach 0.35 — a plain `ratio >= threshold`
 * would mean the script simply never played there. Against the most of the
 * element that could ever be on screen at once, "35%" keeps meaning the same
 * thing on both: a third of the demo on a tall screen, a third of the screen
 * full of demo on a short one, and on a short screen the condition is always
 * reachable because the element can always fill it.
 *
 * Height only: the page scrolls vertically, and these blocks are full-width, so
 * the horizontal axis has nothing to say about whether the demo has arrived.
 */
function coveredEnough(entry: IntersectionObserverEntry, threshold: number): boolean {
  const visible = entry.intersectionRect.height;
  if (visible <= 0) return false;
  // `rootBounds` is null in a few cross-origin framing cases; the viewport is
  // the root here, so its own height is the right stand-in.
  const rootHeight = entry.rootBounds?.height ?? window.innerHeight;
  const showable = Math.min(entry.boundingClientRect.height, rootHeight);
  if (showable <= 0) return false;
  return visible / showable >= threshold;
}

export function useScriptedDemo(
  /**
   * The script. Receives the scheduler as its argument rather than closing over
   * it, so a caller whose `play` is defined before this hook runs doesn't have
   * to smuggle `at` in through a ref — a render-phase ref write, which React
   * and the lint rule both object to.
   */
  play: (at: ScriptAt) => void,
  {
    /**
     * How much of the demo has to be on screen before it plays — as a fraction
     * of the element, or of the viewport where the element is the taller of the
     * two. See `coveredEnough`.
     */
    threshold = 0.3,
    /**
     * Play once when the container scrolls into view. Turn this off where the
     * caller owns its own trigger — the homepage's entry sequence watches four
     * separate step elements and restarts the script each time a different one
     * takes the middle of the viewport, which is a different question from
     * "has this appeared yet".
     */
    autoPlay = true,
  }: { threshold?: number; autoPlay?: boolean } = {},
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

  const run = useCallback(() => playRef.current(at), [at]);

  /** Cancel whatever is running and play from the top. */
  const start = useCallback(() => {
    played.current = true;
    clearTimers();
    run();
  }, [clearTimers, run]);

  useEffect(() => {
    if (!autoPlay) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (played.current || !coveredEnough(entry, threshold)) continue;
          played.current = true;
          // Nothing left to watch for: it fires once, and the dense threshold
          // list above would otherwise keep waking this up all the way down.
          observer.disconnect();
          clearTimers();
          run();
        }
      },
      // The caller's own threshold is included, so a demo shorter than the
      // viewport starts at exactly the fraction it asked for rather than at the
      // next 5% step past it.
      { threshold: [...RATIO_STEPS, threshold] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [autoPlay, clearTimers, run, threshold]);

  useEffect(() => clearTimers, [clearTimers]);

  return { containerRef, at, clearTimers, start, run };
}
