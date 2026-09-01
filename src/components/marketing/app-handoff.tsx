"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  clearPromptDismissal,
  dismissPrompt,
  getHandoffServerSnapshot,
  getHandoffSnapshot,
  handoffView,
  setPrefersApp,
  subscribeHandoff,
} from "@/lib/app-redirect";
import { cn } from "@/lib/utils";

/**
 * The landing page's handoff for someone who is already signed in: a card on
 * the right offering the app, with a checkbox to make that the default.
 *
 * Signed-out visitors — and every crawler, which carries no cookies — get
 * nothing at all: this renders `null` and `/` behaves exactly as it always has.
 * That is the whole reason the state lives in cookies read on the client (see
 * `lib/app-redirect.ts`); the page stays statically rendered and indexable.
 *
 * Once the box is ticked, `/` stops rendering for that browser **from the next
 * visit** and goes straight to `/app`. `?stay=1` is the way back — it suppresses
 * the redirect for one visit and shows this card with the box already ticked, so
 * the switch that turned the behaviour on is also the one that turns it off.
 * `handoffView` decides which of the three states this is; everything here is
 * the rendering of that decision.
 *
 * The card also shows itself out: it fades after ten seconds unless the visitor
 * reaches for it, or unless it's the one card holding the only way out of where
 * they are. See `AUTO_HIDE_MS`.
 */

/** How long to wait for `/app` before giving the page back. Long enough that a
 * slow cold start still lands on the app, short enough that a failed navigation
 * isn't an indefinite cover over a page the visitor can't reach. */
const REDIRECT_TIMEOUT_MS = 6000;

/**
 * How long the card offers itself before stepping out of the way.
 *
 * It's an offer, not a task. Someone who came to read the landing page has
 * already answered it by continuing to read, and a card that sits in the corner
 * for the whole visit is just something covering the page. Long enough to
 * notice, read, and reach for; short enough that it's gone by the second
 * section.
 *
 * Deliberately **not** recorded as a dismissal. `dismissPrompt()` is for the ✕,
 * a decision, and it lasts the session — spending that on a timeout would take
 * the "always take me straight here" checkbox off the table for the rest of the
 * tab, and this card is the only place it exists.
 */
const AUTO_HIDE_MS = 10_000;

/** Matches the fade below, so the node leaves after it has finished fading. */
const FADE_OUT_MS = 300;

export function AppHandoff() {
  const router = useRouter();
  // Everything comes from one external store, including `?stay=1` — reading the
  // URL with `useSearchParams` would force this page into a Suspense boundary
  // or out of static rendering. During hydration the store serves the frozen
  // server snapshot ("signed out"), so the prerendered HTML and the first
  // client render agree; the real values land on the re-render straight after.
  const state = useSyncExternalStore(
    subscribeHandoff,
    getHandoffSnapshot,
    getHandoffServerSnapshot,
  );

  // What arrival looked like — see `handoffView`'s `arrivedWithPreference`.
  // Read in the initializer rather than an effect so the cover paints on the
  // same commit as the first real snapshot, with no frame of landing page in
  // between; it can't affect hydration, because the store is still serving its
  // "signed out" server snapshot on that render.
  const [arrivedWithPreference] = useState(() => {
    if (typeof window === "undefined") return false;
    const arrival = getHandoffSnapshot();
    return arrival.signedIn && arrival.prefers;
  });

  // Dismissal, held here as well as in sessionStorage: storage throws in a
  // private or partitioned context, and without this the ✕ would dispatch its
  // event, the store would re-read the same "not dismissed", and the button
  // would visibly do nothing.
  const [dismissedHere, setDismissedHere] = useState(false);
  // `/app` was asked for and never arrived.
  const [stalled, setStalled] = useState(false);
  // The auto-hide, in its two halves: fading, then gone.
  const [fadingOut, setFadingOut] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  // Pointing at the card pauses the countdown and moving away restarts it —
  // hovering isn't a decision, and a card that vanishes out from under the
  // cursor is worse than one that overstays. Kept separate from `engaged`
  // precisely because it *is* reversible: a cursor that happens to be resting
  // where the card appears would otherwise pin it there for the whole visit.
  const [hovering, setHovering] = useState(false);
  // Focus, on the other hand, is someone tabbing into the card. That's a real
  // interaction with a control, and it stops the timer for good.
  const [engaged, setEngaged] = useState(false);
  const coverRef = useRef<HTMLDialogElement>(null);

  // Arriving on `?stay=1` is a request for this card, so it outranks a ✕ from
  // earlier in the tab — otherwise the dismissal would hide the only control
  // that can turn the preference off. Pressing ✕ *here* still works: that sets
  // `dismissedHere` for this page view.
  // Read from the store rather than from `state`, so this is unambiguously an
  // arrival-only effect: re-running it whenever `stay` flips would undo a
  // dismissal the visitor made on this very page.
  useEffect(() => {
    if (getHandoffSnapshot().stay) clearPromptDismissal();
  }, []);

  const view = handoffView(
    { ...state, dismissed: state.dismissed || dismissedHere },
    { arrivedWithPreference, stalled },
  );

  useEffect(() => {
    if (view !== "redirect") return;
    router.replace("/app");
    // `router.replace` reports nothing back: if the RSC fetch 5xxes, times out
    // on a cold DB, or the visitor is offline with the static shell cached,
    // `view` stays "redirect" forever and the cover below sits over a fully
    // rendered page with no way through it — the preference that put them there
    // is only editable from behind it. Give the page back instead; the card's
    // "Go to app" is a plain link, i.e. a real second attempt.
    const timer = setTimeout(() => setStalled(true), REDIRECT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [view, router]);

  /**
   * The auto-hide timer. Two cards are exempt, both for the same reason: they
   * hold the only way out of a state the visitor is stuck in.
   *
   * `?stay=1` is a deliberate request for this card — its checkbox is the only
   * switch that turns the redirect off, so timing it out would strand someone
   * on the page they came back to change. A stalled redirect is the same: its
   * "Try again" is the visitor's only route to the app they asked for.
   */
  useEffect(() => {
    if (view !== "card" || state.stay || stalled || engaged || hovering) return;
    const fade = window.setTimeout(() => setFadingOut(true), AUTO_HIDE_MS);
    const remove = window.setTimeout(() => setTimedOut(true), AUTO_HIDE_MS + FADE_OUT_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(remove);
      // Everything that stops the countdown — engaging, hovering, `?stay=1`
      // arriving on a back-navigation — stops it by cancelling these timers,
      // so a card caught between the fade and the removal never reaches
      // `timedOut` and never unmounts. Putting the card back is therefore part
      // of tearing the countdown down: without it the card would sit at
      // `opacity-0` for the rest of the visit, and the "always take me straight
      // here" checkbox it carries is the only switch that turns the redirect
      // off. On unmount this is a no-op, which is what we want there.
      setFadingOut(false);
    };
  }, [view, state.stay, stalled, engaged, hovering]);

  // The cover is a real modal, opened through `showModal()`, which is what
  // makes it mean what it looks like: the browser puts it in the top layer and
  // marks the rest of the document inert, so the landing page underneath can't
  // be tabbed into or read out by a screen reader while it's up. A plain
  // `fixed inset-0` div only hides it from people who can see it.
  useEffect(() => {
    const dialog = coverRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }, [view]);

  if (view === "redirect") {
    return (
      <dialog
        ref={coverRef}
        aria-label="Opening the app"
        // Esc is the manual version of the timeout below — someone who realises
        // the navigation is going nowhere shouldn't have to wait it out.
        onCancel={() => setStalled(true)}
        className="fixed inset-0 z-[60] m-0 hidden h-dvh max-h-none w-screen max-w-none items-center justify-center border-0 bg-background p-0 text-foreground backdrop:bg-background open:flex"
      >
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </dialog>
    );
  }

  if (view === "hidden" || timedOut) return null;

  return (
    <div
      className={cn(
        "fixed top-24 right-3 z-50 w-[min(20rem,calc(100vw-1.5rem))] sm:right-5",
        "motion-safe:transition-all motion-safe:duration-300",
        fadingOut && "pointer-events-none translate-y-1 opacity-0",
      )}
      // A card on its way out is `inert`, not merely `pointer-events-none`.
      // The class stops the pointer; only `inert` takes "Go to app" and the
      // checkbox out of the tab order and off the accessibility tree as well,
      // so nobody can tab onto a control that renders as nothing. It lifts
      // with `fadingOut` — see the countdown's cleanup above.
      inert={fadingOut}
      // Hover pauses; leaving starts the ten seconds over. Once the fade has
      // begun the card can't be caught halfway and left half-visible — it
      // finishes leaving.
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      // `onFocusCapture` rather than `onFocus`, to catch focus landing on the
      // button or the checkbox inside rather than on this wrapper.
      onFocusCapture={() => setEngaged(true)}
      // Not a modal — the landing page stays fully usable behind it.
      role="complementary"
      aria-label="Continue to the app"
    >
      <div className="relative flex flex-col gap-3 rounded-2xl border bg-background/95 p-4 shadow-lg shadow-black/5 backdrop-blur-md">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            setDismissedHere(true);
            dismissPrompt();
          }}
          aria-label="Dismiss"
          className="absolute top-1.5 right-1.5 size-7 text-muted-foreground"
        >
          <X className="size-4" />
        </Button>

        <div className="pr-6">
          <p className="text-sm font-medium">
            {stalled ? "Still here?" : "You’re signed in"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {stalled ? "Opening the app took too long." : "Pick up where you left off."}
          </p>
        </div>

        <Button asChild className="w-full gap-2">
          <a href="/app">
            {stalled ? "Try again" : "Go to app"}
            <ArrowRight className="size-4" />
          </a>
        </Button>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={state.prefers}
            onCheckedChange={(checked) => setPrefersApp(checked === true)}
          />
          Always take me straight here
        </label>

        {/* `?stay=1` is the only way back once this is on, so it has to be
            written down somewhere the visitor will actually see it — and this
            card is the one place they're guaranteed to be looking at it. */}
        {state.prefers && (
          <p className="text-xs text-muted-foreground">
            From your next visit this page opens the app. To see it again, untick
            above or open <span className="font-mono text-foreground">/?stay=1</span>.
          </p>
        )}
      </div>
    </div>
  );
}
