"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { finishProductTour } from "@/actions/settings";
import { hasOpenOverlay } from "@/hooks/use-shortcut";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  isOnScreen,
  placeCard,
  spotlightBox,
  tourStepsFor,
  type TourBox,
  type TourStep,
  type TourTarget,
} from "@/lib/product-tour";
import { usePlan } from "./upgrade-dialog";
import {
  onProductTourRequest,
  productTourRequested,
  takeProductTourRequest,
} from "./product-tour-store";

/**
 * How long a first visit waits before the tour opens. Long enough for the page
 * to settle — the composer has put the caret in itself (so the tour hands focus
 * back there when it ends) and the streamed header has its height — so the
 * first spotlight lands where the target is going to stay.
 */
const AUTO_START_MS = 700;
/** A replay waits for the account menu that asked for it to close and hand its focus back. */
const REPLAY_START_MS = 150;
/** An overlay already open when the tour is due (a dialog, a menu): try again after this long. */
const RETRY_MS = 1000;

/**
 * The window's size without its scrollbar. The card and the hole are `fixed`,
 * so this is the box they have to stay inside.
 */
function viewportSize() {
  const root = document.documentElement;
  return { width: root.clientWidth, height: root.clientHeight };
}

/**
 * Laid out and not hidden. `getClientRects()` is empty under any `display:
 * none` (the sidebar on a phone, the bottom bar on a desktop); `visibility` is
 * inherited, so the computed value also sees the composer's `invisible` pane,
 * whose twin of the Manual/AI toggle sits on the very pixel the visible one
 * does.
 */
function isShown(el: Element): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility === "visible";
}

/** The first shown element carrying one of the anchors, in the step's order. */
function findTarget(targets: readonly TourTarget[]): HTMLElement | null {
  for (const target of targets) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
      if (isShown(el)) return el;
    }
  }
  return null;
}

type Run = {
  steps: TourStep[];
  /** A first-visit run marks the tour done when it ends; a replay writes nothing. */
  persist: boolean;
};

/**
 * The tracker's step-by-step tour: a card beside each feature in turn, with
 * the page dimmed around a spotlight on it. It opens by itself once — on a new
 * account's first visit (`ui_prefs.onboarding.tourPending`, which only a new
 * account's bootstrap sets) — and again whenever "Take the tour" is picked from
 * the account menu.
 *
 * Built on Radix's Dialog, which brings the modal plumbing: focus moves in and
 * is held there (Tab cycles the card), Escape skips, the rest of the page is
 * hidden from assistive tech and from the pointer. Its content is the whole
 * window rather than the card, so a tap on the dimmed page lands *inside* the
 * dialog: it neither dismisses the tour nor reaches the page underneath (the
 * tracker's swipe-to-switch-profile included, which stands down inside any
 * `role="dialog"`).
 *
 * Positioning is imperative. Each frame re-finds the target and writes the
 * card's and the hole's positions straight to the DOM, only when they moved:
 * that one loop follows scrolling, resizing, the composer growing and a phone
 * rotating, without a re-render per frame. The maths is `lib/product-tour.ts`.
 */
export function ProductTour({ autoStart }: { autoStart: boolean }) {
  const { voiceAllowed } = usePlan();
  const reducedMotion = useReducedMotion();
  const [run, setRun] = useState<Run | null>(null);
  const [index, setIndex] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const holeRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  // Where focus was when the tour opened, for it to go back to. Radix sends it
  // to the dialog's trigger, and this dialog has none.
  const returnFocus = useRef<HTMLElement | null>(null);
  const persisted = useRef(false);

  const start = useCallback(
    (persist: boolean) => {
      // Decided once, at the start, so "Step n of N" can't change under the
      // reader. A step whose target later disappears (a resize across the
      // phone breakpoint) re-anchors to its fallback or centres its card.
      const steps = tourStepsFor({
        voice: voiceAllowed,
        hasTarget: (target) => findTarget([target]) !== null,
      });
      if (steps.length === 0) return;
      const active = document.activeElement;
      returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
      setIndex(0);
      setRun({ steps, persist });
    },
    [voiceAllowed],
  );
  // The timers below read the latest `start` without restarting on every change of it.
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  // First visit: once per mount. Not over another overlay — two modal layers
  // fight over focus — so an open dialog or menu just pushes the start back.
  useEffect(() => {
    if (!autoStart) return;
    let timer = 0;
    const attempt = () => {
      if (hasOpenOverlay()) {
        timer = window.setTimeout(attempt, RETRY_MS);
        return;
      }
      startRef.current(true);
    };
    timer = window.setTimeout(attempt, AUTO_START_MS);
    return () => window.clearTimeout(timer);
  }, [autoStart]);

  // Replays. The request is taken inside the timer, not when it's noticed: in
  // development React runs this effect twice, and a request taken by the first
  // run would be gone by the time the second one's timer fires.
  useEffect(() => {
    let timer = 0;
    const check = () => {
      if (!productTourRequested()) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (takeProductTourRequest()) startRef.current(false);
      }, REPLAY_START_MS);
    };
    check(); // asked for on another page, before the tracker mounted
    const unsubscribe = onProductTourRequest(check);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const finish = useCallback(() => {
    // Fired and forgotten, like the onboarding cards' writes: the tour is
    // already gone, and a failed write only means it's offered again next visit.
    if (run?.persist && !persisted.current) {
      persisted.current = true;
      void finishProductTour().catch(() => {});
    }
    setRun(null);
  }, [run]);

  const step = run?.steps[index] ?? null;
  const total = run?.steps.length ?? 0;
  const isLast = index === total - 1;

  function next() {
    if (isLast) finish();
    else setIndex((i) => i + 1);
  }

  function back() {
    if (index === 0) return;
    // Back disappears on the first step; hand focus to Next before it does, or
    // it falls to the dialog itself and the next Enter does nothing.
    if (index === 1) nextRef.current?.focus();
    setIndex((i) => i - 1);
  }

  // Bring the target into view once per step (the loop below follows it from there).
  useEffect(() => {
    if (!step) return;
    findTarget(step.targets)?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [step, reducedMotion]);

  useEffect(() => {
    if (!step) return;
    let frame = 0;
    let last = "";
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const card = cardRef.current;
      const hole = holeRef.current;
      if (!card || !hole) return;
      const viewport = viewportSize();
      // Re-found every frame, not kept: crossing the phone breakpoint swaps the
      // sidebar for the top bar's button, and the composer swaps toggle twins.
      const rect = findTarget(step.targets)?.getBoundingClientRect();
      const target: TourBox | null =
        rect && isOnScreen(rect, viewport)
          ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          : null;
      const place = placeCard({
        target,
        card: { width: card.offsetWidth, height: card.offsetHeight },
        viewport,
        sides: step.sides,
        align: step.align,
      });
      // No target: a zero-size hole mid-screen, whose shadow dims everything.
      const box = target
        ? spotlightBox(target, viewport)
        : { top: viewport.height / 2, left: viewport.width / 2, width: 0, height: 0 };
      const key = [place.top, place.left, box.top, box.left, box.width, box.height]
        .map(Math.round)
        .join();
      if (key === last) {
        // Settled for a frame: from here the hole glides between steps instead
        // of flying in from the corner on the first one.
        if (!("animate" in hole.dataset)) hole.dataset.animate = "";
        return;
      }
      last = key;
      card.style.transform = `translate(${Math.round(place.left)}px, ${Math.round(place.top)}px)`;
      if (!("placed" in card.dataset)) card.dataset.placed = "";
      hole.style.top = `${box.top}px`;
      hole.style.left = `${box.left}px`;
      hole.style.width = `${box.width}px`;
      hole.style.height = `${box.height}px`;
      hole.toggleAttribute("data-empty", !target);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step]);

  return (
    <DialogPrimitive.Root
      open={run !== null}
      onOpenChange={(open) => {
        if (!open) finish();
      }}
    >
      <DialogPrimitive.Portal>
        {step && (
          <DialogPrimitive.Content
            // The whole window, not just the card — see the component's note.
            className="fixed inset-0 z-50 outline-none"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              nextRef.current?.focus();
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const el = returnFocus.current;
              returnFocus.current = null;
              if (el?.isConnected) el.focus({ preventScroll: true });
            }}
            // A toast is the only thing left outside to click; it mustn't end the tour.
            onInteractOutside={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              // Every key stops here. The composer's and the app's shortcuts
              // listen on `window`; most already stand down for an open
              // `role="dialog"` (`hasOpenOverlay`), but not all of them (Shift+1
              // switches profile from anywhere), and none of them should act
              // under a tour. Escape is unaffected — Radix hears it on the
              // document, before this — and so is Tab, trapped by the dialog.
              e.stopPropagation();
              if (e.key === "ArrowRight" && !isLast) {
                e.preventDefault();
                next();
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                back();
              }
            }}
          >
            {/* The spotlight: a hole the size of the target, whose enormous
                shadow is the dimmed page. `200vmax` covers the window from a
                hole in any corner. The glide between steps is a transition, so
                the reduced-motion rule in globals.css stills it. */}
            <div
              ref={holeRef}
              aria-hidden
              className="pointer-events-none fixed top-0 left-0 rounded-xl shadow-[0_0_0_200vmax_rgb(0_0_0/0.45)] outline-2 outline-ring data-animate:transition-[top,left,width,height] data-animate:duration-200 data-animate:ease-out data-empty:outline-none dark:shadow-[0_0_0_200vmax_rgb(0_0_0/0.65)]"
            />
            <div
              ref={cardRef}
              // Hidden until the loop has placed it, so it never shows at 0,0.
              className="invisible fixed top-0 left-0 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg data-placed:visible"
            >
              {/* Polite live region: moving to the next step changes the text
                  under the reader's focus (which stays on Next), so it's read
                  out rather than left for them to go looking for. */}
              <div aria-live="polite">
                <p className="text-xs font-medium text-muted-foreground tabular-nums">
                  Step {index + 1} of {total}
                </p>
                <DialogPrimitive.Title className="mt-1 text-base font-semibold">
                  {step.title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {step.body}
                </DialogPrimitive.Description>
              </div>
              {step.hint && (
                // Shortcuts are for keyboards; a phone gets the words alone.
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground pointer-coarse:hidden">
                  {step.hint.text} <Kbd combo={step.hint.combo} describe />
                </p>
              )}
              <div className="mt-4 flex items-center gap-2">
                {!isLast && (
                  <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={finish}>
                    Skip tour
                  </Button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {index > 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={back}>
                      Back
                    </Button>
                  )}
                  <Button ref={nextRef} type="button" size="sm" onClick={next}>
                    {isLast ? "Done" : "Next"}
                  </Button>
                </div>
              </div>
            </div>
          </DialogPrimitive.Content>
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
