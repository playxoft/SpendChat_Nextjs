import { describe, expect, it } from "vitest";
import { PERSONAL_PLANS, PLAN_LIMITS, PLAN_NAMES } from "@/lib/plans";
import {
  PLAN_LIMIT_KEYS,
  formatPlanStorage,
  formatResetDate,
  isPlanLimit,
  meterState,
  nextMonthStartUtc,
  nextPlanFor,
  parsePlanLimitDetails,
  planHighlights,
  planLimitOf,
  upgradeCopy,
  type NumericPlanLimit,
} from "@/lib/plan-limit";

/**
 * The client half of `plan_limit`: recognising one on an action result, and
 * the upgrade dialog's words. The numbers must come from `PLAN_LIMITS`, and the
 * copy must never imply that anything gets deleted.
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

describe("upgradeCopy", () => {
  it("has words for every limit, on every plan", () => {
    for (const limit of PLAN_LIMIT_KEYS) {
      for (const plan of PERSONAL_PLANS) {
        const copy = upgradeCopy({ limit, plan, upgradeTo: plan === "pro" ? null : "pro" });
        expect(copy.title.length).toBeGreaterThan(0);
        expect(copy.reason.length).toBeGreaterThan(0);
        // Limits stop adding; they never take anything away.
        expect(`${copy.title} ${copy.reason}`).not.toMatch(/\b(will be|get|gets) deleted\b/i);
      }
    }
  });
  it("names the plan that lifts the limit, with its number from PLAN_LIMITS", () => {
    const copy = upgradeCopy({ limit: "members", plan: "free", max: 3, used: 3, upgradeTo: "plus" });
    expect(copy.reason).toContain("3 members");
    expect(copy.upgradeTo).toBe("plus");
    expect(copy.upgradeLine).toBe(`Plus includes ${PLAN_LIMITS.plus.members} members.`);
    expect(copy.includes).toEqual(planHighlights("plus"));
  });
  it("says 'contact us' territory when nothing lifts it", () => {
    const copy = upgradeCopy({ limit: "spaces", plan: "pro", max: 15, used: 15, upgradeTo: null });
    expect(copy.upgradeTo).toBeNull();
    expect(copy.upgradeLine).toBeNull();
    expect(copy.includes).toEqual([]);
  });
  it("words storage in sizes, and the AI refill date", () => {
    const storage = upgradeCopy({
      limit: "storage",
      plan: "free",
      max: PLAN_LIMITS.free.storageBytes,
      used: PLAN_LIMITS.free.storageBytes,
      upgradeTo: "plus",
    });
    expect(storage.reason).toContain("1 GB");
    expect(storage.upgradeLine).toBe("Plus includes 5 GB.");
    const ai = upgradeCopy(
      { limit: "aiActions", plan: "free", max: 50, used: 50, upgradeTo: "plus" },
      new Date("2026-10-05T12:00:00Z"),
    );
    expect(ai.reason).toContain("50 AI actions");
    expect(ai.reason).toContain("November 1");
  });
  it("calls voice a Pro feature", () => {
    expect(upgradeCopy({ limit: "voice", plan: "plus", upgradeTo: "pro" }).title).toBe(
      `Voice entry is on ${PLAN_NAMES.pro}`,
    );
  });
});

describe("planHighlights", () => {
  it("lists voice and per-profile access only where the plan has them", () => {
    expect(planHighlights("free").join(" ")).not.toMatch(/Voice/);
    expect(planHighlights("plus")).toContain("Access settings for each profile");
    expect(planHighlights("pro")).toContain("Voice entry");
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
