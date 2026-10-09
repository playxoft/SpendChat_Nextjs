import { describe, it, expect } from "vitest";
import {
  LIMIT_PITCH,
  PLAN_PITCH,
  PURCHASE,
  cardTrialLine,
  chargeLine,
  checkoutRefusalMessage,
  count,
  limitPitch,
  paymentMethods,
  planChanges,
  planCta,
  plansWith,
  pricingCurrencyFor,
  pricingFaqs,
  upgradeAction,
  workspacePriceCurrency,
} from "@/lib/plan-copy";
import { UPGRADE_LIMITS, formatPlanStorage, type PlanLimitInfo } from "@/lib/plan-limit";
import { PERSONAL_PLANS, PLAN_LIMITS, PLAN_NAMES, TOPUP, planAtLeast } from "@/lib/plans";
import { CURRENCIES, TRIAL_DAYS } from "@/lib/pricing";

/** The words the copy must never use: guilt, fake urgency, or a checkout that doesn't exist. */
const BANNED = [/!/, /\bhurry\b/i, /\blimited time\b/i, /\bbuy now\b/i, /\bfree forever\b/i, /\beverything included\b/i];

/** Paid plans are on sale: nothing may say they're coming, or that nobody can pay. */
const NOT_YET = [/\bsoon\b/i, /not open yet/i, /isn't open/i, /can be charged/i, /tell me when/i, /not on sale/i, /isn't live/i];

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
  it("has copy for every plan-limit key, and for a new workspace", () => {
    expect(Object.keys(LIMIT_PITCH).sort()).toEqual([...UPGRADE_LIMITS].sort());
  });

  it("produces a headline, a status and — when a plan lifts it — a pitch naming that plan", () => {
    const now = new Date(Date.UTC(2026, 9, 12));
    for (const limit of UPGRADE_LIMITS) {
      for (const plan of PERSONAL_PLANS) {
        // A billing hold is never lifted by a plan — its dialog points to Billing or support.
        const upgradeTo =
          limit === "billingHold" ? null : (PERSONAL_PLANS.find((p) => p !== plan && planAtLeast(p, plan)) ?? null);
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

  it("tells a view-only workspace apart from creating another one", () => {
    const viewOnly = limitPitch({ limit: "freeWorkspaces", plan: "free", upgradeTo: "plus" });
    expect(viewOnly.status).toMatch(/This one is extra, so it's view-only/);

    const create = limitPitch({
      limit: "newWorkspace",
      plan: "free",
      max: 1,
      used: 1,
      upgradeTo: "plus",
      freeSlotHere: true,
    });
    expect(create.status).toBe(
      "You already have a free workspace — each extra workspace needs its own Plus or Pro plan.",
    );
    expect(create.status).not.toMatch(/view-only/);
    expect(create.pitch).toMatch(/^Upgrade this workspace to Plus/);

    const fromPro = limitPitch({ limit: "newWorkspace", plan: "pro", upgradeTo: "plus" });
    expect(fromPro.status).not.toMatch(/view-only/);
    expect(fromPro.pitch).toMatch(/^Upgrade your free workspace to Plus/);
  });

  it("pitches budgets with the next plan's number, Pro as no limit, and contact at Pro's cap", () => {
    const free = limitPitch({ limit: "budgets", plan: "free", max: 5, used: 5, upgradeTo: "plus" });
    expect(free.status).toContain("5 budgets");
    expect(free.pitch).toContain("Plus gives you 20");
    const plus = limitPitch({ limit: "budgets", plan: "plus", max: 20, used: 20, upgradeTo: "pro" });
    expect(plus.pitch).toContain("Pro takes the limit off");
    expect(plus.pitch).not.toMatch(/200/);
    const pro = limitPitch({ limit: "budgets", plan: "pro", used: 200, upgradeTo: null });
    expect(pro.status).toContain("200 budgets");
    expect(pro.pitch).toBeNull();
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
    expect(text).toMatch(/how does billing work/i);
    expect(text).toMatch(/by card — or UPI when you pay in rupees/i);
    expect(text).toContain(`${TRIAL_DAYS}-day free trial`);
  });

  it("talks about paid plans as on sale today", () => {
    for (const f of pricingFaqs({ selfHost: true })) {
      for (const re of NOT_YET) {
        expect(f.q).not.toMatch(re);
        expect(f.a).not.toMatch(re);
      }
    }
  });

  it("adds the self-hosting question only when asked", () => {
    const base = pricingFaqs();
    const withSelfHost = pricingFaqs({ selfHost: true });
    expect(withSelfHost).toHaveLength(base.length + 1);
    expect(base.some((f) => /self-host/i.test(f.q))).toBe(false);
  });
});

describe("helpers", () => {
  it("quotes a workspace's plans in the currency checkout will charge", () => {
    // INR only for a request from a rupee country — the same rule as checkout.
    expect(workspacePriceCurrency("INR", "IN")).toBe("INR");
    expect(workspacePriceCurrency("INR", "US")).toBe("USD");
    expect(workspacePriceCurrency("INR", "DE")).toBe("EUR");
    expect(workspacePriceCurrency("INR", null)).toBe("USD");
    // Every other currency is the global price, wherever the request is from.
    expect(workspacePriceCurrency("EUR", "IN")).toBe("EUR");
    expect(workspacePriceCurrency("SGD", "IN")).toBe("USD");
  });

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

});

describe("purchase copy", () => {
  it("never says paid plans are coming, and stays in the agreed register", () => {
    for (const str of allStrings(PURCHASE)) {
      for (const re of [...NOT_YET, ...BANNED]) expect(str).not.toMatch(re);
    }
  });

  it("offers UPI only where it exists — rupees, from India", () => {
    expect(paymentMethods("INR", true)).toBe("card or UPI");
    expect(PURCHASE.ctaNote("INR", true)).toBe("Pay by card or UPI. Cancel any time.");
    expect(PURCHASE.billing("INR", true)).toContain("card or UPI");
    // Rupees from Nepal, Bhutan, Bangladesh or Sri Lanka: the provider shows no UPI there.
    expect(paymentMethods("INR", false)).toBe("card");
    for (const { code } of CURRENCIES.filter((c) => c.code !== "INR")) {
      expect(paymentMethods(code, true)).toBe("card");
      expect(PURCHASE.ctaNote(code, true)).not.toMatch(/UPI/);
      expect(PURCHASE.billing(code, true)).not.toMatch(/UPI/);
    }
    for (const { code } of CURRENCIES) {
      for (const str of [PURCHASE.ctaNote(code, true), PURCHASE.billing(code, true)]) {
        for (const re of [...NOT_YET, ...BANNED]) expect(str).not.toMatch(re);
      }
    }
  });

  it("shows the trial line only to a workspace that would get the trial", () => {
    // The public page has no plan yet, and a Free workspace's first paid plan
    // comes with the trial…
    expect(cardTrialLine()).toBe(`First ${TRIAL_DAYS} days free`);
    expect(cardTrialLine("free")).toBe(`First ${TRIAL_DAYS} days free`);
    // …a paid workspace moving up doesn't get another.
    expect(cardTrialLine("plus")).toBeNull();
    expect(cardTrialLine("pro")).toBeNull();
  });

  it("offers the trial from Free and a straight upgrade from a paid plan", () => {
    expect(planCta("plus")).toBe(`Start ${TRIAL_DAYS}-day free trial`);
    expect(planCta("pro", "free")).toBe(`Start ${TRIAL_DAYS}-day free trial`);
    expect(planCta("pro", "plus")).toBe("Upgrade to Pro");
    expect(PURCHASE.topUpCta).toContain(count(TOPUP.actions));
  });

  it("says what is charged and when", () => {
    expect(chargeLine("₹1,299", "yearly", TRIAL_DAYS)).toBe(`${TRIAL_DAYS} days free, then ₹1,299 billed yearly`);
    expect(chargeLine("$5.99", "monthly", 0)).toBe("$5.99 billed monthly, starting today");
  });

  it("explains each refusal in words", () => {
    expect(checkoutRefusalMessage("samePlan", "plus")).toContain("already on Plus");
    expect(checkoutRefusalMessage("downgrade", "pro", "plus")).toContain("everything in Plus");
    expect(checkoutRefusalMessage("topUpNeedsPlan", "free")).toContain(plansWith("topUps"));
  });
});

describe("planChanges", () => {
  it("lists only what goes up, read from PLAN_LIMITS", () => {
    const changes = planChanges("free", "plus");
    const members = changes.find((c) => c.label === "People in the workspace");
    expect(members).toEqual({
      label: "People in the workspace",
      from: count(PLAN_LIMITS.free.members),
      to: count(PLAN_LIMITS.plus.members),
    });
    expect(changes.find((c) => c.label === "Storage")?.to).toBe(formatPlanStorage(PLAN_LIMITS.plus.storageBytes));
    expect(changes.some((c) => c.label === "Voice entry")).toBe(PLAN_LIMITS.plus.voice);
  });

  it("shows budgets going up — and Pro's as Unlimited, never its safety cap", () => {
    expect(planChanges("free", "plus").find((c) => c.label === "Budgets")).toEqual({
      label: "Budgets",
      from: "5",
      to: "20",
    });
    expect(planChanges("plus", "pro").find((c) => c.label === "Budgets")).toEqual({
      label: "Budgets",
      from: "20",
      to: "Unlimited",
    });
  });

  it("adds insights and trends on the way up from Free only", () => {
    expect(planChanges("free", "plus")).toContainEqual({ label: "Insights and trends", to: "Included" });
    expect(planChanges("free", "pro")).toContainEqual({ label: "Insights and trends", to: "Included" });
    expect(planChanges("plus", "pro").some((c) => c.label === "Insights and trends")).toBe(false);
  });

  it("adds voice on the way to Pro, and nothing when the plan doesn't change", () => {
    expect(planChanges("plus", "pro").some((c) => c.label === "Voice entry")).toBe(true);
    expect(planChanges("pro", "pro")).toEqual([]);
    expect(planChanges("pro", "free")).toEqual([]);
  });
});

describe("upgradeAction", () => {
  it("sends a limit on this workspace straight to checkout, with the trial only from Free", () => {
    const fromFree = upgradeAction({ limit: "spaces", plan: "free", max: 2, used: 2, upgradeTo: "plus" });
    expect(fromFree).toEqual({
      href: "/app/upgrade/checkout?plan=plus&period=yearly",
      label: "Upgrade to Plus",
      trialDays: TRIAL_DAYS,
    });
    const fromPlus = upgradeAction({ limit: "voice", plan: "plus", upgradeTo: "pro" });
    expect(fromPlus.href).toBe("/app/upgrade/checkout?plan=pro&period=yearly");
    expect(fromPlus.trialDays).toBe(0);
  });

  it("sends a view-only workspace to the plans page", () => {
    expect(upgradeAction({ limit: "freeWorkspaces", plan: "free", upgradeTo: "plus" })).toEqual({
      href: "/app/upgrade",
      label: "Upgrade to Plus",
      trialDays: TRIAL_DAYS,
    });
  });

  it("lifts 'New workspace' by upgrading the person's free workspace, here or elsewhere", () => {
    // This is their free workspace: upgrade it, from the plans page.
    expect(
      upgradeAction({ limit: "newWorkspace", plan: "free", upgradeTo: "plus", freeSlotHere: true }),
    ).toEqual({ href: "/app/upgrade", label: "Upgrade to Plus", trialDays: TRIAL_DAYS });
    // On a paid workspace (or someone else's): find the free one in organisation
    // settings. That free workspace is what gets the trial.
    for (const plan of ["free", "plus", "pro"] as const) {
      expect(upgradeAction({ limit: "newWorkspace", plan, upgradeTo: "plus" })).toEqual({
        href: "/app/settings/organization",
        label: "Upgrade your free workspace",
        trialDays: TRIAL_DAYS,
      });
    }
  });
});

describe("newWorkspace pitch (second review of #90)", () => {
  it("doesn't promise that upgrading one free workspace makes room when the person owns two", async () => {
    const { limitPitch } = await import("@/lib/plan-copy");
    const one = limitPitch({ limit: "newWorkspace", plan: "pro", upgradeTo: "plus", freeSlotHere: false, freeOwned: 1 });
    expect(one.pitch).toMatch(/new one can start on Free/);
    const two = limitPitch({ limit: "newWorkspace", plan: "pro", upgradeTo: "plus", freeSlotHere: false, freeOwned: 2 });
    expect(two.pitch).toMatch(/2 free workspaces/);
    expect(two.pitch).not.toMatch(/new one can start on Free/);
  });
});

