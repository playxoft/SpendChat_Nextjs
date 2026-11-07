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
export type TourTarget =
  | "composer"
  | "entry-mode"
  | "entry-mode-ai"
  | "voice"
  | "spaces"
  | "nav"
  | "nav-ask"
  | "nav-transactions"
  | "nav-analytics"
  | "nav-budgets"
  | "nav-files"
  | "nav-invoices"
  | "nav-split"
  | "account-menu"
  /** The account menu's "Take the tour" row, there only while the menu is open (see `TourStep.opens`). */
  | "take-the-tour";

/** The composer's two modes (`EntryMode` in `entry-mode-toggle.tsx`). */
export type TourMode = "manual" | "ai";

export type TourSide = "top" | "bottom" | "left" | "right";

export type TourBox = { top: number; left: number; width: number; height: number };
export type TourSize = { width: number; height: number };

/** One line of a step that introduces several pages at once. */
export type TourPage = {
  /** The page's own row in the nav, when it has one there (see `pagesNote`). */
  target: TourTarget;
  label: string;
  text: string;
};

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /**
   * Anchors, best first; the first one that's on screen wins. One anchor can sit
   * on several elements — SpendChat AI is both a sidebar row and a bottom-bar
   * slot, the nav is the sidebar's list or the bottom bar — and the visible one
   * is used. That's what lets one step list work on a desktop and a phone.
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
  /**
   * The composer is switched to this mode for the step — for real, through its
   * own store, so the switch shows it checked — and stays in it until a later
   * step names another (see `tourModeFor`). Shown, never saved: the tour's end
   * puts back whatever the person had.
   */
  mode?: TourMode;
  /** Pages introduced together, one line each, under the body. */
  pages?: readonly TourPage[];
  /**
   * The reader moves on by doing it: the step has no Next, and pressing the
   * spotlit element is what continues the tour. `label` is that press's
   * accessible name; `prompt` is what the card says in place of Next.
   */
  action?: { label: string; prompt: string };
  /**
   * The step opens the menu behind this button and points at something inside
   * it. The menu is shut when the tour starts, so the step counts as there when
   * the button is (`tourStepsFor`). It closes again when the step is left.
   */
  opens?: "account-menu";
};

/*
 * The words are written for someone of ten: short sentences, everyday words,
 * one idea at a time. A new step's text should read the same way.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "manual",
    title: "Add money you spent or earned",
    // Layout-neutral: a replay can come from any input layout (amount first,
    // title first, or one field).
    body: "Type how much it was and what it was for. Then press send. It shows up in the list above. The small buttons let you pick spent or earned, the date, a category and tags.",
    targets: ["composer"],
    sides: ["top", "bottom"],
    hint: { text: "Send with", combo: "enter" },
    mode: "manual",
  },
  {
    // The reader flips the switch themselves, so they know where it is the
    // next time. The composer stays in Manual (step one's mode) until they do.
    id: "switch",
    title: "Try AI mode",
    // Compact composers show AI as a sparkle with no word, so the body names both.
    body: "Press AI (the sparkle) to switch to it. You can switch back anytime.",
    targets: ["entry-mode-ai", "entry-mode"],
    sides: ["top", "bottom"],
    action: { label: "Switch to AI mode", prompt: "Press AI to continue" },
  },
  {
    id: "ai",
    title: "Just type it like you talk",
    body: "Write it the way you would say it, like “200 fruits, 1000 electricity”. AI makes a list from it. You check the list and fix it before anything is saved.",
    targets: ["composer"],
    sides: ["top", "bottom"],
    hint: { text: "Switch modes with", combo: comboFor("tracker.toggle-mode") },
    mode: "ai",
  },
  {
    id: "voice",
    title: "Or just say it",
    body: "Press and hold the mic, then talk. Your words show up in the box. Check them before you save.",
    targets: ["voice"],
    sides: ["top", "bottom", "left"],
    hint: { text: "Hold", combo: comboFor("tracker.voice") },
    requires: "voice",
    // The mic is AI mode's; named here too so Back from a later step shows it.
    mode: "ai",
  },
  {
    id: "spaces",
    title: "Spaces and profiles",
    body: "Keep different money apart, like your own, your family's or your shop's. Pick one profile to add to it. Pick a few to see them together.",
    targets: ["spaces"],
    sides: ["right", "bottom"],
    align: "start",
  },
  {
    id: "ask",
    title: "Ask SpendChat AI",
    body: "Ask a question about your money, like “How much did I spend on food this month?” It answers using your own numbers.",
    targets: ["nav-ask"],
    sides: ["right", "top"],
    hint: { text: "Open it with", combo: comboFor("nav.ask") },
  },
  {
    // One card for every other page rather than a card each: each page is a
    // sentence, and a stop per page would double the tour for things the
    // reader can't try from here anyway. The spotlight is the whole list, so it
    // shows where they all are; a page folded under More is said to be there.
    id: "pages",
    title: "More pages",
    body: "Each of these has its own page:",
    targets: ["nav"],
    sides: ["right", "top"],
    pages: [
      {
        target: "nav-transactions",
        label: "Transactions",
        text: "all your entries in one list. Search them, filter them or download them.",
      },
      { target: "nav-analytics", label: "Analytics", text: "charts that show where your money goes." },
      {
        target: "nav-budgets",
        label: "Budgets",
        text: "set a spending limit for each month. We warn you when you get close.",
      },
      { target: "nav-files", label: "Files", text: "keep receipts, bills and other papers in folders." },
      {
        target: "nav-invoices",
        label: "Invoices",
        text: "make bills and price quotes to send. Mark one as paid and it's added as money earned.",
      },
      { target: "nav-split", label: "Split bills", text: "share costs with friends and see who owes who." },
    ],
  },
  {
    // Settings has no row in the nav — it's in this menu (`nav-items.ts`) — so
    // it's introduced here, on the menu's button: where the menu is.
    id: "help",
    title: "Your menu",
    body: "Press this button to open your menu. In it you can switch workspaces, see your plan, and find Settings and Trash.",
    targets: ["account-menu"],
    sides: ["bottom", "left"],
    hint: { text: "See all shortcuts with", combo: comboFor("global.shortcuts") },
  },
  {
    // Last, so it's the thing remembered: the tour can be had again, and from
    // where. The menu is opened and its own row spotlit, so it's seen exactly
    // where it will be — not the button, which the step before already showed.
    id: "replay",
    title: "Watch this tour again",
    body: "It's right here in your menu. Press “Take the tour” anytime to see it again.",
    targets: ["take-the-tour"],
    sides: ["left", "bottom"],
    opens: "account-menu",
  },
];

/** The nav rows the tour points at, by section id (`nav-items.ts`); other rows carry no anchor. */
const NAV_TARGETS: Partial<Record<string, TourTarget>> = {
  ask: "nav-ask",
  transactions: "nav-transactions",
  analytics: "nav-analytics",
  budgets: "nav-budgets",
  files: "nav-files",
  invoices: "nav-invoices",
  split: "nav-split",
};

/** The `data-tour` value for a nav section's row — the sidebar's and the bottom bar's alike. */
export function navTourTarget(sectionId: string): TourTarget | undefined {
  return NAV_TARGETS[sectionId];
}

/**
 * The steps this person gets, now: the ones whose feature they have and whose
 * element is on the page. A viewer has no composer, a Free plan no mic, and a
 * sidebar section folded under More has no row — a step pointing at nothing
 * would be a card about something the reader can't see, so it's dropped and
 * "Step n of N" counts only what's left.
 *
 * `hasTarget` judges an element in the composer's hidden pane as there: the
 * step that needs it switches the composer to that pane first. A step inside a
 * menu is there when the menu's button is: the step opens it (`TourStep.opens`).
 */
export function tourStepsFor({
  voice,
  hasTarget,
}: {
  voice: boolean;
  hasTarget: (target: TourTarget) => boolean;
}): TourStep[] {
  return TOUR_STEPS.filter(
    (step) =>
      (step.requires !== "voice" || voice) &&
      (step.opens ? hasTarget(step.opens) : step.targets.some(hasTarget)),
  );
}

/**
 * The composer mode to show at step `index`: the nearest step at or before it
 * that names one. A function of the step alone, so Back lands on the same
 * picture Next did. Null before any such step (and for a tour without the
 * composer), which means "whatever the person has".
 */
export function tourModeFor(steps: readonly TourStep[], index: number): TourMode | null {
  for (let i = Math.min(index, steps.length - 1); i >= 0; i--) {
    const mode = steps[i].mode;
    if (mode) return mode;
  }
  return null;
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Where to find a step's pages that have no row of their own on screen. The
 * nav is arranged by the person on a desktop (`lib/sidebar-nav.ts`) and fixed
 * on a phone (most pages under the bottom bar's More), so a page without a row
 * is under More — the spotlit list includes it. Null when every page has a
 * row, or the step introduces none.
 */
export function pagesNote(step: TourStep, hasTarget: (target: TourTarget) => boolean): string | null {
  const tucked = (step.pages ?? []).filter((page) => !hasTarget(page.target)).map((page) => page.label);
  if (tucked.length === 0) return null;
  return `${joinNames(tucked)} ${tucked.length === 1 ? "is" : "are"} under More.`;
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
