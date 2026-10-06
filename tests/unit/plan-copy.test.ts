import { describe, it, expect } from "vitest";
import {
  LIMIT_PITCH,
  PLAN_PITCH,
  count,
  limitPitch,
  notifyMeHref,
  plansWith,
  pricingCurrencyFor,
  pricingFaqs,
} from "@/lib/plan-copy";
import { PLAN_LIMIT_KEYS, formatPlanStorage, type PlanLimitInfo } from "@/lib/plan-limit";
import { PERSONAL_PLANS, PLAN_LIMITS, PLAN_NAMES, planAtLeast, type PersonalPlan } from "@/lib/plans";
import { siteConfig } from "@/lib/site";

/** The words the copy must never use: guilt, fake urgency, or a checkout that doesn't exist. */
const BANNED = [/!/, /\bhurry\b/i, /\blimited time\b/i, /\bbuy now\b/i, /\bfree forever\b/i, /\beverything included\b/i];

function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

describe("PLAN_PITCH", () => {
  it("has a who-it's-for line, a headline, a story and 3–5 outcomes for every plan", () => {
    for (const plan of PERSONAL_PLANS) {
      const p = PLAN_PITCH[plan];
      expect(p.audience.trim()).toBeTruthy();
      expect(p.headline.trim()).toBeTruthy();
      expect(p.story.trim()).toBeTruthy();
      expect(p.lead.trim()).toBeTruthy();
      expect(p.outcomes.length).toBeGreaterThanOrEqual(3);
      expect(p.outcomes.length).toBeLessThanOrEqual(5);
      expect(new Set(p.outcomes).size).toBe(p.outcomes.length);
    }
  });

  it("reads its numbers from PLAN_LIMITS, so the cards can't promise more than the app allows", () => {
    for (const plan of PERSONAL_PLANS) {
      const text = PLAN_PITCH[plan].outcomes.join(" ");
      expect(text).toContain(count(PLAN_LIMITS[plan].aiActionsPerMonth));
      expect(text).toContain(formatPlanStorage(PLAN_LIMITS[plan].storageBytes));
      expect(PLAN_PITCH[plan].people).toContain(count(PLAN_LIMITS[plan].members));
    }
  });

  it("only sells voice on a plan that has it", () => {
    for (const plan of PERSONAL_PLANS) {
      const mentionsVoice = /voice/i.test(PLAN_PITCH[plan].outcomes.join(" "));
      if (mentionsVoice) expect(PLAN_LIMITS[plan].voice).toBe(true);
    }
  });

  it("stays in the agreed register", () => {
    for (const s of allStrings(PLAN_PITCH)) for (const re of BANNED) expect(s).not.toMatch(re);
  });
});

describe("LIMIT_PITCH / limitPitch", () => {
  it("has copy for every plan-limit key", () => {
    expect(Object.keys(LIMIT_PITCH).sort()).toEqual([...PLAN_LIMIT_KEYS].sort());
  });

  it("produces a headline, a status and — when a plan lifts it — a pitch naming that plan", () => {
    const now = new Date(Date.UTC(2026, 9, 12));
    for (const limit of PLAN_LIMIT_KEYS) {
      for (const plan of PERSONAL_PLANS) {
        const upgradeTo = PERSONAL_PLANS.find((p) => p !== plan && planAtLeast(p, plan)) ?? null;
        const info: PlanLimitInfo = { limit, plan, upgradeTo };
        const copy = limitPitch(info, now);
        expect(copy.headline.trim()).toBeTruthy();
        expect(copy.status.trim()).toBeTruthy();
        expect(copy.status).not.toMatch(/undefined|NaN/);
        for (const re of BANNED) {
          expect(copy.headline).not.toMatch(re);
          expect(copy.status).not.toMatch(re);
        }
        if (upgradeTo) {
          expect(copy.pitch).toContain(PLAN_NAMES[upgradeTo]);
          expect(copy.pitch).not.toMatch(/undefined|NaN/);
        } else {
          expect(copy.pitch).toBeNull();
        }
      }
    }
  });

  it("falls back to the plan's own cap when the error didn't carry one", () => {
    const copy = limitPitch({ limit: "aiActions", plan: "free", upgradeTo: "plus" });
    expect(copy.status).toContain(count(PLAN_LIMITS.free.aiActionsPerMonth));
    expect(copy.pitch).toContain(count(PLAN_LIMITS.plus.aiActionsPerMonth));
  });

  it("uses the cap from the error when there is one, and says when AI actions come back", () => {
    const copy = limitPitch(
      { limit: "aiActions", plan: "plus", max: 300, used: 300, upgradeTo: "pro" },
      new Date(Date.UTC(2026, 9, 12)),
    );
    expect(copy.status).toContain("300");
    expect(copy.status).toContain("November 1");
    expect(copy.pitch).toContain(count(PLAN_LIMITS.pro.aiActionsPerMonth));
  });

  it("shows storage used, capped at the limit", () => {
    const gb = 1024 ** 3;
    const copy = limitPitch({ limit: "storage", plan: "free", max: gb, used: 2 * gb, upgradeTo: "plus" });
    expect(copy.status).toContain("1 GB");
    expect(copy.status).not.toContain("2 GB");
  });
});

describe("pricingFaqs", () => {
  it("covers billing per workspace, limits, the trial and the student discount", () => {
    const text = pricingFaqs()
      .map((f) => `${f.q} ${f.a}`)
      .join(" ");
    expect(text).toMatch(/workspace/i);
    expect(text).toMatch(/nothing is deleted/i);
    expect(text).toMatch(/trial/i);
    expect(text).toMatch(/student/i);
    expect(text).toMatch(/checkout isn't open yet/i);
  });

  it("adds the self-hosting question only when asked", () => {
    const base = pricingFaqs();
    const withSelfHost = pricingFaqs({ selfHost: true });
    expect(withSelfHost).toHaveLength(base.length + 1);
    expect(base.some((f) => /self-host/i.test(f.q))).toBe(false);
  });
});

describe("helpers", () => {
  it("prices a workspace in its own currency when we sell in it, else in dollars", () => {
    expect(pricingCurrencyFor("INR")).toBe("INR");
    expect(pricingCurrencyFor("EUR")).toBe("EUR");
    expect(pricingCurrencyFor("SGD")).toBe("USD");
    expect(pricingCurrencyFor(null)).toBe("USD");
  });

  it("names the plans that include a feature", () => {
    expect(plansWith("voice")).toBe("Pro");
    expect(plansWith("profileLevelAccess")).toBe("Plus and Pro");
  });

  it("builds a notify-me mailto to support, never a checkout link", () => {
    const href = notifyMeHref("plus" as PersonalPlan);
    expect(href.startsWith(`mailto:${siteConfig.supportEmail}?subject=`)).toBe(true);
    expect(decodeURIComponent(href)).toContain("Plus");
  });
});
