import { describe, it, expect } from "vitest";
import {
  BUDGET_SCOPES,
  budgetLabel,
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
  thresholdsMet,
  utcMonthKey,
  type BudgetTarget,
  type BudgetViewer,
  type SpendCell,
} from "@/lib/budgets";

const WS: BudgetTarget = { scope: "workspace", profileId: null, categoryId: null };
const P1: BudgetTarget = { scope: "profile", profileId: "p1", categoryId: null };
const P2: BudgetTarget = { scope: "profile", profileId: "p2", categoryId: null };
const FOOD: BudgetTarget = { scope: "category", profileId: null, categoryId: "food" };

const matrix: SpendCell[] = [
  { profileId: "p1", categoryId: "food", totalMinor: 1000 },
  { profileId: "p1", categoryId: null, totalMinor: 250 },
  { profileId: "p2", categoryId: "food", totalMinor: 500 },
  { profileId: "p2", categoryId: "rent", totalMinor: 4000 },
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
  totalProfiles: 2,
  ...v,
});

describe("canSeeBudget — only people who can read every profile it covers", () => {
  it("admins see everything", () => {
    const admin = viewer({ isAdmin: true });
    for (const t of [WS, P1, FOOD]) expect(canSeeBudget(t, admin)).toBe(true);
  });
  it("a reader of every profile sees the workspace and category budgets", () => {
    const all = viewer({ readable: new Set(["p1", "p2"]) });
    expect(canSeeBudget(WS, all)).toBe(true);
    expect(canSeeBudget(FOOD, all)).toBe(true);
    expect(canSeeBudget(P2, all)).toBe(true);
  });
  it("a reader of one profile sees only that profile's budget", () => {
    const one = viewer({ readable: new Set(["p1"]) });
    expect(canSeeBudget(P1, one)).toBe(true);
    expect(canSeeBudget(P2, one)).toBe(false);
    expect(canSeeBudget(WS, one)).toBe(false);
    expect(canSeeBudget(FOOD, one)).toBe(false);
  });
});

describe("canManageBudget — edit access to every profile it covers", () => {
  it("admins manage everything", () => {
    const admin = viewer({ isAdmin: true });
    for (const t of [WS, P1, FOOD]) expect(canManageBudget(t, admin)).toBe(true);
  });
  it("an editor of one profile manages that profile's budget only", () => {
    const ed = viewer({ readable: new Set(["p1", "p2"]), writable: new Set(["p1"]) });
    expect(canManageBudget(P1, ed)).toBe(true);
    expect(canManageBudget(P2, ed)).toBe(false);
    expect(canManageBudget(WS, ed)).toBe(false);
    expect(canManageBudget(FOOD, ed)).toBe(false);
    expect(manageableScopes(ed)).toEqual({ workspace: false, category: false, profileIds: ["p1"] });
  });
  it("an editor of every profile manages workspace and category budgets", () => {
    const ed = viewer({ readable: new Set(["p1", "p2"]), writable: new Set(["p1", "p2"]) });
    expect(canManageBudget(WS, ed)).toBe(true);
    expect(canManageBudget(FOOD, ed)).toBe(true);
    expect(canAddAnyBudget(manageableScopes(ed))).toBe(true);
  });
  it("a viewer manages nothing — not even in a workspace with no profiles", () => {
    const v = viewer({ readable: new Set(["p1", "p2"]) });
    for (const t of [WS, P1, FOOD]) expect(canManageBudget(t, v)).toBe(false);
    expect(canManageBudget(WS, viewer({ totalProfiles: 0 }))).toBe(false);
    expect(canAddAnyBudget(manageableScopes(v))).toBe(false);
  });
});

describe("months", () => {
  it("reads and checks month keys", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey(202610)).toBe(false);
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

describe("labels and order", () => {
  it("names a budget after what it covers", () => {
    expect(budgetLabel({ scope: "workspace" })).toBe("Whole workspace");
    expect(budgetLabel({ scope: "profile", profileName: "Home" })).toBe("Home");
    expect(budgetLabel({ scope: "category", categoryName: "Groceries" })).toBe("Groceries");
    expect(budgetLabel({ scope: "profile" })).toBe("Profile");
    expect(budgetLabel({ scope: "category", categoryName: null })).toBe("Category");
  });
  it("lists the workspace first, then profiles, then categories, each by name", () => {
    const list = [
      { scope: "category" as const, label: "Rent" },
      { scope: "profile" as const, label: "Work" },
      { scope: "category" as const, label: "Food" },
      { scope: "workspace" as const, label: "Whole workspace" },
      { scope: "profile" as const, label: "Home" },
    ];
    expect([...list].sort(compareBudgets).map((b) => b.label)).toEqual([
      "Whole workspace",
      "Home",
      "Work",
      "Food",
      "Rent",
    ]);
    expect(BUDGET_SCOPES).toEqual(["workspace", "profile", "category"]);
  });
});
