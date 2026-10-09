import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import {
  aiTopups,
  aiUsageLog,
  billingCheckoutSessions,
  billingPayments,
  billingTrialLedger,
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
import { deleteAccount } from "@/services/settings";
import * as ws from "@/services/workspaces";
import * as billing from "@/services/billing";
import { trialLedgerKey } from "@/services/billing";
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
import { bootstrapUser, firstProfileId, registerUser, setWorkspacePlan, workspaceIdOf } from "./helpers/seed";
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
    // Who a refund's or dispute's unseen payment belongs to; offline unless a test says.
    getPayment: vi.fn(async () => {
      throw new Error("offline");
    }),
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
    expect(await billing.checkoutReturnStatus(uid("own"), W)).toEqual({ state: "failed", reason: "payment" });
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

  it("asks for a retry — and records nothing — for a product that isn't in DODO_PRODUCTS, so a replay works once it's fixed", async () => {
    const W = await ownWorkspace();
    await billing.startCheckout(uid("own"), W, { item: "plan", plan: "plus", period: "yearly", currency: "INR" }, { country: "IN" });
    const session = await latestSession(W);
    await db().update(billingCheckoutSessions).set({ productId: "pdt_new_plus" }).where(eq(billingCheckoutSessions.id, session.id));
    const data = subscriptionData({ subscription_id: "sub_x", workspaceId: W, buyerUserId: uid("own"), product_id: "pdt_new_plus" });
    expect((await deliver("subscription.active", data, { id: "evt_unknown_product" })).status).toBe(503);
    expect((await workspaceRow(W)).plan).toBe("free");
    expect(await subscriptionRow("sub_x")).toBeUndefined();
    expect(await db().select().from(billingWebhookEvents)).toEqual([]);

    // The config is fixed (the product is ours after all) and the event replayed with its own id.
    process.env.DODO_PRODUCTS = JSON.stringify({ ...PRODUCTS, plus_yearly: "pdt_new_plus" });
    expect((await deliver("subscription.active", data, { id: "evt_unknown_product" })).status).toBe(200);
    expect((await workspaceRow(W)).plan).toBe("plus");
  });

  it("settles a paid workspace with no subscription behind it to Free when an event for it can't be placed", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "pro");
    const res = await deliver("subscription.renewed", subscriptionData({ subscription_id: "sub_lost", workspaceId: W, buyerUserId: uid("own") }));
    expect(res.status).toBe(503);
    expect((await workspaceRow(W)).plan).toBe("free");
  });

  it("leaves a workspace whose plan a live subscription backs alone, whatever an unplaceable event says", async () => {
    const W = await ownWorkspace();
    await activePlan(W);
    const res = await deliver("subscription.renewed", subscriptionData({ subscription_id: "sub_other", workspaceId: W, buyerUserId: uid("other") }));
    expect(res.status).toBe(503);
    expect((await workspaceRow(W)).plan).toBe("plus");
  });

  it("a second subscription for a workspace that has one is superseded and cancelled, never stacked", async () => {
    const W = await ownWorkspace();
    await activePlan(W, { sub: "sub_first" });
    // A second checkout tab was paid too.
    await db()
      .insert(billingCheckoutSessions)
      .values({ sessionId: "cks_tab2", workspaceId: W, buyerUserId: uid("own"), item: "plan", plan: "pro", period: "yearly", productId: PRODUCTS.pro_yearly, expectedAmountMinor: 1, currency: "INR" });
    const second = subscriptionData({ subscription_id: "sub_second", product_id: PRODUCTS.pro_yearly, trial_period_days: 0, workspaceId: W, buyerUserId: uid("own") });
    await deliver("subscription.active", second);
    expect((await workspaceRow(W)).plan).toBe("plus");
    expect(await subscriptionRow("sub_second")).toMatchObject({ voidReason: "duplicate", cancelWanted: "now" });
    await settleDeferred();
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), "sub_second", {
      status: "cancelled",
      cancel_reason: "cancelled_by_merchant",
    });

    // The cancel didn't stick (or failed): the next event for it, still live, asks again.
    vi.mocked(dodo.updateSubscription).mockClear();
    await deliver("subscription.updated", second);
    await settleDeferred();
    expect(dodo.updateSubscription).toHaveBeenCalledTimes(1);
    // Once it's cancelled, nothing more is asked.
    vi.mocked(dodo.updateSubscription).mockClear();
    await deliver("subscription.cancelled", { ...second, status: "cancelled" });
    await settleDeferred();
    expect(dodo.updateSubscription).not.toHaveBeenCalled();
    expect((await workspaceRow(W)).plan).toBe("plus");
  });
});

describe("trials (B1)", () => {
  it("B1: fails closed — a trial no checkout granted is refused, never entitles, and is cancelled", async () => {
    const W = await ownWorkspace();
    await billing.startCheckout(uid("own"), W, { item: "plan", plan: "plus", period: "yearly", currency: "INR" }, { country: "IN" });
    // This checkout granted no trial (the buyer had used theirs)…
    await db().update(billingCheckoutSessions).set({ trialDays: 0 });
    // …but the subscription came back with one.
    const res = await deliver(
      "subscription.active",
      subscriptionData({ subscription_id: "sub_trial", trial_period_days: 21, workspaceId: W, buyerUserId: uid("own") }),
    );
    expect(res.status).toBe(200);
    expect((await workspaceRow(W)).plan).toBe("free");
    expect(await subscriptionRow("sub_trial")).toMatchObject({ voidReason: "unearned_trial", cancelWanted: "now" });
    await settleDeferred();
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), "sub_trial", expect.objectContaining({ status: "cancelled" }));
    expect(await db().select().from(billingTrialLedger)).toEqual([]);
    expect(await billing.checkoutReturnStatus(uid("own"), W)).toMatchObject({ state: "failed" });
  });

  it("B1: every trial that starts goes in the ledger, keyed by the buyer's hashed email — no address stored", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    const ledger = await db().select().from(billingTrialLedger);
    expect(ledger).toMatchObject([{ workspaceId: W, subscriptionId: sub, emailKey: await trialLedgerKey("own@example.com") }]);
    expect(JSON.stringify(ledger)).not.toContain("own@example.com");
  });

  it("a paid charge inside the trial (an upgrade) ends it — nothing still says trial", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    expect((await subscriptionRow(sub))!.trialEndsAt!.getTime()).toBeGreaterThan(Date.now());
    await deliver("payment.succeeded", paymentData({ payment_id: "pay_up", subscription_id: sub, total_amount: 60000 }));
    expect((await subscriptionRow(sub))!.trialEndsAt!.getTime()).toBeLessThanOrEqual(Date.now());
    const w = (await billing.getBillingOverview(uid("own"))).workspaces.find((x) => x.id === W)!;
    expect(w.subscription!.inTrial).toBe(false);
  });
});

describe("checkouts paid after an account or workspace is gone", () => {
  it("a checkout paid after its buyer deleted their account is voided and cancelled — the plan isn't granted", async () => {
    // "own" owns W; "payer", an admin, opens a checkout, then deletes their account.
    const W = await ownWorkspace();
    await registerUser("payer");
    await ws.addMember(uid("own"), W, { email: "payer@example.com", access: { mode: "all", role: "admin" } });
    signInAs("payer");
    await billing.startCheckout(uid("payer"), W, { item: "plan", plan: "plus", period: "yearly", currency: "INR" }, { country: "IN" });
    const session = await latestSession(W);
    await deleteAccount(uid("payer"), "DELETE");

    // The link was still open and got paid.
    expect((await deliver("payment.succeeded", paymentData({ subscription_id: "sub_late", checkout_session_id: session.sessionId }))).status).toBe(200);
    const res = await deliver("subscription.active", subscriptionData({ subscription_id: "sub_late" }));
    expect(res.status).toBe(200);
    expect((await workspaceRow(W)).plan).toBe("free");
    expect(await subscriptionRow("sub_late")).toMatchObject({ voidReason: "buyer_gone", cancelWanted: "now", buyerUserId: null });
    await settleDeferred();
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), "sub_late", expect.objectContaining({ status: "cancelled" }));
  });

  it("a checkout paid after its workspace was deleted is placed (the session is kept), voided and cancelled", async () => {
    const W = await ownWorkspace();
    await billing.startCheckout(uid("own"), W, { item: "plan", plan: "plus", period: "yearly", currency: "INR" }, { country: "IN" });
    const session = await latestSession(W);
    await deleteAccount(uid("own"), "DELETE");
    expect((await deliver("payment.succeeded", paymentData({ subscription_id: "sub_gone", checkout_session_id: session.sessionId }))).status).toBe(200);
    expect((await deliver("subscription.active", subscriptionData({ subscription_id: "sub_gone" }))).status).toBe(200);
    expect(await subscriptionRow("sub_gone")).toMatchObject({ voidReason: "workspace_gone", cancelWanted: "now" });
    await settleDeferred();
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), "sub_gone", expect.objectContaining({ status: "cancelled" }));
  });

  it("a top-up paid after its workspace was deleted grants nothing — and doesn't fail forever", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    await billing.startCheckout(uid("own"), W, { item: "topup", currency: "INR" }, { country: "IN" });
    const session = await latestSession(W);
    await deleteAccount(uid("own"), "DELETE");
    const res = await deliver("payment.succeeded", paymentData({ checkout_session_id: session.sessionId, total_amount: topUpPriceMinor("INR") }));
    expect(res.status).toBe(200);
    expect(await db().select().from(aiTopups)).toEqual([]);
  });
});

describe("cancellations we owe the provider", () => {
  it("asks again on the next event when a plan an account deletion stopped is still renewing", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    await db()
      .update(workspaceSubscriptions)
      .set({ cancelWanted: "period_end", buyerUserId: null })
      .where(eq(workspaceSubscriptions.subscriptionId, sub));
    vi.mocked(dodo.updateSubscription).mockClear();
    // The provider still says it renews.
    await deliver("subscription.renewed", subscriptionData({ subscription_id: sub, cancel_at_next_billing_date: false }));
    await settleDeferred();
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, { cancel_at_next_billing_date: true });
    // Once the provider shows it set to cancel, nothing more is asked.
    vi.mocked(dodo.updateSubscription).mockClear();
    await deliver("subscription.updated", subscriptionData({ subscription_id: sub, cancel_at_next_billing_date: true }));
    await settleDeferred();
    expect(dodo.updateSubscription).not.toHaveBeenCalled();
  });
});

describe("more out-of-order and retry cases", () => {
  it("a payment event retries a cancellation still owed for its subscription", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    await db().update(workspaceSubscriptions).set({ cancelWanted: "now" }).where(eq(workspaceSubscriptions.subscriptionId, sub));
    vi.mocked(dodo.updateSubscription).mockClear();
    await deliver("payment.succeeded", paymentData({ subscription_id: sub, total_amount: 129900 }));
    await settleDeferred();
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, expect.objectContaining({ status: "cancelled" }));
  });

  it("an older payment event never rolls its status back", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    const now = Date.now();
    await deliver("payment.succeeded", paymentData({ payment_id: "pay_ord", subscription_id: sub, total_amount: 1 }), { at: new Date(now) });
    await deliver("payment.processing", paymentData({ payment_id: "pay_ord", status: "processing", subscription_id: sub, total_amount: 1 }), {
      at: new Date(now - 60_000),
    });
    const [pay] = await db().select().from(billingPayments).where(eq(billingPayments.paymentId, "pay_ord"));
    expect(pay!.status).toBe("succeeded");
  });

  it("B2: a late \"opened\" after the dispute was won doesn't hold the workspace again", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    await deliver("payment.succeeded", paymentData({ payment_id: "pay_dw", subscription_id: sub, total_amount: 129900 }));
    const now = Date.now();
    await deliver("dispute.won", { dispute_id: "dsp_w", payment_id: "pay_dw", dispute_status: "dispute_won" }, { at: new Date(now) });
    await deliver("dispute.opened", { dispute_id: "dsp_w", payment_id: "pay_dw", dispute_status: "dispute_opened" }, { at: new Date(now - 60_000) });
    expect((await workspaceRow(W)).billingHold).toBeNull();
  });

  it("a subscription we have that moves to an unknown product still applies its status, on the last plan", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    const res = await deliver("subscription.cancelled", subscriptionData({ subscription_id: sub, status: "cancelled", product_id: "pdt_mystery" }));
    expect(res.status).toBe(200);
    expect(await subscriptionRow(sub)).toMatchObject({ status: "cancelled", plan: "plus" });
    expect((await workspaceRow(W)).plan).toBe("free");
  });

  it("a duplicate's buyer is told they were charged twice — not that the payment failed", async () => {
    const W = await ownWorkspace();
    await activePlan(W, { sub: "sub_one" });
    // A second checkout tab, opened before the first was paid, gets paid too.
    await db()
      .insert(billingCheckoutSessions)
      .values({ sessionId: "cks_dup", workspaceId: W, buyerUserId: uid("own"), item: "plan", plan: "pro", period: "yearly", productId: PRODUCTS.pro_yearly, expectedAmountMinor: 1, currency: "INR" });
    await deliver("subscription.active", subscriptionData({ subscription_id: "sub_two", product_id: PRODUCTS.pro_yearly, trial_period_days: 0, workspaceId: W, buyerUserId: uid("own") }));
    expect(await billing.checkoutReturnStatus(uid("own"), W)).toEqual({ state: "duplicate" });
  });
});

describe("the return page sees failures", () => {
  it("a failed or cancelled first payment", async () => {
    const W = await ownWorkspace();
    await billing.startCheckout(uid("own"), W, { item: "plan", plan: "plus", period: "yearly", currency: "INR" }, { country: "IN" });
    const session = await latestSession(W);
    await deliver("payment.failed", paymentData({ status: "failed", checkout_session_id: session.sessionId, total_amount: 129900 }));
    expect(await billing.checkoutReturnStatus(uid("own"), W)).toEqual({ state: "failed", reason: "payment" });
  });

  it("A3: a top-up paid at the wrong amount is a failure, not an endless wait", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    await billing.startCheckout(uid("own"), W, { item: "topup", currency: "INR" }, { country: "IN" });
    const session = await latestSession(W);
    await deliver("payment.succeeded", paymentData({ payment_id: "pay_short2", checkout_session_id: session.sessionId, total_amount: 100, tax: 0 }));
    expect(await billing.checkoutReturnStatus(uid("own"), W)).toEqual({ state: "failed", reason: "amount" });
  });

  it("an upgrade whose charge failed keeps the old plan and says so", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    await billing.changePlan(uid("own"), W, { plan: "pro", period: "yearly" });
    expect(await billing.checkoutReturnStatus(uid("own"), W, { plan: "pro", period: "yearly" })).toEqual({
      state: "waiting",
      item: "plan",
    });
    await deliver("payment.failed", paymentData({ payment_id: "pay_upfail", status: "failed", subscription_id: sub, total_amount: 60000 }));
    expect(await billing.checkoutReturnStatus(uid("own"), W, { plan: "pro", period: "yearly" })).toEqual({
      state: "failed",
      reason: "change",
    });
    expect((await workspaceRow(W)).plan).toBe("plus");
  });
});

describe("robustness", () => {
  it("a malformed display-only field (the scheduled change's date) never fails a whole event", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W, { plan: "pro" });
    const res = await deliver(
      "subscription.updated",
      subscriptionData({
        subscription_id: sub,
        product_id: PRODUCTS.pro_yearly,
        next_billing_date: 12345,
        scheduled_change: { product_id: PRODUCTS.plus_yearly, effective_at: { nope: true } },
      }),
    );
    expect(res.status).toBe(200);
    expect(await subscriptionRow(sub)).toMatchObject({ scheduledPlan: "plus", scheduledAt: null, nextBillingDate: null });
  });

  it("logs refused deliveries at most once a minute — junk at the endpoint can't flood the logs", async () => {
    const { logger } = await import("@/lib/logger");
    const warn = vi.spyOn(logger, "warn");
    const { handleDodoWebhook } = await import("@/services/billing-webhook");
    for (let i = 0; i < 5; i++) {
      const res = await handleDodoWebhook("{}", new Headers({ "webhook-id": `x${i}`, "webhook-timestamp": "1", "webhook-signature": "v1,AAAA" }));
      expect(res.status).toBe(401);
    }
    expect(warn.mock.calls.filter((c) => (c[1] as { event?: string })?.event === "billing.webhook_bad_signature").length).toBeLessThanOrEqual(1);
    warn.mockRestore();
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

  it("B2: a lost dispute cancels the plan it paid for — no more charges — and the workspace stays held", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    await deliver("payment.succeeded", paymentData({ payment_id: "pay_lost", subscription_id: sub, total_amount: 129900 }));
    await deliver("dispute.opened", { dispute_id: "dsp_l", payment_id: "pay_lost", dispute_status: "dispute_opened" });
    vi.mocked(dodo.updateSubscription).mockClear();
    await deliver("dispute.lost", { dispute_id: "dsp_l", payment_id: "pay_lost", dispute_status: "dispute_lost" });
    expect((await subscriptionRow(sub))!.cancelWanted).toBe("now");
    await settleDeferred();
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, expect.objectContaining({ status: "cancelled" }));
    await deliver("subscription.cancelled", subscriptionData({ subscription_id: sub, status: "cancelled" }));
    expect(await workspaceRow(W)).toMatchObject({ plan: "free", billingHold: "dispute" });
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

describe("replays", () => {
  it("a refund replayed after its event was forgotten counts once — refunds are keyed by their id", async () => {
    const W = await ownWorkspace();
    const sub = await activePlan(W);
    await deliver("payment.succeeded", paymentData({ payment_id: "pay_r", subscription_id: sub, total_amount: 129900 }));
    const refund = { refund_id: "ref_once", payment_id: "pay_r", status: "succeeded", amount: 1000, is_partial: true };
    await deliver("refund.succeeded", refund, { id: "evt_refund" });
    // What `pnpm billing:reprocess` does, then the dashboard resends it.
    await db().delete(billingWebhookEvents).where(eq(billingWebhookEvents.id, "evt_refund"));
    await deliver("refund.succeeded", refund, { id: "evt_refund" });
    await deliver("refund.succeeded", { ...refund, refund_id: "ref_two", amount: 500 });
    const [pay] = await db().select().from(billingPayments).where(eq(billingPayments.paymentId, "pay_r"));
    expect(pay!.refundedMinor).toBe(1500);
  });

  it("a refund for a payment not recorded yet waits (retry) instead of being dropped", async () => {
    await ownWorkspace();
    const res = await deliver("refund.succeeded", { refund_id: "ref_x", payment_id: "pay_unseen", status: "succeeded", amount: 1 });
    expect(res.status).toBe(503);
    expect(await db().select().from(billingWebhookEvents)).toEqual([]);
  });
});

describe("another brand on the same provider account", () => {
  // The account sells for other brands too, and an endpoint receives every
  // brand's events of the types it subscribes to. Theirs are acknowledged (200,
  // so the provider doesn't retry them for a day) and nothing is written.
  const theirs = { user_id: "019cad8d-643d-7979-93f7-7094beda9c68", plan_slug: "pro", billing_period: "monthly" };

  it("drops another brand's subscription and payment events — even ones naming our workspace", async () => {
    const W = await ownWorkspace();
    const sub = await deliver(
      "subscription.active",
      subscriptionData({ subscription_id: "sub_theirs", product_id: "pdt_their_pro", metadata: { ...theirs, workspace_id: W } }),
    );
    const pay = await deliver(
      "payment.succeeded",
      paymentData({ payment_id: "pay_theirs", subscription_id: "sub_theirs", checkout_session_id: "cks_theirs", total_amount: 99900, metadata: theirs }),
    );
    expect([sub.status, pay.status]).toEqual([200, 200]);
    expect(await db().select().from(billingWebhookEvents)).toEqual([]);
    expect(await db().select().from(workspaceSubscriptions)).toEqual([]);
    expect(await db().select().from(billingPayments)).toEqual([]);
    expect(await workspaceRow(W)).toMatchObject({ plan: "free", billingHold: null });
  });

  it("keeps an unmarked event that our rows or products know — older checkouts carried no mark", async () => {
    const W = await ownWorkspace();
    const res = await deliver("subscription.active", subscriptionData({ subscription_id: "sub_bare", metadata: {} }));
    // One of our products, so ours: placed through our rows as always, and it can't be yet.
    expect(res.status).toBe(503);
    expect(await workspaceRow(W)).toMatchObject({ plan: "free" });
  });

  it("drops a refund or dispute once the provider says the payment is another brand's", async () => {
    await ownWorkspace();
    const theirPayment = { payment_id: "pay_t", checkout_session_id: "cks_theirs", subscription_id: null, metadata: theirs };
    vi.mocked(dodo.getPayment).mockResolvedValueOnce(theirPayment).mockResolvedValueOnce(theirPayment);
    const refund = await deliver("refund.succeeded", { refund_id: "ref_t", payment_id: "pay_t", status: "succeeded", amount: 100 });
    const dispute = await deliver("dispute.opened", { dispute_id: "dsp_t", payment_id: "pay_t", dispute_status: "dispute_opened" });
    expect([refund.status, dispute.status]).toEqual([200, 200]);
    expect(await db().select().from(billingWebhookEvents)).toEqual([]);

    // Ours (marked), just not recorded yet: wait for it, as before.
    vi.mocked(dodo.getPayment).mockResolvedValueOnce({ payment_id: "pay_o", metadata: { app: "spendchat" } });
    const ours = await deliver("refund.succeeded", { refund_id: "ref_o", payment_id: "pay_o", status: "succeeded", amount: 100 });
    expect(ours.status).toBe(503);
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
      // The renewal charge above ended the trial (8: a paid charge means no "trial" any more).
      subscription: {
        plan: "plus",
        period: "yearly",
        status: "active",
        inTrial: false,
        cancelAtPeriodEnd: false,
        buyer: { isMe: true },
        nextCharge: { amountMinor: 129900, beforeDiscounts: false },
      },
    });
    expect(w.invoices[0]!.invoiceUrl).toContain("invoices");
    // The $0 trial mandate isn't an invoice.
    expect(w.invoices.map((i) => i.paymentId)).toEqual(["pay_inv"]);
    const rows = await db()
      .select()
      .from(workspaceSubscriptions)
      .where(and(eq(workspaceSubscriptions.workspaceId, W)));
    expect(rows).toHaveLength(1);
  });
});
