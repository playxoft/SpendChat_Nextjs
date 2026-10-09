import { describe, expect, it } from "vitest";
import {
  DISPUTES_BEFORE_BLOCK,
  PAYMENT_GRACE_DAYS,
  TRIALS_PER_PERSON,
  checkTopUpPayment,
  disputeHolds,
  entitlesPlan,
  failedPaymentHold,
  isLiveStatus,
  planChangeKind,
  planChangeRequest,
  trialDaysFor,
  workspacePlanFor,
} from "@/lib/billing-rules";
import { billingCountryFor, paymentMethodTypes } from "@/lib/payments";
import { TRIAL_DAYS } from "@/lib/pricing";

const DAY = 24 * 60 * 60 * 1000;

describe("subscription status → plan", () => {
  it("entitles the paid plan while active, past due (retrying) or on hold (held below), and Free otherwise", () => {
    for (const s of ["active", "past_due", "on_hold"]) expect(entitlesPlan(s)).toBe(true);
    for (const s of ["pending", "paused", "cancelled", "expired", "failed", "something_new"]) {
      expect(entitlesPlan(s)).toBe(false);
    }
    expect(workspacePlanFor({ status: "active", plan: "pro" })).toBe("pro");
    expect(workspacePlanFor({ status: "expired", plan: "pro" })).toBe("free");
    expect(workspacePlanFor(null)).toBe("free");
  });

  it("counts pending, active, on hold, paused and past due as live — one per workspace", () => {
    expect(["pending", "active", "on_hold", "paused", "past_due"].every(isLiveStatus)).toBe(true);
    expect(["cancelled", "expired", "failed"].some(isLiveStatus)).toBe(false);
  });
});

describe("failed payments (B3)", () => {
  const now = new Date("2026-10-09T10:00:00Z");

  it("B3: the first final failure leaves 7 days before view-only", () => {
    const r = failedPaymentHold(now, null);
    expect(r.graceGranted).toBe(true);
    expect(r.holdFrom.getTime() - now.getTime()).toBe(PAYMENT_GRACE_DAYS * DAY);
  });

  it("B3: a second failure within 3 months is view-only right away", () => {
    const r = failedPaymentHold(now, new Date(now.getTime() - 40 * DAY));
    expect(r).toEqual({ holdFrom: now, graceGranted: false });
  });

  it("B3: after 3 months the grace is given again", () => {
    expect(failedPaymentHold(now, new Date(now.getTime() - 91 * DAY)).graceGranted).toBe(true);
  });
});

describe("plan changes (C3)", () => {
  it("a bigger plan, or the same plan for longer, is an upgrade — prorated, now", () => {
    expect(planChangeKind({ plan: "plus", period: "monthly" }, { plan: "pro", period: "monthly" })).toBe("upgrade");
    expect(planChangeKind({ plan: "plus", period: "yearly" }, { plan: "pro", period: "monthly" })).toBe("upgrade");
    expect(planChangeKind({ plan: "plus", period: "monthly" }, { plan: "plus", period: "quarterly" })).toBe("upgrade");
    expect(planChangeRequest("upgrade")).toEqual({
      proration_billing_mode: "prorated_immediately",
      effective_at: "immediately",
    });
  });

  it("C3: a smaller plan, or a shorter period, waits for the renewal and bills nothing now", () => {
    expect(planChangeKind({ plan: "pro", period: "monthly" }, { plan: "plus", period: "yearly" })).toBe("downgrade");
    expect(planChangeKind({ plan: "pro", period: "yearly" }, { plan: "pro", period: "monthly" })).toBe("downgrade");
    expect(planChangeRequest("downgrade")).toEqual({
      proration_billing_mode: "do_not_bill",
      effective_at: "next_billing_date",
    });
  });

  it("the same plan and period is no change", () => {
    expect(planChangeKind({ plan: "pro", period: "yearly" }, { plan: "pro", period: "yearly" })).toBe("same");
  });
});

describe("trials (B1)", () => {
  it("B1: a workspace's first paid plan gets the full trial", () => {
    expect(trialDaysFor({ workspaceHadPlan: false, buyerTrialsElsewhere: 0 })).toBe(TRIAL_DAYS);
    expect(trialDaysFor({ workspaceHadPlan: false, buyerTrialsElsewhere: TRIALS_PER_PERSON - 1 })).toBe(TRIAL_DAYS);
  });

  it("B1: one trial per workspace", () => {
    expect(trialDaysFor({ workspaceHadPlan: true, buyerTrialsElsewhere: 0 })).toBe(0);
  });

  it("B1: at most 2 trials per person per 12 months", () => {
    expect(trialDaysFor({ workspaceHadPlan: false, buyerTrialsElsewhere: TRIALS_PER_PERSON })).toBe(0);
  });
});

describe("top-up payments (A3)", () => {
  const session = { item: "topup" as const, workspaceId: "w1", expectedAmountMinor: 19900, currency: "INR" };
  const paid = { workspaceId: "w1", totalAmountMinor: 23482, taxMinor: 3582, currency: "INR" };

  it("A3: grants when at least the priced amount (before tax) arrived for the same workspace", () => {
    expect(checkTopUpPayment(session, paid)).toEqual({ ok: true });
    expect(checkTopUpPayment(session, { ...paid, totalAmountMinor: 19900, taxMinor: null })).toEqual({ ok: true });
  });

  it("A3: refuses an edited amount, another workspace, another currency, or a plan's session", () => {
    expect(checkTopUpPayment(session, { ...paid, totalAmountMinor: 100, taxMinor: 0 })).toEqual({
      ok: false,
      reason: "amount_short",
    });
    // Tax isn't counted toward the price.
    expect(checkTopUpPayment(session, { ...paid, totalAmountMinor: 21000, taxMinor: 3582 })).toMatchObject({
      reason: "amount_short",
    });
    expect(checkTopUpPayment(session, { ...paid, workspaceId: "w2" })).toMatchObject({ reason: "workspace_mismatch" });
    expect(checkTopUpPayment(session, { ...paid, currency: "USD" })).toMatchObject({ reason: "currency_mismatch" });
    expect(checkTopUpPayment({ ...session, item: "plan" }, paid)).toMatchObject({ reason: "not_topup" });
  });
});

describe("disputes (B2)", () => {
  it("B2: opened, challenged, accepted, lost and expired keep the hold; won and cancelled lift it", () => {
    for (const s of ["dispute_opened", "dispute_challenged", "dispute_accepted", "dispute_lost", "dispute_expired"]) {
      expect(disputeHolds(s)).toBe(true);
    }
    for (const s of ["dispute_won", "dispute_cancelled"]) expect(disputeHolds(s)).toBe(false);
    expect(DISPUTES_BEFORE_BLOCK).toBe(2);
  });
});

describe("checkout country and methods", () => {
  it("pins the request's own country, or the currency's home when there is none", () => {
    expect(billingCountryFor("INR", "in")).toBe("IN");
    expect(billingCountryFor("USD", "DE")).toBe("DE");
    expect(billingCountryFor("INR", null)).toBe("IN");
    expect(billingCountryFor("GBP", "XX")).toBe("GB");
    expect(billingCountryFor("JPY", "T1")).toBe("JP");
  });

  it("offers UPI only for rupees, always with cards as the fallback", () => {
    expect(paymentMethodTypes("INR")).toEqual(["upi_intent", "credit", "debit"]);
    expect(paymentMethodTypes("EUR")).toEqual(["credit", "debit"]);
  });
});
