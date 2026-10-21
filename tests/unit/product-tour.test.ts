import { describe, expect, it } from "vitest";
import {
  TOUR_GAP,
  TOUR_MARGIN,
  TOUR_STEPS,
  isOnScreen,
  navTourTarget,
  pagesNote,
  placeCard,
  spotlightBox,
  tourModeFor,
  tourStepsFor,
  type TourStep,
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

  it("walks Manual, AI, voice, spaces, SpendChat AI, the other pages, then help", () => {
    expect(ids([...TOUR_STEPS])).toEqual(["manual", "ai", "voice", "spaces", "ask", "pages", "help"]);
  });

  it("drops the voice step for a plan without voice entry", () => {
    expect(ids(tourStepsFor({ voice: false, hasTarget: everything }))).toEqual([
      "manual",
      "ai",
      "spaces",
      "ask",
      "pages",
      "help",
    ]);
  });

  it("drops a step whose element isn't on the page (a viewer has no composer)", () => {
    const present = new Set<TourTarget>(["spaces", "nav", "nav-ask", "account-menu"]);
    expect(ids(tourStepsFor({ voice: true, hasTarget: (t) => present.has(t) }))).toEqual([
      "spaces",
      "ask",
      "pages",
      "help",
    ]);
  });

  it("drops the voice step when there's no mic (AI mode holding a review list)", () => {
    const hasTarget = (t: TourTarget) => t !== "voice";
    expect(ids(tourStepsFor({ voice: true, hasTarget }))).not.toContain("voice");
  });

  it("drops SpendChat AI's stop when its row is folded under More, and keeps the pages", () => {
    const hasTarget = (t: TourTarget) => t !== "nav-ask";
    const steps = ids(tourStepsFor({ voice: true, hasTarget }));
    expect(steps).not.toContain("ask");
    expect(steps).toContain("pages");
  });

  it("keeps every step on a phone, whose bottom bar and top bar carry the anchors", () => {
    // No sidebar rows past the bar's: Transactions and SpendChat AI have slots,
    // the rest are under the bar's More.
    const phone = new Set<TourTarget>([
      "composer",
      "entry-mode",
      "voice",
      "spaces",
      "nav",
      "nav-ask",
      "nav-transactions",
      "account-menu",
    ]);
    expect(tourStepsFor({ voice: true, hasTarget: (t) => phone.has(t) })).toHaveLength(TOUR_STEPS.length);
  });

  it("is empty when nothing is there to point at", () => {
    expect(tourStepsFor({ voice: true, hasTarget: () => false })).toEqual([]);
  });
});

const step = (id: string) => TOUR_STEPS.find((s) => s.id === id)!;

describe("the composer steps", () => {
  it("show Manual, then AI, each spotlighting the whole composer", () => {
    expect(step("manual")).toMatchObject({ mode: "manual", targets: ["composer"] });
    expect(step("ai")).toMatchObject({ mode: "ai", targets: ["composer"] });
  });

  it("point voice at the mic, in AI mode where the mic is", () => {
    expect(step("voice")).toMatchObject({ mode: "ai", targets: ["voice"] });
  });

  it("leave the mode alone everywhere else", () => {
    const others = TOUR_STEPS.filter((s) => !["manual", "ai", "voice"].includes(s.id));
    expect(others.every((s) => s.mode === undefined)).toBe(true);
  });
});

describe("tourModeFor", () => {
  const all = tourStepsFor({ voice: true, hasTarget: everything });

  it("shows each composer step's own mode, and keeps the last one after them", () => {
    expect(all.map((_, i) => tourModeFor(all, i))).toEqual([
      "manual",
      "ai",
      "ai",
      "ai",
      "ai",
      "ai",
      "ai",
    ]);
  });

  it("goes back to Manual on the way back to its step", () => {
    expect(tourModeFor(all, 3)).toBe("ai");
    expect(tourModeFor(all, 0)).toBe("manual");
  });

  it("is null for a tour without the composer — the person's own mode stays", () => {
    const viewer = tourStepsFor({ voice: true, hasTarget: (t) => t !== "composer" && t !== "voice" });
    expect(viewer.map((_, i) => tourModeFor(viewer, i)).every((m) => m === null)).toBe(true);
  });

  it("reads past the end as the last step", () => {
    expect(tourModeFor(all, 99)).toBe("ai");
    expect(tourModeFor([], 0)).toBeNull();
  });
});

describe("the pages step", () => {
  const pages = step("pages");

  it("introduces Transactions, Analytics, Budgets and Files over the nav", () => {
    expect(pages.targets).toEqual(["nav"]);
    expect(pages.pages?.map((p) => p.label)).toEqual(["Transactions", "Analytics", "Budgets", "Files"]);
  });

  it("names each page by the anchor its nav row carries", () => {
    for (const page of pages.pages ?? []) {
      expect(navTourTarget(page.label.toLowerCase())).toBe(page.target);
    }
    expect(navTourTarget("ask")).toBe("nav-ask");
    expect(navTourTarget("tracker")).toBeUndefined();
    expect(navTourTarget("invoices")).toBeUndefined();
  });

  it("says nothing when every page has its own row", () => {
    expect(pagesNote(pages, everything)).toBeNull();
  });

  it("says which pages are under More", () => {
    const without = (...gone: TourTarget[]) => (t: TourTarget) => !gone.includes(t);
    expect(pagesNote(pages, without("nav-files"))).toBe("Files is under More.");
    expect(pagesNote(pages, without("nav-budgets", "nav-files"))).toBe("Budgets and Files are under More.");
    // A phone: only Transactions has a slot on the bottom bar.
    expect(pagesNote(pages, (t) => t === "nav-transactions")).toBe(
      "Analytics, Budgets and Files are under More.",
    );
  });

  it("has no note for a step without pages", () => {
    const plain: TourStep = step("ask");
    expect(pagesNote(plain, () => false)).toBeNull();
  });
});

describe("the help step", () => {
  it("ends the tour on the account menu", () => {
    expect(TOUR_STEPS.at(-1)).toMatchObject({ id: "help", targets: ["account-menu"] });
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
