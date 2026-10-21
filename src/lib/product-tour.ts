import { comboFor } from "@/lib/shortcuts";

/**
 * The tracker's product tour: what each step says, which element it points at,
 * and where its card goes. Pure on purpose — the component
 * (`components/app/product-tour.tsx`) finds and measures the elements, and
 * every decision made from those numbers lives here, where it's unit-tested
 * without a browser.
 *
 * Steps point at `data-tour="…"` attributes rather than component internals or
 * class names, so restyling the composer or the sidebar can't silently orphan a
 * step: the anchor travels with the element.
 */

/** A `data-tour` anchor on the tracker. Several elements may carry one (see `TourStep.targets`). */
export type TourTarget = "composer" | "entry-mode" | "voice" | "spaces" | "nav-ask";

export type TourSide = "top" | "bottom" | "left" | "right";

export type TourBox = { top: number; left: number; width: number; height: number };
export type TourSize = { width: number; height: number };

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /**
   * Anchors, best first; the first one that's on screen wins. One anchor can sit
   * on several elements — the Manual and AI panes each render the mode toggle
   * (one hidden, on the same pixel), and SpendChat AI is both a sidebar row and
   * a bottom-bar slot — and the visible one is used. That's what lets one step
   * list work on a desktop and a phone.
   */
  targets: readonly TourTarget[];
  /** Sides for the card, best first. A side the card doesn't fit on is passed over. */
  sides: readonly TourSide[];
  /** Line the card up with the target's start instead of its middle — for a tall target (the sidebar's list). */
  align?: "center" | "start";
  /** A shortcut worth knowing at this step, shown only where there's a keyboard. */
  hint?: { text: string; combo: string };
  /** Shown only when the feature is on for this person (voice entry is a plan feature). */
  requires?: "voice";
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "composer",
    title: "Add a transaction",
    // Layout-neutral: a replay can come from any input layout (amount first,
    // title first, or one field).
    body: "Type how much and what it was for, then send it. It lands in the feed above.",
    targets: ["composer"],
    sides: ["top", "bottom"],
    hint: { text: "Send with", combo: "enter" },
  },
  {
    id: "ai",
    title: "Or just describe it",
    body: "Switch to AI and write it the way you'd say it — “200 fruits, 1000 electricity”. AI turns it into rows you check before anything is saved.",
    targets: ["entry-mode"],
    sides: ["top", "bottom", "right"],
    hint: { text: "Switch with", combo: comboFor("tracker.toggle-mode") },
  },
  {
    // Points at the mic when AI mode is showing; from Manual, the mic is in the
    // hidden pane, so the toggle that gets you there stands in for it.
    id: "voice",
    title: "Say it instead",
    body: "In AI mode, press and hold the mic and speak. You see the words before they become rows.",
    targets: ["voice", "entry-mode"],
    sides: ["top", "bottom", "left"],
    hint: { text: "Hold", combo: comboFor("tracker.voice") },
    requires: "voice",
  },
  {
    id: "spaces",
    title: "Spaces and profiles",
    body: "Keep money apart — personal, home, a side business. Pick a profile to track it, or choose several to see them together.",
    targets: ["spaces"],
    sides: ["right", "bottom"],
    align: "start",
  },
  {
    id: "ask",
    title: "Ask SpendChat AI",
    body: "Ask about your money in plain words — “What did I spend on food this month?” — and get an answer from your own numbers.",
    targets: ["nav-ask"],
    sides: ["right", "top"],
    hint: { text: "Open it with", combo: comboFor("nav.ask") },
  },
];

/**
 * The steps this person gets, now: the ones whose feature they have and whose
 * element is on the page. A viewer has no composer, a Free plan no mic, and a
 * sidebar section folded under More has no row — a step pointing at nothing
 * would be a card about something the reader can't see, so it's dropped and
 * "Step n of N" counts only what's left.
 */
export function tourStepsFor({
  voice,
  hasTarget,
}: {
  voice: boolean;
  hasTarget: (target: TourTarget) => boolean;
}): TourStep[] {
  return TOUR_STEPS.filter(
    (step) => (step.requires !== "voice" || voice) && step.targets.some(hasTarget),
  );
}

/** Space between the target and the card. */
export const TOUR_GAP = 12;
/** The card never comes closer to the window's edge than this. */
export const TOUR_MARGIN = 12;
/** How far the spotlight's hole reaches past the target, so its ring doesn't sit on the target's own border. */
export const SPOTLIGHT_PAD = 6;
/** The hole stays this far inside the window, or a target flush with an edge (the sidebar) loses that side of its ring. */
const SPOTLIGHT_EDGE = 2;

/** Some of the box is inside the viewport, and it has an area at all. */
export function isOnScreen(box: TourBox, viewport: TourSize): boolean {
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.top < viewport.height &&
    box.left < viewport.width &&
    box.top + box.height > 0 &&
    box.left + box.width > 0
  );
}

/** The spotlight's hole: the target, padded, then cut to the viewport. */
export function spotlightBox(target: TourBox, viewport: TourSize, pad = SPOTLIGHT_PAD): TourBox {
  const left = Math.max(target.left - pad, SPOTLIGHT_EDGE);
  const top = Math.max(target.top - pad, SPOTLIGHT_EDGE);
  const right = Math.min(target.left + target.width + pad, viewport.width - SPOTLIGHT_EDGE);
  const bottom = Math.min(target.top + target.height + pad, viewport.height - SPOTLIGHT_EDGE);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

const ALL_SIDES: readonly TourSide[] = ["top", "bottom", "right", "left"];

/** Room between the target and the window's edge on one side. */
function roomOn(side: TourSide, t: TourBox, v: TourSize): number {
  switch (side) {
    case "top":
      return t.top;
    case "bottom":
      return v.height - (t.top + t.height);
    case "left":
      return t.left;
    case "right":
      return v.width - (t.left + t.width);
  }
}

/** Room the card takes on that side: itself, the gap before it, the margin after. */
function roomNeeded(side: TourSide, card: TourSize, gap: number, margin: number): number {
  return (side === "top" || side === "bottom" ? card.height : card.width) + gap + margin;
}

/** Keep `value` within [lo, hi]; when the range is empty (a card wider than the window), `lo` wins. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(value, hi));
}

/**
 * Where the card goes: beside the target on the first of `sides` it fits on
 * (then any other side that fits), centred on the target along that side — or
 * lined up with its start — and always pulled back inside the window.
 *
 * When no side fits (a small phone held sideways), the side with the most room
 * is used and the clamp lets the card overlap the target rather than leave the
 * screen: a card you can read beats one beside the right thing.
 *
 * No target (it scrolled away, or a resize hid it) centres the card, which is
 * then a plain dialog over a fully dimmed page. `side` is null there.
 */
export function placeCard({
  target,
  card,
  viewport,
  sides,
  align = "center",
  gap = TOUR_GAP,
  margin = TOUR_MARGIN,
}: {
  target: TourBox | null;
  card: TourSize;
  viewport: TourSize;
  sides: readonly TourSide[];
  align?: "center" | "start";
  gap?: number;
  margin?: number;
}): { top: number; left: number; side: TourSide | null } {
  const maxLeft = viewport.width - margin - card.width;
  const maxTop = viewport.height - margin - card.height;
  if (!target) {
    return {
      top: clamp((viewport.height - card.height) / 2, margin, maxTop),
      left: clamp((viewport.width - card.width) / 2, margin, maxLeft),
      side: null,
    };
  }

  const order = [...sides, ...ALL_SIDES.filter((s) => !sides.includes(s))];
  const spare = (s: TourSide) => roomOn(s, target, viewport) - roomNeeded(s, card, gap, margin);
  const side =
    order.find((s) => spare(s) >= 0) ??
    order.reduce((best, s) => (spare(s) > spare(best) ? s : best));

  // Along the side: centred on the target, or from its start.
  const across = (start: number, length: number, size: number) =>
    align === "start" ? start : start + length / 2 - size / 2;

  let top: number;
  let left: number;
  if (side === "top" || side === "bottom") {
    top = side === "top" ? target.top - gap - card.height : target.top + target.height + gap;
    left = across(target.left, target.width, card.width);
  } else {
    left = side === "left" ? target.left - gap - card.width : target.left + target.width + gap;
    top = across(target.top, target.height, card.height);
  }
  return { top: clamp(top, margin, maxTop), left: clamp(left, margin, maxLeft), side };
}
