import { describe, it, expect } from "vitest";
import {
  BUDGET_SCOPES,
  BUDGET_TITLE_MAX,
  budgetLabel,
  budgetScopeText,
  budgetStatus,
  canAddAnyBudget,
  canManageBudget,
  canSeeBudget,
  compareBudgets,
  countAlerts,
  currentMonthKeys,
  isMonthKey,
  manageableScopes,
  monthBounds,
  monthKeyOf,
  monthName,
  percentUsed,
  spentFor,
  suggestedBudgetTitle,
  thresholdsMet,
  utcMonthKey,
  type BudgetTarget,
  type BudgetViewer,
  type SpendCell,
} from "@/lib/budgets";

const NONE = { profileId: null, categoryId: null, spaceId: null };
const WS: BudgetTarget = { scope: "workspace", ...NONE };
const P1: BudgetTarget = { scope: "profile", ...NONE, profileId: "p1" };
const P2: BudgetTarget = { scope: "profile", ...NONE, profileId: "p2" };
const FOOD: BudgetTarget = { scope: "category", ...NONE, categoryId: "food" };
// Space s1 holds p1 and p3; space s2 holds p2.
const S1: BudgetTarget = { scope: "space", ...NONE, spaceId: "s1" };
const S2: BudgetTarget = { scope: "space", ...NONE, spaceId: "s2" };

const matrix: SpendCell[] = [
  { profileId: "p1", spaceId: "s1", categoryId: "food", totalMinor: 1000 },
  { profileId: "p1", spaceId: "s1", categoryId: null, totalMinor: 250 },
  { profileId: "p2", spaceId: "s2", categoryId: "food", totalMinor: 500 },
  { profileId: "p2", spaceId: "s2", categoryId: "rent", totalMinor: 4000 },
];

describe("spentFor — one matrix, three scopes", () => {
  it("the whole workspace adds every cell", () => {
    expect(spentFor(WS, matrix)).toBe(5750);
  });
  it("a profile adds only its own cells, uncategorised ones included", () => {
    expect(spentFor(P1, matrix)).toBe(1250);
    expect(spentFor(P2, matrix)).toBe(4500);
  });
  it("a category adds its cells across every profile", () => {
    expect(spentFor(FOOD, matrix)).toBe(1500);
  });
  it("a space adds the cells of the profiles in it now — a moved profile moves its month", () => {
    expect(spentFor(S1, matrix)).toBe(1250);
    expect(spentFor(S2, matrix)).toBe(4500);
    const moved = matrix.map((c) => (c.profileId === "p2" ? { ...c, spaceId: "s1" } : c));
    expect(spentFor(S1, moved)).toBe(5750);
    expect(spentFor(S2, moved)).toBe(0);
  });
  it("nothing spent is zero", () => {
    expect(spentFor(WS, [])).toBe(0);
    expect(spentFor({ scope: "profile", profileId: "nobody", categoryId: null }, matrix)).toBe(0);
  });
});

describe("thresholds — integer maths, never rounded up", () => {
  it("79.99% is not a warning; exactly 80% is", () => {
    expect(thresholdsMet(7999, 10000)).toEqual([]);
    expect(budgetStatus(7999, 10000)).toBe("ok");
    expect(thresholdsMet(8000, 10000)).toEqual([80]);
    expect(budgetStatus(8000, 10000)).toBe("warn");
  });
  it("exactly 100% is over, and so is past it", () => {
    expect(thresholdsMet(10000, 10000)).toEqual([80, 100]);
    expect(budgetStatus(10000, 10000)).toBe("over");
    expect(budgetStatus(25000, 10000)).toBe("over");
  });
  it("odd amounts compare exactly (80% of 333 is 266.4)", () => {
    expect(thresholdsMet(266, 333)).toEqual([]);
    expect(thresholdsMet(267, 333)).toEqual([80]);
  });
  it("percent rounds down and can pass 100", () => {
    expect(percentUsed(8299, 10000)).toBe(82);
    expect(percentUsed(12000, 10000)).toBe(120);
    expect(percentUsed(-5, 10000)).toBe(0);
  });
  it("a non-positive amount never alerts", () => {
    expect(percentUsed(100, 0)).toBe(0);
    expect(thresholdsMet(100, 0)).toEqual([]);
  });
  it("countAlerts counts 80%+ as warn and 100%+ as over too", () => {
    expect(countAlerts(["ok", "warn", "over", "over"])).toEqual({ warn: 3, over: 2 });
    expect(countAlerts([])).toEqual({ warn: 0, over: 0 });
  });
});

const viewer = (v: Partial<BudgetViewer>): BudgetViewer => ({
  isAdmin: false,
  readable: new Set(),
  writable: new Set(),
  totalProfiles: 3,
  spaceProfiles: new Map([
    ["s1", ["p1", "p3"]],
    ["s2", ["p2"]],
    ["empty", []],
  ]),
  ...v,
});

const ALL = ["p1", "p2", "p3"];

describe("canSeeBudget — only people who can read every profile it covers", () => {
  it("admins see everything that's live", () => {
    const admin = viewer({ isAdmin: true, readable: new Set(ALL) });
    for (const t of [WS, S1, S2, P1, FOOD]) expect(canSeeBudget(t, admin)).toBe(true);
    // Even a space with no live profiles.
    expect(canSeeBudget({ ...S1, spaceId: "empty" }, admin)).toBe(true);
  });
  it("a profile budget whose profile can't be read — it's in the trash — is hidden, even from admins", () => {
    const admin = viewer({ isAdmin: true, readable: new Set(["p2"]), totalProfiles: 1 });
    expect(canSeeBudget(P1, admin)).toBe(false);
    expect(canSeeBudget(WS, admin)).toBe(true);
  });
  it("a reader of every profile sees the workspace, space and category budgets", () => {
    const all = viewer({ readable: new Set(ALL) });
    for (const t of [WS, S1, S2, FOOD, P2]) expect(canSeeBudget(t, all)).toBe(true);
  });
  it("a space budget shows to whoever reads every live profile in that space — and not to someone missing one", () => {
    const s2Only = viewer({ readable: new Set(["p2"]) });
    expect(canSeeBudget(S2, s2Only)).toBe(true);
    expect(canSeeBudget(S1, s2Only)).toBe(false);
    // Reads p1 but not p3 (an override hides it): no S1 budget.
    const missingOne = viewer({ readable: new Set(["p1", "p2"]) });
    expect(canSeeBudget(S1, missingOne)).toBe(false);
    expect(canSeeBudget(S2, missingOne)).toBe(true);
    // A space with no live profiles, or one that's gone: admins only.
    expect(canSeeBudget({ ...S1, spaceId: "empty" }, viewer({ readable: new Set(ALL) }))).toBe(false);
    expect(canSeeBudget({ ...S1, spaceId: "gone" }, viewer({ readable: new Set(ALL) }))).toBe(false);
  });
  it("a reader of one profile sees only that profile's budget", () => {
    const one = viewer({ readable: new Set(["p1"]) });
    expect(canSeeBudget(P1, one)).toBe(true);
    for (const t of [P2, WS, FOOD, S1]) expect(canSeeBudget(t, one)).toBe(false);
  });
});

describe("canManageBudget — edit access to every profile it covers", () => {
  it("admins manage everything, every space included", () => {
    const admin = viewer({ isAdmin: true });
    for (const t of [WS, S1, P1, FOOD]) expect(canManageBudget(t, admin)).toBe(true);
    expect(manageableScopes(admin).spaceIds).toEqual(["s1", "s2", "empty"]);
  });
  it("an editor of one profile manages that profile's budget only", () => {
    const ed = viewer({ readable: new Set(ALL), writable: new Set(["p1"]) });
    expect(canManageBudget(P1, ed)).toBe(true);
    for (const t of [P2, WS, FOOD, S1, S2]) expect(canManageBudget(t, ed)).toBe(false);
    expect(manageableScopes(ed)).toEqual({ workspace: false, category: false, profileIds: ["p1"], spaceIds: [] });
  });
  it("an editor of every profile in a space manages that space's budget", () => {
    const ed = viewer({ readable: new Set(ALL), writable: new Set(["p1", "p3"]) });
    expect(canManageBudget(S1, ed)).toBe(true);
    expect(canManageBudget(S2, ed)).toBe(false);
    expect(manageableScopes(ed).spaceIds).toEqual(["s1"]);
    expect(canAddAnyBudget({ workspace: false, category: false, profileIds: [], spaceIds: ["s1"] })).toBe(true);
  });
  it("an editor of every profile manages workspace and category budgets", () => {
    const ed = viewer({ readable: new Set(ALL), writable: new Set(ALL) });
    for (const t of [WS, FOOD, S1, S2]) expect(canManageBudget(t, ed)).toBe(true);
    expect(canAddAnyBudget(manageableScopes(ed))).toBe(true);
  });
  it("a viewer manages nothing — not even in a workspace with no profiles", () => {
    const v = viewer({ readable: new Set(ALL) });
    for (const t of [WS, P1, FOOD, S1]) expect(canManageBudget(t, v)).toBe(false);
    expect(canManageBudget(WS, viewer({ totalProfiles: 0 }))).toBe(false);
    expect(canAddAnyBudget(manageableScopes(v))).toBe(false);
  });
});

describe("months", () => {
  it("reads and checks month keys", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey(202610)).toBe(false);
    // Years SQL can read as a four-digit date, 1970–2999.
    for (const ok of ["1970-01", "2999-12"]) expect(isMonthKey(ok), ok).toBe(true);
    for (const bad of ["0000-01", "0099-12", "1969-12", "3000-01", "12026-01"]) {
      expect(isMonthKey(bad), bad).toBe(false);
    }
    expect(monthKeyOf("2026-10-17")).toBe("2026-10");
    expect(monthBounds("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(monthBounds("2028-02")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
    expect(monthName("2026-10")).toBe("October 2026");
    expect(utcMonthKey(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10");
  });

  it("mid-month, only one month is current anywhere", () => {
    expect(currentMonthKeys(new Date("2026-10-15T12:00:00Z"))).toEqual(["2026-10"]);
  });

  it("late on the last day, the next month has begun in the east (UTC+14)", () => {
    expect(currentMonthKeys(new Date("2026-10-31T13:00:00Z"))).toEqual(["2026-10", "2026-11"]);
  });

  it("early on the 1st, the old month is still current in the west (UTC−12)", () => {
    expect(currentMonthKeys(new Date("2026-11-01T10:00:00Z"))).toEqual(["2026-10", "2026-11"]);
    expect(currentMonthKeys(new Date("2026-11-01T12:30:00Z"))).toEqual(["2026-11"]);
  });

  it("the year turns over too", () => {
    expect(currentMonthKeys(new Date("2026-12-31T20:00:00Z"))).toEqual(["2026-12", "2027-01"]);
  });
});

describe("labels, titles and order", () => {
  it("names a budget after what it covers", () => {
    expect(budgetLabel({ scope: "workspace" })).toBe("Whole workspace");
    expect(budgetLabel({ scope: "profile", profileName: "Home" })).toBe("Home");
    expect(budgetLabel({ scope: "category", categoryName: "Groceries" })).toBe("Groceries");
    expect(budgetLabel({ scope: "space", spaceName: "Family" })).toBe("Family");
    expect(budgetLabel({ scope: "profile" })).toBe("Profile");
    expect(budgetLabel({ scope: "category", categoryName: null })).toBe("Category");
    expect(budgetLabel({ scope: "space" })).toBe("Space");
  });
  it("says what it covers in a few words, under a title", () => {
    expect(budgetScopeText({ scope: "workspace" })).toBe("Whole workspace");
    expect(budgetScopeText({ scope: "space", spaceName: "Home" })).toBe("Space · Home");
    expect(budgetScopeText({ scope: "category", categoryName: "Groceries" })).toBe("Category · Groceries");
    expect(budgetScopeText({ scope: "profile", profileName: "Kids" })).toBe("Profile · Kids");
  });
  it("suggests a title from what it covers", () => {
    expect(suggestedBudgetTitle({ scope: "workspace" })).toBe("All spending this month");
    expect(suggestedBudgetTitle({ scope: "category", categoryName: "Groceries" })).toBe("Groceries this month");
    expect(suggestedBudgetTitle({ scope: "space", spaceName: "Home" })).toBe("Home space");
    expect(suggestedBudgetTitle({ scope: "profile", profileName: "Kids" })).toBe("Kids this month");
    expect(suggestedBudgetTitle({ scope: "space", spaceName: "x".repeat(80) })).toHaveLength(BUDGET_TITLE_MAX);
  });
  it("lists the widest scope first — workspace, spaces, profiles, categories — each by title", () => {
    const list = [
      { scope: "category" as const, title: "Rent" },
      { scope: "profile" as const, title: "Work" },
      { scope: "space" as const, title: "Home space" },
      { scope: "category" as const, title: "Food" },
      { scope: "workspace" as const, title: "All spending" },
      { scope: "profile" as const, title: "Home" },
    ];
    expect([...list].sort(compareBudgets).map((b) => b.title)).toEqual([
      "All spending",
      "Home space",
      "Home",
      "Work",
      "Food",
      "Rent",
    ]);
    // The enum's own order: Postgres appended `space`.
    expect(BUDGET_SCOPES).toEqual(["workspace", "profile", "category", "space"]);
  });
});
