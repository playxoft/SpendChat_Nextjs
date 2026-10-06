import { describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "@/lib/plans";
import {
  budgetsAllowance,
  budgetsCap,
  budgetsLimitLabel,
  formatPlanStorage,
  formatResetDate,
  isPlanLimit,
  meterState,
  nextMonthStartUtc,
  nextPlanFor,
  nextPlanForBudgets,
  parsePlanLimitDetails,
  planLimitOf,
  type NumericPlanLimit,
} from "@/lib/plan-limit";

/**
 * The client half of `plan_limit`: recognising one on an action result, and
 * the formatters and meters the limit UI shares. (The upgrade dialog's words
 * are `limitPitch`, tested in `plan-copy.test.ts`.)
 */

describe("parsePlanLimitDetails", () => {
  it("accepts the server's details", () => {
    expect(
      parsePlanLimitDetails({ limit: "members", plan: "free", max: 3, used: 3, upgradeTo: "plus" }),
    ).toEqual({ limit: "members", plan: "free", max: 3, used: 3, upgradeTo: "plus" });
  });
  it("keeps upgradeTo null (contact us) and drops non-numeric counts", () => {
    expect(
      parsePlanLimitDetails({ limit: "tags", plan: "pro", max: "20", used: NaN, upgradeTo: null }),
    ).toEqual({ limit: "tags", plan: "pro", upgradeTo: null });
  });
  it("rejects anything that isn't plan-limit details", () => {
    expect(parsePlanLimitDetails(undefined)).toBeNull();
    expect(parsePlanLimitDetails("plan_limit")).toBeNull();
    expect(parsePlanLimitDetails({ limit: "nope", plan: "free", upgradeTo: "plus" })).toBeNull();
    expect(parsePlanLimitDetails({ limit: "members", plan: "family", upgradeTo: "plus" })).toBeNull();
  });
});

describe("budgets — the object-shaped limit", () => {
  it("accepts a budgets refusal from the server", () => {
    expect(
      parsePlanLimitDetails({ limit: "budgets", plan: "pro", max: 200, used: 200, upgradeTo: null }),
    ).toEqual({ limit: "budgets", plan: "pro", max: 200, used: 200, upgradeTo: null });
  });
  it("reads caps and labels from PLAN_LIMITS — Pro shows Unlimited", () => {
    expect(budgetsCap("free")).toBe(PLAN_LIMITS.free.budgets.max);
    expect(budgetsLimitLabel("plus")).toBe("20");
    expect(budgetsLimitLabel("pro")).toBe("Unlimited");
    expect(budgetsAllowance("free")).toBe("5 budgets");
    expect(budgetsAllowance("pro")).toBe("unlimited budgets");
  });
  it("names the next plan up, and none above Pro", () => {
    expect(nextPlanForBudgets("free")).toBe("plus");
    expect(nextPlanForBudgets("plus")).toBe("pro");
    expect(nextPlanForBudgets("pro")).toBeNull();
  });
});

describe("planLimitOf / isPlanLimit", () => {
  const details = { limit: "storage", plan: "free", max: 1, used: 1, upgradeTo: "plus" };
  it("reads plan_limit and storage_quota_exceeded failures", () => {
    expect(isPlanLimit({ ok: false, code: "plan_limit", details })).toBe(true);
    expect(planLimitOf({ ok: false, code: "storage_quota_exceeded", details })?.limit).toBe(
      "storage",
    );
  });
  it("ignores successes, other codes and missing details", () => {
    expect(isPlanLimit({ ok: true, code: "plan_limit", details })).toBe(false);
    expect(isPlanLimit({ ok: false, code: "forbidden", details })).toBe(false);
    expect(isPlanLimit({ ok: false, code: "plan_limit" })).toBe(false);
    expect(isPlanLimit({ ok: false })).toBe(false);
  });
});

describe("nextPlanFor", () => {
  const keys: NumericPlanLimit[] = [
    "members",
    "spaces",
    "profilesPerSpace",
    "categories",
    "tags",
    "aiActionsPerMonth",
    "storageBytes",
  ];
  it("is the cheapest higher plan with more, or null at the top", () => {
    for (const key of keys) {
      expect(nextPlanFor("free", key)).toBe("plus");
      expect(nextPlanFor("plus", key)).toBe("pro");
      expect(nextPlanFor("pro", key)).toBeNull();
    }
  });
});

describe("meterState", () => {
  it("tones ok → warn at 85% → full at the limit", () => {
    expect(meterState(1, 10)).toEqual({ percent: 10, tone: "ok", full: false, over: false });
    expect(meterState(9, 10)).toMatchObject({ tone: "warn", full: false });
    expect(meterState(10, 10)).toMatchObject({ percent: 100, tone: "full", full: true, over: false });
  });
  it("marks over-limit without a bar past 100%", () => {
    expect(meterState(12, 10)).toEqual({ percent: 100, tone: "full", full: true, over: true });
  });
  it("survives a zero limit and negative usage", () => {
    expect(meterState(0, 0)).toMatchObject({ full: true, over: false });
    expect(meterState(-3, 10)).toMatchObject({ percent: 0, tone: "ok" });
  });
});

describe("formatting", () => {
  it("prints whole gigabytes without a decimal", () => {
    expect(formatPlanStorage(PLAN_LIMITS.free.storageBytes)).toBe("1 GB");
    expect(formatPlanStorage(PLAN_LIMITS.pro.storageBytes)).toBe("20 GB");
    expect(formatPlanStorage(1536 * 1024 * 1024)).toBe("1.5 GB");
  });
  it("finds next month's first day in UTC, across a year end", () => {
    expect(nextMonthStartUtc(new Date("2026-12-31T23:59:00Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
    expect(formatResetDate("2027-01-01T00:00:00.000Z")).toBe("January 1");
  });
});
