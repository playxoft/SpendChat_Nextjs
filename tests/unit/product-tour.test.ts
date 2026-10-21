import { describe, expect, it } from "vitest";
import {
  TOUR_GAP,
  TOUR_MARGIN,
  TOUR_STEPS,
  isOnScreen,
  placeCard,
  spotlightBox,
  tourStepsFor,
  type TourTarget,
} from "@/lib/product-tour";

/**
 * The tour's decisions, without a browser: which steps a person gets, and
 * where the card and the spotlight go for a given target and window.
 */

const ids = (steps: { id: string }[]) => steps.map((s) => s.id);
const everything = () => true;

describe("tourStepsFor", () => {
  it("gives everyone with every target and voice the whole tour, in order", () => {
    expect(ids(tourStepsFor({ voice: true, hasTarget: everything }))).toEqual(ids([...TOUR_STEPS]));
  });

  it("drops the voice step for a plan without voice entry", () => {
    expect(ids(tourStepsFor({ voice: false, hasTarget: everything }))).toEqual([
      "composer",
      "ai",
      "spaces",
      "ask",
    ]);
  });

  it("drops a step whose element isn't on the page (a viewer has no composer)", () => {
    const present = new Set<TourTarget>(["spaces", "nav-ask"]);
    expect(ids(tourStepsFor({ voice: true, hasTarget: (t) => present.has(t) }))).toEqual([
      "spaces",
      "ask",
    ]);
  });

  it("keeps the voice step on its fallback when the mic is in the hidden pane", () => {
    const present = new Set<TourTarget>(["composer", "entry-mode"]);
    expect(ids(tourStepsFor({ voice: true, hasTarget: (t) => present.has(t) }))).toEqual([
      "composer",
      "ai",
      "voice",
    ]);
  });

  it("is empty when nothing is there to point at", () => {
    expect(tourStepsFor({ voice: true, hasTarget: () => false })).toEqual([]);
  });
});

const viewport = { width: 1280, height: 800 };
const card = { width: 320, height: 180 };

describe("placeCard", () => {
  it("puts the card above a target at the bottom (the composer), centred on it", () => {
    const target = { top: 680, left: 400, width: 600, height: 100 };
    const place = placeCard({ target, card, viewport, sides: ["top", "bottom"] });
    expect(place.side).toBe("top");
    expect(place.top).toBe(680 - TOUR_GAP - card.height);
    expect(place.left).toBe(400 + 300 - 160);
  });

  it("passes over a side the card doesn't fit on", () => {
    // Too close to the top for the card to sit above it.
    const target = { top: 40, left: 400, width: 100, height: 40 };
    expect(placeCard({ target, card, viewport, sides: ["top", "bottom"] }).side).toBe("bottom");
  });

  it("falls back to any side that fits after the preferred ones", () => {
    // A tall target hugging the left edge: neither above nor below fits, right does.
    const target = { top: 20, left: 0, width: 240, height: 760 };
    const place = placeCard({ target, card, viewport, sides: ["top", "bottom"] });
    expect(place.side).toBe("right");
    expect(place.left).toBe(240 + TOUR_GAP);
  });

  it("lines up with a tall target's start when asked (the sidebar's list)", () => {
    const target = { top: 100, left: 0, width: 240, height: 600 };
    const start = placeCard({ target, card, viewport, sides: ["right"], align: "start" });
    expect(start.top).toBe(100);
    const centred = placeCard({ target, card, viewport, sides: ["right"] });
    expect(centred.top).toBe(100 + 300 - 90);
  });

  it("keeps the card inside the window along the side it's on", () => {
    // A bottom-bar slot at the right edge of a phone: above it, pulled left.
    const phone = { width: 375, height: 667 };
    const target = { top: 603, left: 300, width: 75, height: 64 };
    const place = placeCard({ target, card, viewport: phone, sides: ["right", "top"] });
    expect(place.side).toBe("top");
    expect(place.left).toBe(phone.width - TOUR_MARGIN - card.width);
    expect(place.top).toBe(603 - TOUR_GAP - card.height);
  });

  it("overlaps the target rather than leave the window when no side fits", () => {
    const tiny = { width: 360, height: 220 };
    const target = { top: 60, left: 20, width: 320, height: 100 };
    const place = placeCard({ target, card, viewport: tiny, sides: ["top"] });
    expect(place.side).not.toBeNull();
    expect(place.top).toBeGreaterThanOrEqual(TOUR_MARGIN);
    expect(place.left).toBeGreaterThanOrEqual(TOUR_MARGIN);
    expect(place.left + card.width).toBeLessThanOrEqual(tiny.width - TOUR_MARGIN);
  });

  it("pins a card wider than the window to the margin instead of a negative offset", () => {
    const narrow = { width: 300, height: 600 };
    const target = { top: 500, left: 0, width: 300, height: 80 };
    expect(placeCard({ target, card, viewport: narrow, sides: ["top"] }).left).toBe(TOUR_MARGIN);
  });

  it("centres the card when there is no target", () => {
    expect(placeCard({ target: null, card, viewport, sides: ["top"] })).toEqual({
      top: (800 - 180) / 2,
      left: (1280 - 320) / 2,
      side: null,
    });
  });
});

describe("spotlightBox", () => {
  it("pads the target", () => {
    expect(spotlightBox({ top: 100, left: 100, width: 50, height: 20 }, viewport, 6)).toEqual({
      top: 94,
      left: 94,
      width: 62,
      height: 32,
    });
  });

  it("stays inside the window, so a target flush with an edge keeps its ring", () => {
    const box = spotlightBox({ top: 0, left: 0, width: 240, height: 800 }, viewport, 6);
    expect(box.left).toBeGreaterThan(0);
    expect(box.top).toBeGreaterThan(0);
    expect(box.top + box.height).toBeLessThan(viewport.height);
    expect(box.left + box.width).toBe(246);
  });
});

describe("isOnScreen", () => {
  it("needs an area and some overlap with the window", () => {
    expect(isOnScreen({ top: 10, left: 10, width: 10, height: 10 }, viewport)).toBe(true);
    expect(isOnScreen({ top: 10, left: 10, width: 0, height: 10 }, viewport)).toBe(false);
    expect(isOnScreen({ top: -40, left: 10, width: 10, height: 30 }, viewport)).toBe(false);
    expect(isOnScreen({ top: 800, left: 10, width: 10, height: 10 }, viewport)).toBe(false);
    expect(isOnScreen({ top: 10, left: 1300, width: 10, height: 10 }, viewport)).toBe(false);
  });
});
