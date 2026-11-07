"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { finishProductTour } from "@/actions/settings";
import { hasOpenOverlay } from "@/hooks/use-shortcut";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  isOnScreen,
  pagesNote,
  placeCard,
  spotlightBox,
  tourModeFor,
  tourStepsFor,
  type TourBox,
  type TourMode,
  type TourStep,
  type TourTarget,
} from "@/lib/product-tour";
import { showEntryMode } from "./entry-mode-store";
import { useOnboardingFlow } from "./onboarding-flow";
import { usePlan } from "./upgrade-dialog";
import {
  onProductTourRequest,
  productTourRequested,
  showAccountMenu,
  takeProductTourRequest,
} from "./product-tour-store";

/**
 * How long after the tracker mounts a first visit's tour may open. Long enough
 * for the page to settle — the composer has put the caret in itself (so the
 * tour hands focus back there when it ends) and the streamed header has its
 * height — so the first spotlight lands where the target is going to stay.
 * Counted from the mount, not from the tour's turn: after the welcome's other
 * popups the page settled long ago, and the tour takes over at once.
 */
const AUTO_START_MS = 700;
/** A replay waits for the account menu that asked for it to close and hand its focus back. */
const REPLAY_START_MS = 150;
/** How long after the card first shows that focus is held inside it (see the placement loop). */
const FOCUS_HOLD_MS = 600;
/** An overlay already open when the tour is due (a dialog, a menu): look again this often. */
const RETRY_MS = 250;
/**
 * The most a step waits for what it shows before placing its card anyway: the
 * composer in the step's mode, or the menu the step opens. Either renders in a
 * frame or two; this only stops one that never comes from holding the tour up
 * for good.
 */
const SHOW_WAIT_MS = 1000;

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

/**
 * There for a step to point at once the step is up: shown, or laid out in the
 * composer's hidden pane — AI's mic, under Manual — which the step that needs
 * it switches the composer to first (`TourStep.mode`). A pane taken out of
 * layout altogether (AI's, while it holds a review list) has no mic in it.
 */
function isPresent(el: Element): boolean {
  if (isShown(el)) return true;
  const composer = el.closest('[data-tour="composer"]');
  return composer !== null && composer !== el && isShown(composer) && el.getClientRects().length > 0;
}

/** The first shown element carrying one of the anchors, in the step's order. */
function findTarget(
  targets: readonly TourTarget[],
  usable: (el: Element) => boolean = isShown,
): HTMLElement | null {
  for (const target of targets) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
      if (usable(el)) return el;
    }
  }
  return null;
}

/**
 * The composer is drawn in `mode`: its visible Manual/AI switch is the one in
 * that mode's pane (each pane renders its own, only one is shown), with that
 * side checked. What a mode step waits for before it places its card, so the
 * spotlight never frames the pane that's on its way out.
 */
function composerShows(mode: TourMode): boolean {
  const toggle = findTarget(["entry-mode"]);
  if (toggle?.dataset.pane !== mode) return false;
  const checked = toggle.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
  return checked?.dataset.mode === mode;
}

type Run = {
  steps: TourStep[];
  /** A first-visit run marks the tour done when it ends; a replay writes nothing. */
  persist: boolean;
  /** "Files is under More." for a step whose pages lack a row of their own, by step id. */
  notes: Record<string, string>;
};

/**
 * The tracker's step-by-step tour: a card beside each feature in turn, with
 * the page dimmed around a spotlight on it. It opens by itself once — on a new
 * account's first visit (`ui_prefs.onboarding.tourPending`, which only a new
 * account's bootstrap sets), as the welcome's last popup, the moment the one
 * before it is answered (`OnboardingFlowProvider`) — and again whenever "Take
 * the tour" is picked from the account menu. Its last step opens that menu and
 * spotlights the row (`TourStep.opens`), so it's seen where it will be.
 *
 * Built on Radix's Dialog, which brings the modal plumbing: focus moves in and
 * is held there (Tab cycles the card), Escape skips, the rest of the page is
 * hidden from assistive tech and from the pointer. Its content is the whole
 * window rather than the card, so a tap on the dimmed page lands *inside* the
 * dialog: it neither dismisses the tour nor reaches the page underneath (the
 * tracker's swipe-to-switch-profile included, which stands down inside any
 * `role="dialog"`).
 *
 * A step can show the composer in Manual or AI mode (`TourStep.mode`). It
 * switches through the composer's own store, as shown-not-saved
 * (`showEntryMode`), so the real Manual/AI switch reads as checked, and the end
 * of the tour — however it ends — leaves the person's own choice in place.
 *
 * A step with an `action` has no Next: the reader presses the spotlit control
 * to go on. The page under the tour can't be clicked (it's a modal), so a
 * transparent button sits exactly over the hole and takes that press — it
 * looks and feels like pressing the control itself, and it's a real, labelled
 * button for a keyboard or a screen reader.
 *
 * Positioning is imperative. Each frame re-finds the target and writes the
 * card's and the hole's positions straight to the DOM, only when they moved:
 * that one loop follows scrolling, resizing, the composer growing and a phone
 * rotating, without a re-render per frame. The maths is `lib/product-tour.ts`.
 */
export function ProductTour({ autoStart }: { autoStart: boolean }) {
  const { voiceAllowed } = usePlan();
  const { turn } = useOnboardingFlow();
  // The welcome's popups before it go first: the tour is due once it's its turn.
  const due = autoStart && turn === "tour";
  const reducedMotion = useReducedMotion();
  const [run, setRun] = useState<Run | null>(null);
  const [index, setIndex] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const holeRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
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
        hasTarget: (target) => findTarget([target], isPresent) !== null,
      });
      if (steps.length === 0) return;
      const notes: Record<string, string> = {};
      for (const step of steps) {
        const note = pagesNote(step, (target) => findTarget([target]) !== null);
        if (note) notes[step.id] = note;
      }
      const active = document.activeElement;
      returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
      setIndex(0);
      setRun({ steps, persist, notes });
    },
    [voiceAllowed],
  );
  // The timers below read the latest `start` without restarting on every change of it.
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  // When the tracker mounted, for the settle-in wait below.
  const mountedAt = useRef<number | null>(null);
  useEffect(() => {
    mountedAt.current ??= performance.now();
  }, []);
  // Started by itself already: a turn that goes back and comes again (a save
  // of the popup before it failed and was redone) mustn't start it twice.
  const autoStarted = useRef(false);

  // First visit: once per mount. Not over another overlay — two modal layers
  // fight over focus — so an open dialog or menu just pushes the start back.
  // One that's only closing doesn't: that's the popup before it handing over.
  useEffect(() => {
    if (!due || autoStarted.current) return;
    let timer = 0;
    const attempt = () => {
      if (hasOpenOverlay({ ignoreClosing: true })) {
        timer = window.setTimeout(attempt, RETRY_MS);
        return;
      }
      autoStarted.current = true;
      startRef.current(true);
    };
    const settled = performance.now() - (mountedAt.current ?? performance.now());
    timer = window.setTimeout(attempt, Math.max(0, AUTO_START_MS - settled));
    return () => window.clearTimeout(timer);
  }, [due]);

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
    // The composer goes back to the person's own mode in the same render the
    // tour closes in, so focus returning to a field of that mode finds it shown.
    showEntryMode(null);
    setRun(null);
  }, [run]);

  const step = run?.steps[index] ?? null;
  const total = run?.steps.length ?? 0;
  const isLast = index === total - 1;
  const note = step ? run?.notes[step.id] : undefined;
  const action = step?.action ?? null;

  // The composer's mode for this step: shown, not saved (see the store), so
  // ending the tour — or the tab closing mid-tour — leaves the person's choice
  // as it was. A layout effect, so the switch is drawn before the step's first
  // paint rather than a frame after it.
  const tourMode = run ? tourModeFor(run.steps, index) : null;
  useLayoutEffect(() => {
    showEntryMode(tourMode);
  }, [tourMode]);
  // Leaving the tracker with the tour up (the browser's Back) ends it too.
  useEffect(() => () => showEntryMode(null), []);

  // A step inside a menu opens it: the copy whose button is on screen (the
  // menu is drawn in the phone's top bar and the desktop corner), followed
  // every frame in case a resize swaps them. Shut again when the step is left.
  const opens = step?.opens ?? null;
  useEffect(() => {
    if (!opens) return;
    let frame = 0;
    const follow = () => {
      showAccountMenu(findTarget([opens]));
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => {
      cancelAnimationFrame(frame);
      showAccountMenu(null);
    };
  }, [opens]);

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

  // Into and out of an action step the button that had focus goes away (Next
  // isn't on one; the press-it button is only on one), so focus moves to the
  // step's own way on: the press-it button there, Next everywhere else.
  useEffect(() => {
    if (!step) return;
    const frame = requestAnimationFrame(() => {
      const card = cardRef.current;
      const active = document.activeElement;
      const inTour = active === actionRef.current || (card?.contains(active) ?? false);
      if (step.action) {
        if (active !== actionRef.current) actionRef.current?.focus({ preventScroll: true });
      } else if (!inTour) {
        nextRef.current?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);

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
    const since = performance.now();
    // When the card was first shown, if this step is the one that showed it.
    let placedAt: number | null = null;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const card = cardRef.current;
      const hole = holeRef.current;
      if (!card || !hole) return;
      // Focus follows the card being shown: while it was `invisible` it couldn't
      // take focus, so the dialog's own move to Next on open found nothing. For
      // a moment after, focus is held in: a replay from the account menu races
      // the menu's closing animation, which hands focus back to its button —
      // and the arrow keys, heard on the card, would have nowhere to land.
      if (
        placedAt !== null &&
        performance.now() - placedAt < FOCUS_HOLD_MS &&
        !card.contains(document.activeElement) &&
        document.activeElement !== actionRef.current
      ) {
        (step.action ? actionRef.current : nextRef.current)?.focus({ preventScroll: true });
      }
      const viewport = viewportSize();
      // Re-found every frame, not kept: crossing the phone breakpoint swaps the
      // sidebar for the top bar's button and the sidebar's list for the bottom bar.
      const el = findTarget(step.targets);
      // A step that switches the composer's mode, or opens a menu, holds its
      // card and spotlight where they were until the composer is drawn in that
      // mode or the menu is open. Otherwise the card would jump to the middle
      // for a frame, or the spotlight frame the pane on its way out.
      const waiting = el ? step.mode !== undefined && !composerShows(step.mode) : step.opens !== undefined;
      if (waiting && performance.now() - since < SHOW_WAIT_MS) return;
      const rect = el?.getBoundingClientRect();
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
      if (!("placed" in card.dataset)) {
        card.dataset.placed = "";
        placedAt = performance.now();
      }
      hole.style.top = `${box.top}px`;
      hole.style.left = `${box.left}px`;
      hole.style.width = `${box.width}px`;
      hole.style.height = `${box.height}px`;
      hole.toggleAttribute("data-empty", !target);
      // The press-it button covers the hole exactly (and nothing when there's no target).
      const press = actionRef.current;
      if (press) {
        press.style.top = `${box.top}px`;
        press.style.left = `${box.left}px`;
        press.style.width = `${box.width}px`;
        press.style.height = `${box.height}px`;
      }
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
              if (e.key === "ArrowRight" && !isLast && !action) {
                e.preventDefault();
                next();
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                back();
              } else if (e.key === "Escape" && step.opens) {
                // The menu the step opened is the top layer, so Radix gives it
                // Escape instead of the tour. The menu stays open while the
                // tour shows it, so Escape skips the tour here as it does on
                // every other step.
                e.preventDefault();
                finish();
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
            {action && (
              // Placed over the hole by the loop below; the pulsing ring says "press here".
              <button
                ref={actionRef}
                type="button"
                aria-label={action.label}
                onClick={next}
                className="fixed top-0 left-0 size-0 cursor-pointer rounded-xl ring-2 ring-primary/70 outline-none focus-visible:ring-[3px] focus-visible:ring-ring motion-safe:animate-pulse"
              />
            )}
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
                {step.pages && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {step.pages.map((page) => (
                      <li key={page.label} className="text-muted-foreground">
                        <span className="font-medium text-foreground">{page.label}</span> — {page.text}
                      </li>
                    ))}
                  </ul>
                )}
                {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
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
                  {action ? (
                    <span className="text-xs font-medium text-foreground">{action.prompt}</span>
                  ) : (
                    <Button ref={nextRef} type="button" size="sm" onClick={next}>
                      {isLast ? "Done" : "Next"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </DialogPrimitive.Content>
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
