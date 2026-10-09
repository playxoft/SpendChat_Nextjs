import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import {
  aiTopups,
  aiUsageLog,
  billingCheckoutSessions,
  billingPayments,
  billingWebhookEvents,
  users,
  workspaceSubscriptions,
  workspaces,
} from "@/db/schema";
import { chargeAiParse, withAiCharge } from "@/lib/ai-quota";
import * as dodo from "@/lib/dodo";
import { settleDeferred } from "@/lib/defer";
import { assertCanAddCategory, getAiAllowance, getWorkspaceEntitlements } from "@/lib/entitlements";
import { ApiError } from "@/lib/errors";
import { PLAN_LIMITS, TOPUP } from "@/lib/plans";
import { topUpPriceMinor } from "@/lib/pricing";
import { createWorkspaceWithDefaults, requireProfileRole } from "@/lib/workspaces";
import * as billing from "@/services/billing";
import { POST as webhookRoute } from "@/app/api/webhooks/dodo/route";
import {
  PRODUCTS,
  configureBilling,
  deliver,
  latestSession,
  paymentData,
  signedHeaders,
  subscriptionData,
  subscriptionRow,
  unconfigureBilling,
  workspaceRow,
} from "./helpers/billing";
import { bootstrapUser, firstProfileId, setWorkspacePlan, workspaceIdOf } from "./helpers/seed";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";

vi.mock("@/lib/dodo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dodo")>();
  let n = 0;
  return {
    ...actual,
    createCheckoutSession: vi.fn(async () => {
      n += 1;
      return { sessionId: `cks_wh_${n}`, checkoutUrl: `https://test.checkout.dodopayments.com/session/cks_wh_${n}` };
    }),
    changePlan: vi.fn(async () => {}),
    cancelScheduledPlanChange: vi.fn(async () => {}),
    updateSubscription: vi.fn(async () => {}),
    createPortalSession: vi.fn(async () => "https://portal"),
    getSubscription: vi.fn(),
  };
});

/**
 * The billing webhook — the only place a plan changes, a top-up is granted, or
 * billing makes a workspace view-only. Deliveries are signed exactly as the
 * provider signs them and go through the real handler (and once through the
 * route). Covers the lifecycle, placing events through our own rows,
 * idempotency, out-of-order delivery, and the abuse rules A3, B2, B3, C3, C4.
 */

const DAY = 86_400_000;
const db = () => getTestDb();

async function ownWorkspace(alias = "own"): Promise<string> {
  signInAs(alias);
  await bootstrapUser(alias);
  return workspaceIdOf(alias);
}

/** Open a plan checkout for W and activate it through the webhook, as the provider would. */
async function activePlan(
  W: string,
  opts: { plan?: "plus" | "pro"; sub?: string; trial?: number; buyer?: string } = {},
): Promise<string> {
  const p = opts.plan ?? "plus";
  const buyer = opts.buyer ?? "own";
  await billing.startCheckout(uid(buyer), W, { item: "plan", plan: p, period: "yearly", currency: "INR" }, { country: "IN" });
  const session = await latestSession(W);
  const sub = opts.sub ?? `sub_${W.slice(-8)}`;
  // The trial's $0 mandate payment ties the subscription to our checkout…
  expect(
    (
      await deliver(
        "payment.succeeded",
        paymentData({ subscription_id: sub, checkout_session_id: session.sessionId, total_amount: 0 }),
      )
    ).status,
  ).toBe(200);
  // …and the subscription goes active.
  const res = await deliver(
    "subscription.active",
    subscriptionData({ subscription_id: sub, product_id: PRODUCTS[`${p}_yearly`], trial_period_days: opts.trial ?? 21 }),
  );
  expect(res.status).toBe(200);
  return sub;
}

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.code : String(err);
  }
}

beforeEach(() => configureBilling());
afterAll(() => unconfigureBilling());

describe("signature and configuration", () => {
  it("refuses an unsigned or mis-signed delivery with 401 and no detail, and changes nothing", async () => {
    const W = await ownWorkspace();
    const body = JSON.stringify({
      type: "subscription.active",
      timestamp: new Date().toISOString(),
      data: subscriptionData({ workspaceId: W, buyerUserId: uid("own") }),
    });
    const { handleDodoWebhook } = await import("@/services/billing-webhook");
    const forged = signedHeaders("evt_forged", body, undefined, `whsec_${Buffer.from("not-the-secret").toString("base64")}`);
    const res = await handleDodoWebhook(body, forged);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("");
    const stale = signedHeaders("evt_old", body, Math.floor(Date.now() / 1000) - 3600);
    expect((await handleDodoWebhook(body, stale)).status).toBe(401);
    expect(await db().select().from(billingWebhookEvents)).toEqual([]);
  });

  it("answers 503 (retry later) on a server without the keys", async () => {
    unconfigureBilling();
    const res = await deliver("subscription.active", subscriptionData());
    expect(res.status).toBe(503);
  });

  it("works through the route, reading the raw body", async () => {
    await ownWorkspace();
    const body = JSON.stringify({ type: "payout.success", timestamp: new Date().toISOString(), data: {} });
    const res = await webhookRoute(
      new Request("http://localhost/api/webhooks/dodo", { method: "POST", body, headers: signedHeaders("evt_route", body) }),
    );
    expect(res.status).toBe(200);
    expect(await db().select().from(billingWebhookEvents)).toHaveLength(1);
  });
});

describe("a plan's life: activate → renew → upgrade → downgrade at renewal → cancel → end", () => {
  it("moves the workspace's plan only when the provider says so", async () => {
    const W = await ownWorkspace();
    await billing.startCheckout(uid("own"), W, { item: "plan", plan: "plus", period: "yearly", currency: "INR" }, { country: "IN" });
    const session = await latestSession(W);
    expect(await billing.checkoutReturnStatus(uid("own"), W)).toEqual({ state: "waiting", item: "plan" });

    // Activate (the trial), placed through the metadata of a checkout we opened.
    await deliver(
      "subscription.active",
      subscriptionData({ subscription_id: "sub_life", workspaceId: W, buyerUserId: uid("own") }),
    );
    expect((await workspaceRow(W)).plan).toBe("plus");
    const row = (await subscriptionRow("sub_life"))!;
    expect(row).toMatchObject({ workspaceId: W, status: "active", plan: "plus", period: "yearly", trialDays: 21 });
    expect(row.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 20 * DAY);
    expect((await latestSession(W)).subscriptionId).toBe("sub_life");
    expect(await billing.checkoutReturnStatus(uid("own"), W)).toMatchObject({ state: "done", item: "plan", plan: "plus" });

    // Renew (trial end): the payment is recorded for the invoice list.
    await deliver("subscription.renewed", subscriptionData({ subscription_id: "sub_life" }));
    await deliver(
      "payment.succeeded",
      paymentData({ payment_id: "pay_renew", subscription_id: "sub_life", total_amount: 153282, tax: 23382 }),
    );
    const [paid] = await db().select().from(billingPayments).where(eq(billingPayments.paymentId, "pay_renew"));
    expect(paid).toMatchObject({ workspaceId: W, kind: "plan", totalAmountMinor: 153282, status: "succeeded" });
    expect(paid!.invoiceUrl).toContain("invoices");

    // Upgrade to Pro.
    await deliver("subscription.plan_changed", subscriptionData({ subscription_id: "sub_life", product_id: PRODUCTS.pro_yearly }));
    expect((await workspaceRow(W)).plan).toBe("pro");
    expect(await billing.checkoutReturnStatus(uid("own"), W, { plan: "pro", period: "yearly" })).toMatchObject({
      state: "done",
    });

    // C3: a downgrade scheduled for the renewal keeps Pro until then.
    const renewal = new Date(Date.now() + 300 * DAY).toISOString();
    await deliver(
      "subscription.updated",
      subscriptionData({
        subscription_id: "sub_life",
        product_id: PRODUCTS.pro_yearly,
        next_billing_date: renewal,
        scheduled_change: { id: "sc_1", product_id: PRODUCTS.plus_monthly, effective_at: renewal, quantity: 1, addons: [], created_at: renewal },
      }),
    );
    expect((await workspaceRow(W)).plan).toBe("pro");
    expect(await subscriptionRow("sub_life")).toMatchObject({ plan: "pro", scheduledPlan: "plus", scheduledPeriod: "monthly" });

    // …and arrives at the renewal.
    await deliver(
      "subscription.plan_changed",
      subscriptionData({ subscription_id: "sub_life", product_id: PRODUCTS.plus_monthly, payment_frequency_count: 1, payment_frequency_interval: "Month" }),
    );
    expect((await workspaceRow(W)).plan).toBe("plus");
    expect(await subscriptionRow("sub_life")).toMatchObject({ plan: "plus", period: "monthly", scheduledPlan: null });

    // Cancel at period end: still Plus until the provider ends it.
    await deliver("subscription.updated", subscriptionData({ subscription_id: "sub_life", product_id: PRODUCTS.plus_monthly, cancel_at_next_billing_date: true }));
    expect((await workspaceRow(W)).plan).toBe("plus");
    expect((await subscriptionRow("sub_life"))!.cancelAtPeriodEnd).toBe(true);

    await deliver("subscription.cancelled", subscriptionData({ subscription_id: "sub_life", product_id: PRODUCTS.plus_monthly, status: "cancelled" }));
    expect((await workspaceRow(W)).plan).toBe("free");
    expect((await subscriptionRow("sub_life"))!.endedAt).not.toBeNull();
    void session;
  });

  it("an expired subscription goes back to Free too, keeping everything (limits gate adding only)", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W, { plan: "pro" });
    expect((await workspaceRow(W)).plan).toBe("pro");
    await deliver("subscription.expired", subscriptionData({ subscription_id: sub, product_id: PRODUCTS.pro_yearly, status: "expired" }));
    expect((await workspaceRow(W)).plan).toBe("free");
    expect(await getWorkspaceEntitlements(W)).toMatchObject({ plan: "free", readOnly: false });
  });

  it("a subscription whose first mandate failed never grants the plan", async () => {
    const W = await ownWorkspace();
    await billing.startCheckout(uid("own"), W, { item: "plan", plan: "plus", period: "yearly", currency: "INR" }, { country: "IN" });
    await deliver("subscription.failed", subscriptionData({ subscription_id: "sub_f", status: "failed", workspaceId: W, buyerUserId: uid("own") }));
    expect((await workspaceRow(W)).plan).toBe("free");
    expect(await billing.checkoutReturnStatus(uid("own"), W)).toEqual({ state: "failed" });
  });

  it("C3: usage carries over from Free into the paid plan — upgrading doesn't refill the month", async () => {
    const W = await ownWorkspace();
    await db()
      .insert(aiUsageLog)
      .values(Array.from({ length: 40 }, () => ({ userId: uid("own"), workspaceId: W, kind: "transaction_parse", units: 1, ownerId: uid("own"), plan: "free" as const })));
    expect((await getAiAllowance(W)).remaining).toBe(PLAN_LIMITS.free.aiActionsPerMonth - 40);
    await activePlan(W, { plan: "plus" });
    expect((await getAiAllowance(W)).remaining).toBe(PLAN_LIMITS.plus.aiActionsPerMonth - 40);
  });
});

describe("placing events through our own rows", () => {
  it("asks the provider to retry a subscription it can't place yet, then applies it once its payment ties it to our checkout", async () => {
    const W = await ownWorkspace();
    await billing.startCheckout(uid("own"), W, { item: "plan", plan: "plus", period: "yearly", currency: "INR" }, { country: "IN" });
    const session = await latestSession(W);
    // No metadata, no row yet: nothing to go on.
    const first = await deliver("subscription.active", subscriptionData({ subscription_id: "sub_late" }), { id: "evt_active" });
    expect(first.status).toBe(503);
    expect((await workspaceRow(W)).plan).toBe("free");
    expect(await db().select().from(billingWebhookEvents)).toEqual([]);

    await deliver("payment.succeeded", paymentData({ subscription_id: "sub_late", checkout_session_id: session.sessionId }));
    const retry = await deliver("subscription.active", subscriptionData({ subscription_id: "sub_late" }), { id: "evt_active" });
    expect(retry.status).toBe(200);
    expect((await workspaceRow(W)).plan).toBe("plus");
  });

  it("never trusts metadata alone: it must name a checkout we opened for that workspace, buyer and product", async () => {
    const W = await ownWorkspace();
    // Metadata naming this workspace, but no checkout was ever opened for it.
    const res = await deliver("subscription.active", subscriptionData({ subscription_id: "sub_forged", workspaceId: W, buyerUserId: uid("own") }));
    expect(res.status).toBe(503);
    // A checkout for Plus doesn't let a Pro subscription claim it.
    await billing.startCheckout(uid("own"), W, { item: "plan", plan: "plus", period: "yearly", currency: "INR" }, { country: "IN" });
    const pro = await deliver(
      "subscription.active",
      subscriptionData({ subscription_id: "sub_forged", workspaceId: W, buyerUserId: uid("own"), product_id: PRODUCTS.pro_yearly }),
    );
    expect(pro.status).toBe(503);
    expect((await workspaceRow(W)).plan).toBe("free");
  });

  it("skips an out-of-order event older than the state already applied", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    await deliver("subscription.on_hold", subscriptionData({ subscription_id: sub, status: "on_hold" }), {
      at: new Date(Date.now() - 60 * 60_000),
    });
    expect((await subscriptionRow(sub))!.status).toBe("active");
    expect((await workspaceRow(W)).billingHold).toBeNull();
  });

  it("ignores a product that isn't ours — nothing is granted", async () => {
    const W = await ownWorkspace();
    await billing.startCheckout(uid("own"), W, { item: "plan", plan: "plus", period: "yearly", currency: "INR" }, { country: "IN" });
    const session = await latestSession(W);
    await db().update(billingCheckoutSessions).set({ productId: "pdt_someone_else" }).where(eq(billingCheckoutSessions.id, session.id));
    const res = await deliver(
      "subscription.active",
      subscriptionData({ subscription_id: "sub_x", workspaceId: W, buyerUserId: uid("own"), product_id: "pdt_someone_else" }),
    );
    expect(res.status).toBe(200);
    expect((await workspaceRow(W)).plan).toBe("free");
    expect(await subscriptionRow("sub_x")).toBeUndefined();
  });

  it("a second subscription for a workspace that has one is superseded and cancelled, never stacked", async () => {
    const W = await ownWorkspace();
    await activePlan(W, { sub: "sub_first" });
    // A second checkout tab was paid too.
    await db()
      .insert(billingCheckoutSessions)
      .values({ sessionId: "cks_tab2", workspaceId: W, buyerUserId: uid("own"), item: "plan", plan: "pro", period: "yearly", productId: PRODUCTS.pro_yearly, expectedAmountMinor: 1, currency: "INR" });
    await deliver("subscription.active", subscriptionData({ subscription_id: "sub_second", product_id: PRODUCTS.pro_yearly, workspaceId: W, buyerUserId: uid("own") }));
    expect((await workspaceRow(W)).plan).toBe("plus");
    expect((await subscriptionRow("sub_second"))!.supersededAt).not.toBeNull();
    await settleDeferred();
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), "sub_second", {
      status: "cancelled",
      cancel_reason: "cancelled_by_merchant",
    });
  });
});

describe("idempotency", () => {
  it("the same event twice is one change", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    const renewal = paymentData({ payment_id: "pay_twice", subscription_id: sub, total_amount: 129900 });
    for (let i = 0; i < 2; i++) {
      expect((await deliver("payment.succeeded", renewal, { id: "evt_twice" })).status).toBe(200);
    }
    expect(await db().select().from(billingPayments).where(eq(billingPayments.paymentId, "pay_twice"))).toHaveLength(1);
    expect(await db().select().from(billingWebhookEvents).where(eq(billingWebhookEvents.id, "evt_twice"))).toHaveLength(1);
  });
});

describe("failed payments (B3)", () => {
  it("B3: keeps working while the provider retries (past due), then 7 days after the final failure", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    await deliver("subscription.past_due", subscriptionData({ subscription_id: sub, status: "past_due" }));
    expect(await getWorkspaceEntitlements(W)).toMatchObject({ plan: "plus", readOnly: false });
    expect((await subscriptionRow(sub))!.paymentFailedAt).not.toBeNull();

    await deliver("subscription.on_hold", subscriptionData({ subscription_id: sub, status: "on_hold" }));
    const ws = await workspaceRow(W);
    expect(ws.billingHold).toBe("payment_failed");
    expect(ws.billingHoldFrom!.getTime()).toBeGreaterThan(Date.now() + 6 * DAY);
    expect(ws.paymentGraceUsedAt).not.toBeNull();
    expect((await getWorkspaceEntitlements(W)).readOnly).toBe(false);

    // A week later: view-only, nothing deleted, the plan still Plus.
    await db().update(workspaces).set({ billingHoldFrom: new Date(Date.now() - 1000) }).where(eq(workspaces.id, W));
    expect(await getWorkspaceEntitlements(W)).toMatchObject({ plan: "plus", readOnly: true, readOnlyReason: "payment_failed" });
    expect(await codeOf(assertCanAddCategory(W))).toBe("billing_hold");

    // Paid: the hold lifts.
    await deliver("subscription.active", subscriptionData({ subscription_id: sub, status: "active" }));
    expect(await getWorkspaceEntitlements(W)).toMatchObject({ readOnly: false, readOnlyReason: null });
    expect((await subscriptionRow(sub))!.paymentFailedAt).toBeNull();
  });

  it("B3: the grace is once per 3 months — a second final failure inside the window is view-only at once", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    await deliver("subscription.on_hold", subscriptionData({ subscription_id: sub, status: "on_hold" }));
    await deliver("subscription.active", subscriptionData({ subscription_id: sub }));
    await deliver("subscription.on_hold", subscriptionData({ subscription_id: sub, status: "on_hold" }));
    expect(await getWorkspaceEntitlements(W)).toMatchObject({ readOnly: true, readOnlyReason: "payment_failed" });

    // After 3 months, a failure gets the grace again.
    await deliver("subscription.active", subscriptionData({ subscription_id: sub }));
    await db().update(workspaces).set({ paymentGraceUsedAt: new Date(Date.now() - 95 * DAY) }).where(eq(workspaces.id, W));
    await deliver("subscription.on_hold", subscriptionData({ subscription_id: sub, status: "on_hold" }));
    expect((await getWorkspaceEntitlements(W)).readOnly).toBe(false);
  });

  it("B3: a plan that ends unpaid goes back to Free and drops the hold — Free's own rules apply", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    await deliver("subscription.on_hold", subscriptionData({ subscription_id: sub, status: "on_hold" }));
    await deliver("subscription.cancelled", subscriptionData({ subscription_id: sub, status: "cancelled" }));
    expect(await workspaceRow(W)).toMatchObject({ plan: "free", billingHold: null });
    expect((await getWorkspaceEntitlements(W)).readOnly).toBe(false);
  });
});

describe("disputes (B2)", () => {
  it("B2: a dispute makes the workspace view-only at once; winning it lifts the hold", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    await deliver("payment.succeeded", paymentData({ payment_id: "pay_d1", subscription_id: sub, total_amount: 129900 }));
    await deliver("dispute.opened", { dispute_id: "dsp_1", payment_id: "pay_d1", dispute_status: "dispute_opened", amount: "129900", currency: "INR", dispute_stage: "dispute", business_id: "bus_test", created_at: new Date().toISOString() });
    expect(await getWorkspaceEntitlements(W)).toMatchObject({ readOnly: true, readOnlyReason: "dispute" });
    expect(await codeOf(assertCanAddCategory(W))).toBe("billing_hold");
    // A transaction write gets the same refusal, through the profile-role path.
    expect(await codeOf(requireProfileRole(uid("own"), await firstProfileId("own"), "editor"))).toBe("billing_hold");
    // One dispute doesn't block the person yet.
    const [me] = await db().select().from(users).where(eq(users.id, uid("own")));
    expect(me!.purchasesBlockedAt).toBeNull();

    await deliver("dispute.won", { dispute_id: "dsp_1", payment_id: "pay_d1", dispute_status: "dispute_won" });
    expect(await getWorkspaceEntitlements(W)).toMatchObject({ readOnly: false });
  });

  it("B2: a person's second disputed payment blocks their purchases", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    for (const id of ["pay_a", "pay_b"]) {
      await deliver("payment.succeeded", paymentData({ payment_id: id, subscription_id: sub, total_amount: 129900 }));
      await deliver("dispute.opened", { dispute_id: `dsp_${id}`, payment_id: id, dispute_status: "dispute_opened" });
    }
    const [me] = await db().select().from(users).where(eq(users.id, uid("own")));
    expect(me!.purchasesBlockedAt).not.toBeNull();
    // A new workspace can't be bought either.
    const other = await createWorkspaceWithDefaults(uid("own"), "Other", {});
    await expect(
      billing.startCheckout(uid("own"), other.id, { item: "plan", plan: "plus", period: "yearly" }),
    ).rejects.toMatchObject({ code: "purchases_blocked" });
  });

  it("B2: waits (retry) for a dispute whose payment isn't recorded yet", async () => {
    await ownWorkspace();
    const res = await deliver("dispute.opened", { dispute_id: "dsp_x", payment_id: "pay_unknown", dispute_status: "dispute_opened" });
    expect(res.status).toBe(503);
  });
});

describe("top-ups (A3, C4)", () => {
  async function topUpCheckout(W: string) {
    await setWorkspacePlan(W, "plus");
    await billing.startCheckout(uid("own"), W, { item: "topup", currency: "INR" }, { country: "IN" });
    return latestSession(W);
  }

  it("A3: grants 500 actions for 12 months when the amount received matches the checkout we priced", async () => {
    const W = await ownWorkspace();
    const session = await topUpCheckout(W);
    expect(await billing.checkoutReturnStatus(uid("own"), W)).toEqual({ state: "waiting", item: "topup" });
    const res = await deliver(
      "payment.succeeded",
      paymentData({
        payment_id: "pay_top",
        checkout_session_id: session.sessionId,
        total_amount: topUpPriceMinor("INR") + 3582,
        tax: 3582,
        metadata: { workspace_id: W, item: "topup" },
      }),
    );
    expect(res.status).toBe(200);
    const [top] = await db().select().from(aiTopups).where(eq(aiTopups.workspaceId, W));
    expect(top).toMatchObject({ actions: TOPUP.actions, remaining: TOPUP.actions, paymentId: "pay_top" });
    const months = (top!.expiresAt.getTime() - Date.now()) / (30.4 * DAY);
    expect(months).toBeGreaterThan(11.5);
    expect(months).toBeLessThan(12.5);
    expect(await billing.checkoutReturnStatus(uid("own"), W)).toEqual({ state: "done", item: "topup", actions: TOPUP.actions });
    expect((await getAiAllowance(W)).topUpRemaining).toBe(TOPUP.actions);
  });

  it("A3: an edited amount, another workspace's metadata, or no checkout of ours grants nothing", async () => {
    const W = await ownWorkspace();
    const session = await topUpCheckout(W);
    await deliver("payment.succeeded", paymentData({ payment_id: "pay_short", checkout_session_id: session.sessionId, total_amount: 100, tax: 0 }));
    await deliver(
      "payment.succeeded",
      paymentData({
        payment_id: "pay_wrong_ws",
        checkout_session_id: session.sessionId,
        total_amount: topUpPriceMinor("INR"),
        metadata: { workspace_id: "00000000-0000-4000-8000-000000000999" },
      }),
    );
    await deliver("payment.succeeded", paymentData({ payment_id: "pay_stranger", total_amount: topUpPriceMinor("INR") }));
    expect(await db().select().from(aiTopups)).toEqual([]);
    // The payments are on record (for support), just not granted.
    expect(await db().select().from(billingPayments).where(eq(billingPayments.workspaceId, W))).toHaveLength(2);
  });

  it("C4: a top-up is granted once per payment, even delivered twice under different ids", async () => {
    const W = await ownWorkspace();
    const session = await topUpCheckout(W);
    const p = paymentData({ payment_id: "pay_dup", checkout_session_id: session.sessionId, total_amount: topUpPriceMinor("INR") });
    await deliver("payment.succeeded", p);
    await deliver("payment.succeeded", p);
    expect(await db().select().from(aiTopups)).toHaveLength(1);
  });

  it("C4: used only after the monthly allowance, oldest-expiring first — and a refunded call gives it back", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    const limit = PLAN_LIMITS.plus.aiActionsPerMonth;
    await db()
      .insert(aiUsageLog)
      .values({ userId: uid("own"), workspaceId: W, kind: "transaction_parse", units: limit - 1, ownerId: uid("own"), plan: "plus" });
    const soon = new Date(Date.now() + 30 * DAY);
    const later = new Date(Date.now() + 300 * DAY);
    await db().insert(aiTopups).values([
      { workspaceId: W, paymentId: "pay_later", buyerUserId: uid("own"), actions: 500, remaining: 500, expiresAt: later },
      { workspaceId: W, paymentId: "pay_soon", buyerUserId: uid("own"), actions: 500, remaining: 2, expiresAt: soon },
    ]);
    const left = async () =>
      Object.fromEntries(
        (await db().select().from(aiTopups).orderBy(asc(aiTopups.expiresAt))).map((t) => [t.paymentId, t.remaining]),
      );

    const c1 = await chargeAiParse(uid("own"), W);
    expect(c1).toMatchObject({ remaining: 0, topupUnits: 0, topUpRemaining: 502 });
    const c2 = await chargeAiParse(uid("own"), W);
    expect(c2).toMatchObject({ remaining: 0, topupUnits: 1, topUpRemaining: 501 });
    expect(await left()).toEqual({ pay_soon: 1, pay_later: 500 });
    await chargeAiParse(uid("own"), W);
    await chargeAiParse(uid("own"), W);
    expect(await left()).toEqual({ pay_soon: 0, pay_later: 499 });

    // A call that fails on our side gives its top-up action back.
    const c5 = await chargeAiParse(uid("own"), W);
    expect(await left()).toEqual({ pay_soon: 0, pay_later: 498 });
    await expect(withAiCharge(c5, async () => Promise.reject(new Error("provider down")))).rejects.toThrow();
    expect(await left()).toEqual({ pay_soon: 0, pay_later: 499 });
    const [row] = await db().select().from(aiUsageLog).where(eq(aiUsageLog.id, c5.id));
    expect(row).toMatchObject({ units: 0, topupUnits: 0 });

    // The monthly count never includes what a top-up paid for.
    expect((await getAiAllowance(W)).used).toBe(limit);
  });

  it("C4: with the allowance and the top-ups spent, AI stops with the usual plan_limit", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    await db()
      .insert(aiUsageLog)
      .values({ userId: uid("own"), workspaceId: W, kind: "transaction_parse", units: PLAN_LIMITS.plus.aiActionsPerMonth, ownerId: uid("own"), plan: "plus" });
    await db().insert(aiTopups).values({
      workspaceId: W,
      paymentId: "pay_old",
      buyerUserId: uid("own"),
      actions: 500,
      remaining: 300,
      expiresAt: new Date(Date.now() - DAY),
    });
    expect(await codeOf(chargeAiParse(uid("own"), W))).toBe("plan_limit");
  });

  it("C4: a refunded or disputed top-up loses what's left of it", async () => {
    const W = await ownWorkspace();
    const session = await topUpCheckout(W);
    await deliver("payment.succeeded", paymentData({ payment_id: "pay_ref", checkout_session_id: session.sessionId, total_amount: topUpPriceMinor("INR") }));
    await deliver("refund.succeeded", { refund_id: "ref_1", payment_id: "pay_ref", status: "succeeded", amount: topUpPriceMinor("INR"), is_partial: false });
    const [top] = await db().select().from(aiTopups).where(eq(aiTopups.paymentId, "pay_ref"));
    expect(top).toMatchObject({ remaining: 0 });
    expect(top!.revokedAt).not.toBeNull();
    const [pay] = await db().select().from(billingPayments).where(eq(billingPayments.paymentId, "pay_ref"));
    expect(pay!.refundedMinor).toBe(topUpPriceMinor("INR"));
  });
});

describe("refunds on a plan payment", () => {
  it("are recorded but don't end the plan — the subscription's own cancellation does that", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    await deliver("payment.succeeded", paymentData({ payment_id: "pay_plan", subscription_id: sub, total_amount: 129900 }));
    await deliver("refund.succeeded", { refund_id: "ref_p", payment_id: "pay_plan", status: "succeeded", amount: 50000, is_partial: true });
    expect((await workspaceRow(W)).plan).toBe("plus");
    const [pay] = await db().select().from(billingPayments).where(eq(billingPayments.paymentId, "pay_plan"));
    expect(pay!.refundedMinor).toBe(50000);
  });
});

describe("the billing page", () => {
  it("lists the admin's workspaces with plan, status, top-ups and invoices", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    await deliver("payment.succeeded", paymentData({ payment_id: "pay_inv", subscription_id: sub, total_amount: 129900 }));
    const overview = await billing.getBillingOverview(uid("own"));
    expect(overview.purchasesBlocked).toBe(false);
    const w = overview.workspaces.find((x) => x.id === W)!;
    expect(w).toMatchObject({
      plan: "plus",
      hasBillingAccount: true,
      subscription: { plan: "plus", period: "yearly", status: "active", inTrial: true, cancelAtPeriodEnd: false },
    });
    // The $0 trial mandate isn't an invoice.
    expect(w.invoices.map((i) => i.paymentId)).toEqual(["pay_inv"]);
    const rows = await db()
      .select()
      .from(workspaceSubscriptions)
      .where(and(eq(workspaceSubscriptions.workspaceId, W)));
    expect(rows).toHaveLength(1);
  });
});
