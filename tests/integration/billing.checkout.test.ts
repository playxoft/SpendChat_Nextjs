import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  billingCheckoutSessions,
  billingPayments,
  billingRequestLog,
  billingTrialLedger,
  users,
  workspaceSubscriptions,
  workspaces,
} from "@/db/schema";
import { settleDeferred } from "@/lib/defer";
import * as dodo from "@/lib/dodo";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { TRIAL_DAYS, priceMinor, topUpPriceMinor } from "@/lib/pricing";
import { createWorkspaceWithDefaults } from "@/lib/workspaces";
import * as billing from "@/services/billing";
import { trialLedgerKey } from "@/services/billing";
import { deleteAccount } from "@/services/settings";
import * as ws from "@/services/workspaces";
import { configureBilling, latestSession, PRODUCTS, unconfigureBilling, workspaceRow } from "./helpers/billing";
import { bootstrapUser, registerUser, setWorkspacePlan, workspaceIdOf } from "./helpers/seed";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";

vi.mock("@/lib/dodo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dodo")>();
  let n = 0;
  return {
    ...actual,
    createCheckoutSession: vi.fn(async () => {
      n += 1;
      return { sessionId: `cks_test_${n}`, checkoutUrl: `https://test.checkout.dodopayments.com/session/cks_test_${n}` };
    }),
    changePlan: vi.fn(async () => {}),
    cancelScheduledPlanChange: vi.fn(async () => {}),
    updateSubscription: vi.fn(async () => {}),
    createPortalSession: vi.fn(async () => "https://test.customer.dodopayments.com/portal/x"),
    getSubscription: vi.fn(),
  };
});

/**
 * Checkout and plan management against the payment provider (mocked at
 * `lib/dodo.ts`): what a checkout sends and records, who may buy, the trial
 * (B1), purchases blocked by disputes (B2), plan changes (C3), and the
 * second-workspace flow. Nothing here changes a workspace's plan — only the
 * webhook does (`billing.webhook.test.ts`).
 */

const plan = (p: "plus" | "pro", period: "monthly" | "quarterly" | "yearly" = "yearly", currency?: string) => ({
  item: "plan" as const,
  plan: p,
  period,
  ...(currency ? { currency } : {}),
});

async function ownWorkspace(alias = "own"): Promise<string> {
  signInAs(alias);
  await bootstrapUser(alias);
  return workspaceIdOf(alias);
}

/** A live subscription row, as the webhook would have written it. */
async function liveSubscription(
  workspaceId: string,
  over: Partial<typeof workspaceSubscriptions.$inferInsert> = {},
): Promise<string> {
  const subscriptionId = over.subscriptionId ?? `sub_${workspaceId.slice(-6)}`;
  await getTestDb()
    .insert(workspaceSubscriptions)
    .values({
      workspaceId,
      buyerUserId: uid("own"),
      customerId: "cus_own",
      subscriptionId,
      productId: PRODUCTS.plus_yearly,
      plan: "plus",
      period: "yearly",
      currency: "INR",
      status: "active",
      activatedAt: new Date(),
      nextBillingDate: new Date(Date.now() + 30 * 86_400_000),
      ...over,
    });
  return subscriptionId;
}

beforeEach(() => configureBilling());
afterAll(() => unconfigureBilling());

describe("startCheckout — what it sends the provider and records", () => {
  it("pins India and rupees, offers UPI, passes the trial and our ids, and records the session", async () => {
    const W = await ownWorkspace();
    const res = await billing.startCheckout(uid("own"), W, plan("pro", "monthly", "INR"), { country: "IN" });
    expect(res.url).toMatch(/^https:\/\/test\.checkout\.dodopayments\.com\/session\/cks_test_/);

    const body = vi.mocked(dodo.createCheckoutSession).mock.calls.at(-1)![1];
    expect(body).toMatchObject({
      product_cart: [{ product_id: PRODUCTS.pro_monthly, quantity: 1 }],
      customer: { email: "own@example.com", name: "own" },
      billing_address: { country: "IN" },
      billing_currency: "INR",
      allowed_payment_method_types: ["upi_intent", "credit", "debit"],
      feature_flags: {
        allow_currency_selection: false,
        allow_customer_editing_country: false,
        // B5: the student code can be typed on a plan…
        allow_discount_code: true,
        // …and each checkout is its own provider customer, so one payment
        // portal never shows another workspace's billing.
        always_create_new_customer: true,
      },
      metadata: { workspace_id: W, buyer_user_id: uid("own"), item: "plan", sku: "pro_monthly" },
      subscription_data: { trial_period_days: TRIAL_DAYS },
    });
    expect(body.return_url).toContain(`/app/upgrade/return?workspace=${W}`);

    const session = await latestSession(W);
    expect(session).toMatchObject({
      item: "plan",
      plan: "pro",
      period: "monthly",
      productId: PRODUCTS.pro_monthly,
      expectedAmountMinor: priceMinor("pro", "monthly", "INR"),
      currency: "INR",
      trialDays: TRIAL_DAYS,
      buyerUserId: uid("own"),
      completedAt: null,
    });
    // Nothing changes until the provider confirms it.
    expect((await workspaceRow(W)).plan).toBe("free");
  });

  it("charges dollars and offers cards only outside the rupee countries", async () => {
    const W = await ownWorkspace();
    await billing.startCheckout(uid("own"), W, plan("plus"), { country: "US" });
    const body = vi.mocked(dodo.createCheckoutSession).mock.calls.at(-1)![1];
    expect(body).toMatchObject({
      billing_address: { country: "US" },
      billing_currency: "USD",
      allowed_payment_method_types: ["credit", "debit"],
    });
  });

  it("opens a top-up as a one-time purchase with no trial, priced from pricing.ts", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    await billing.startCheckout(uid("own"), W, { item: "topup", currency: "GBP" }, { country: "GB" });
    const body = vi.mocked(dodo.createCheckoutSession).mock.calls.at(-1)![1];
    expect(body.product_cart).toEqual([{ product_id: PRODUCTS.topup, quantity: 1 }]);
    expect(body.subscription_data).toBeUndefined();
    // B5: no discount code on a top-up — a discounted one would fail A3 and grant nothing.
    expect(body.feature_flags.allow_discount_code).toBe(false);
    expect(await latestSession(W)).toMatchObject({
      item: "topup",
      expectedAmountMinor: topUpPriceMinor("GBP"),
      currency: "GBP",
      trialDays: 0,
    });
  });

  it("refuses a second subscription for a workspace that has a plan running — it changes plan instead", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    await liveSubscription(W);
    await expect(billing.startCheckout(uid("own"), W, plan("pro"), { country: "IN" })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("already has a plan"),
    });
    // A top-up is still fine.
    await expect(billing.startCheckout(uid("own"), W, { item: "topup" }, { country: "IN" })).resolves.toBeTruthy();
  });

  it("answers 503 billing_unavailable on a server without payment keys, after checking who and what", async () => {
    unconfigureBilling();
    const W = await ownWorkspace();
    await expect(billing.startCheckout(uid("own"), W, plan("plus"))).rejects.toMatchObject({
      status: 503,
      code: "billing_unavailable",
      message: "Payments aren't available on this server yet.",
    });
    expect(dodo.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("caps how many checkouts one person opens in an hour", async () => {
    const W = await ownWorkspace();
    await getTestDb()
      .insert(billingCheckoutSessions)
      .values(
        Array.from({ length: billing.CHECKOUT_SESSIONS_PER_HOUR }, (_, i) => ({
          sessionId: `cks_old_${i}`,
          workspaceId: W,
          buyerUserId: uid("own"),
          item: "plan" as const,
          productId: PRODUCTS.plus_yearly,
          expectedAmountMinor: 1,
          currency: "USD",
        })),
      );
    await expect(billing.startCheckout(uid("own"), W, plan("plus"))).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
  });
});

describe("trials (B1)", () => {
  async function trialOf(W: string): Promise<number> {
    const order = await billing.buildCheckoutOrder(uid("own"), W, plan("plus"), { country: "US" });
    return order.line.kind === "plan" ? order.line.trialDays : -1;
  }

  it("B1: one trial per workspace — a workspace that has had a plan buys without one", async () => {
    const W = await ownWorkspace();
    expect(await trialOf(W)).toBe(TRIAL_DAYS);
    await liveSubscription(W, { status: "cancelled", trialDays: 21, endedAt: new Date() });
    expect(await trialOf(W)).toBe(0);
  });

  it("B1: at most 2 trials per person per 12 months, counted by who starts the checkout", async () => {
    const W = await ownWorkspace();
    const others = await Promise.all(
      ["Two", "Three"].map((name) => createWorkspaceWithDefaults(uid("own"), name, {})),
    );
    await liveSubscription(others[0]!.id, { subscriptionId: "sub_t1", trialDays: 21, status: "cancelled" });
    expect(await trialOf(W)).toBe(TRIAL_DAYS);
    await liveSubscription(others[1]!.id, { subscriptionId: "sub_t2", trialDays: 21 });
    expect(await trialOf(W)).toBe(0);
    // A trial over a year old no longer counts.
    await getTestDb()
      .update(workspaceSubscriptions)
      .set({ activatedAt: new Date(Date.now() - 400 * 86_400_000) })
      .where(eq(workspaceSubscriptions.subscriptionId, "sub_t2"));
    expect(await trialOf(W)).toBe(TRIAL_DAYS);
  });

  it("B1: trial checkouts still open count too, so opening several at once doesn't get round it", async () => {
    const W = await ownWorkspace();
    const others = await Promise.all(
      ["Two", "Three"].map((name) => createWorkspaceWithDefaults(uid("own"), name, {})),
    );
    for (const o of others) await billing.startCheckout(uid("own"), o.id, plan("plus"), { country: "US" });
    expect(await trialOf(W)).toBe(0);
    // Its own open checkout doesn't count against a workspace's retry (one other does).
    expect(await trialOf(others[0]!.id)).toBe(TRIAL_DAYS);
  });

  it("B1: another person's trials don't count against this buyer", async () => {
    const W = await ownWorkspace();
    await bootstrapUser("other");
    const O = await workspaceIdOf("other");
    await liveSubscription(O, { subscriptionId: "sub_o1", buyerUserId: uid("other"), trialDays: 21 });
    expect(await trialOf(W)).toBe(TRIAL_DAYS);
  });
});

describe("trials that can't be gamed (B1)", () => {
  it("B1: two checkouts at once can't both take the last trial — the decision is made under the buyer's lock", async () => {
    await ownWorkspace();
    const [w2, w3, w4] = await Promise.all(
      ["Two", "Three", "Four"].map((name) => createWorkspaceWithDefaults(uid("own"), name, {})),
    );
    // One trial already used elsewhere this year: one left.
    await getTestDb().insert(billingTrialLedger).values({
      emailKey: await trialLedgerKey("own@example.com"),
      workspaceId: w4!.id,
      subscriptionId: "sub_earlier",
    });
    await Promise.all(
      [w2!, w3!].map((w) => billing.startCheckout(uid("own"), w.id, plan("plus"), { country: "US" })),
    );
    const sessions = await getTestDb().select().from(billingCheckoutSessions);
    expect(sessions.map((s) => s.trialDays).sort((a, b) => a - b)).toEqual([0, TRIAL_DAYS]);
    const trials = vi
      .mocked(dodo.createCheckoutSession)
      .mock.calls.map((c) => c[1].subscription_data?.trial_period_days)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(trials).toEqual([0, TRIAL_DAYS]);
  });

  it("B1: two accounts with one inbox share the count — open trial checkouts are counted by hashed email", async () => {
    await ownWorkspace();
    const [w2, w3] = await Promise.all(["Two", "Three"].map((n) => createWorkspaceWithDefaults(uid("own"), n, {})));
    for (const w of [w2!, w3!]) await billing.startCheckout(uid("own"), w.id, plan("plus"), { country: "US" });
    // The same person, signed up again as zoe+alias: another account, the same inbox.
    signInAs("alias");
    await getTestDb().insert(users).values({ id: uid("alias"), firebaseUid: "fb-alias", email: "own+alias@example.com", name: "alias" });
    await bootstrapUser("alias");
    const A = await workspaceIdOf("alias");
    const order = await billing.buildCheckoutOrder(uid("alias"), A, plan("plus"), { country: "US" });
    expect(order.line.kind === "plan" && order.line.trialDays).toBe(0);
  });

  it("B1: the trial count survives deleting the account — the ledger is kept by hashed email", async () => {
    const W = await ownWorkspace();
    const others = await Promise.all(["Two", "Three"].map((n) => createWorkspaceWithDefaults(uid("own"), n, {})));
    const key = await trialLedgerKey("own@example.com");
    for (const [i, o] of others.entries()) {
      await getTestDb().insert(billingTrialLedger).values({ emailKey: key, workspaceId: o.id, subscriptionId: `sub_l${i}` });
    }
    await deleteAccount(uid("own"), "DELETE");
    expect(await getTestDb().select().from(billingTrialLedger)).toHaveLength(2);
    // The same person signs up again: a new account, the same inbox.
    signInAs("own2");
    await getTestDb().insert(users).values({ id: uid("own2"), firebaseUid: "fb-own2", email: "Own+again@Example.com", name: "own2" });
    await bootstrapUser("own2");
    const fresh = await workspaceIdOf("own2");
    const order = await billing.buildCheckoutOrder(uid("own2"), fresh, plan("plus"), { country: "US" });
    expect(order.line.kind === "plan" && order.line.trialDays).toBe(0);
    void W;
  });
});

describe("who manages a plan", () => {
  /** "own" owns W; "adm", an admin, bought its plan. */
  async function boughtByAnotherAdmin() {
    const W = await ownWorkspace();
    await registerUser("adm");
    await ws.addMember(uid("own"), W, { email: "adm@example.com", access: { mode: "all", role: "admin" } });
    await setWorkspacePlan(W, "plus");
    const sub = await liveSubscription(W, { buyerUserId: uid("adm"), customerId: "cus_adm" });
    await getTestDb().insert(billingPayments).values({
      paymentId: "pay_adm",
      workspaceId: W,
      buyerUserId: uid("adm"),
      kind: "plan",
      subscriptionId: sub,
      status: "succeeded",
      totalAmountMinor: 129900,
      currency: "INR",
      invoiceUrl: "https://invoices/adm.pdf",
      paidAt: new Date(),
    });
    return { W, sub };
  }

  it("only the buyer opens the payment page; another admin is told who manages it", async () => {
    const { W } = await boughtByAnotherAdmin();
    await expect(billing.billingPortalUrl(uid("own"), W)).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("managed by adm"),
    });
    expect(dodo.createPortalSession).not.toHaveBeenCalled();
    await billing.billingPortalUrl(uid("adm"), W);
    expect(dodo.createPortalSession).toHaveBeenCalledWith(expect.anything(), "cus_adm", expect.any(String));
  });

  it("shows invoice PDFs (the buyer's name and address) to the buyer only — others see amounts and dates", async () => {
    const { W } = await boughtByAnotherAdmin();
    const forOwner = (await billing.getBillingOverview(uid("own"))).workspaces.find((w) => w.id === W)!;
    expect(forOwner.invoices[0]).toMatchObject({ totalAmountMinor: 129900, invoiceUrl: null });
    expect(forOwner.subscription!.buyer).toEqual({ isMe: false, name: "adm", inWorkspace: true });
    const forBuyer = (await billing.getBillingOverview(uid("adm"))).workspaces.find((w) => w.id === W)!;
    expect(forBuyer.invoices[0]!.invoiceUrl).toBe("https://invoices/adm.pdf");
    expect(forBuyer.subscription!.buyer.isMe).toBe(true);
  });

  it("only the buyer can move the plan up (it charges their card); any admin can move it down or cancel", async () => {
    const { W, sub } = await boughtByAnotherAdmin();
    await expect(billing.changePlan(uid("own"), W, { plan: "pro", period: "yearly" })).rejects.toMatchObject({
      status: 403,
    });
    await expect(billing.changePlan(uid("own"), W, { plan: "plus", period: "monthly" })).resolves.toMatchObject({
      kind: "downgrade",
    });
    await billing.cancelPlan(uid("own"), W);
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, { cancel_at_next_billing_date: true });
    // Keeping it again charges at renewal: the buyer only.
    await expect(billing.resumePlan(uid("own"), W)).rejects.toMatchObject({ status: 403 });
  });

  it("a non-buyer's \"downgrade\" can't raise what the buyer's card is charged at renewal", async () => {
    const { W } = await boughtByAnotherAdmin();
    // Make the plan Pro monthly (₹299 a month).
    await getTestDb()
      .update(workspaceSubscriptions)
      .set({ plan: "pro", period: "monthly", productId: PRODUCTS.pro_monthly });
    // Plus yearly is a smaller plan but renews at ₹1,299 — refused for a non-buyer.
    await expect(billing.changePlan(uid("own"), W, { plan: "plus", period: "yearly" })).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("managed by adm"),
    });
    expect(dodo.changePlan).not.toHaveBeenCalled();
    // Plus monthly renews for less: any admin may.
    await expect(billing.changePlan(uid("own"), W, { plan: "plus", period: "monthly" })).resolves.toMatchObject({
      kind: "downgrade",
    });
    // …and the buyer may choose the dearer one.
    await getTestDb().update(workspaceSubscriptions).set({ scheduledPlan: null, scheduledPeriod: null });
    await expect(billing.changePlan(uid("adm"), W, { plan: "plus", period: "yearly" })).resolves.toMatchObject({
      kind: "downgrade",
    });
  });

  it("a non-buyer can't replace a waiting change with one that renews at a higher price", async () => {
    const { W } = await boughtByAnotherAdmin();
    // Pro yearly (₹1,999), with Plus monthly (₹199) already waiting for the renewal.
    await getTestDb()
      .update(workspaceSubscriptions)
      .set({ plan: "pro", period: "yearly", productId: PRODUCTS.pro_yearly, scheduledPlan: "plus", scheduledPeriod: "monthly" });
    await expect(billing.changePlan(uid("own"), W, { plan: "plus", period: "yearly" })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("refuses any plan change while a cancellation is owed", async () => {
    const { W } = await boughtByAnotherAdmin();
    await getTestDb().update(workspaceSubscriptions).set({ cancelWanted: "period_end" });
    await expect(billing.changePlan(uid("adm"), W, { plan: "plus", period: "monthly" })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("being cancelled"),
    });
  });

  it("a buyer removed from the workspace keeps paying — it's shown on their Billing page, and they can cancel", async () => {
    const { W, sub } = await boughtByAnotherAdmin();
    await ws.removeMember(uid("own"), W, uid("adm"));
    const overview = await billing.getBillingOverview(uid("adm"));
    expect(overview.paidElsewhere).toMatchObject([{ workspaceId: W, subscription: { plan: "plus" } }]);
    const forOwner = (await billing.getBillingOverview(uid("own"))).workspaces.find((w) => w.id === W)!;
    expect(forOwner.subscription!.buyer).toMatchObject({ name: "adm", inWorkspace: false });
    await billing.cancelPlan(uid("adm"), W);
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, { cancel_at_next_billing_date: true });
  });
});

describe("plans that aren't running", () => {
  it("cancelling an on-hold plan ends it now — at period end would never come", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    const sub = await liveSubscription(W, { status: "on_hold" });
    const res = await billing.cancelPlan(uid("own"), W);
    expect(res).toEqual({ endsAt: null, immediate: true });
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, {
      status: "cancelled",
      cancel_reason: "cancelled_by_merchant",
    });
  });

  it("a paused plan can be cancelled, and blocks a new checkout with words that say so", async () => {
    const W = await ownWorkspace();
    const sub = await liveSubscription(W, { status: "paused" });
    await expect(billing.startCheckout(uid("own"), W, plan("plus"), { country: "US" })).rejects.toMatchObject({
      message: expect.stringContaining("paused"),
    });
    await billing.cancelPlan(uid("own"), W);
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, expect.objectContaining({ status: "cancelled" }));
  });

  it("a pending subscription nobody finished in a day gives its place to a new checkout, and is cancelled", async () => {
    const W = await ownWorkspace();
    const sub = await liveSubscription(W, { status: "pending", createdAt: new Date(Date.now() - 30 * 3_600_000) });
    await billing.startCheckout(uid("own"), W, plan("plus"), { country: "US" });
    const [row] = await getTestDb().select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.subscriptionId, sub));
    expect(row).toMatchObject({ voidReason: "stale_pending", cancelWanted: "now" });
    expect(row!.supersededAt).not.toBeNull();
    await settleDeferred();
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, expect.objectContaining({ status: "cancelled" }));
  });

  it("a fresh pending subscription still holds the place", async () => {
    const W = await ownWorkspace();
    await liveSubscription(W, { status: "pending" });
    await expect(billing.startCheckout(uid("own"), W, plan("plus"), { country: "US" })).rejects.toMatchObject({
      message: expect.stringContaining("still being confirmed"),
    });
  });
});

describe("provider calls are capped per person", () => {
  it("refuses a billing action past the hourly cap", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    await liveSubscription(W);
    await getTestDb()
      .insert(billingRequestLog)
      .values(Array.from({ length: billing.BILLING_CALLS_PER_HOUR }, () => ({ userId: uid("own"), action: "openBillingPortal" })));
    await expect(billing.billingPortalUrl(uid("own"), W)).rejects.toMatchObject({ status: 429, code: "rate_limited" });
    await expect(billing.cancelPlan(uid("own"), W)).rejects.toMatchObject({ status: 429 });
    expect(dodo.createPortalSession).not.toHaveBeenCalled();
    expect(dodo.updateSubscription).not.toHaveBeenCalled();
  });
});

describe("return URLs", () => {
  it("send the buyer back to APP_ORIGIN when the deployment sets one (beta returns to beta)", async () => {
    const W = await ownWorkspace();
    process.env.APP_ORIGIN = "https://beta.spendchat.app";
    try {
      await billing.startCheckout(uid("own"), W, plan("plus"), { country: "US" });
    } finally {
      delete process.env.APP_ORIGIN;
    }
    const body = vi.mocked(dodo.createCheckoutSession).mock.calls.at(-1)![1];
    expect(body.return_url).toBe(`https://beta.spendchat.app/app/upgrade/return?workspace=${W}`);
  });
});

describe("blocked purchases (B2)", () => {
  it("B2: a person blocked after a second dispute can't buy anything — contact support", async () => {
    const W = await ownWorkspace();
    await getTestDb().update(users).set({ purchasesBlockedAt: new Date() }).where(eq(users.id, uid("own")));
    await expect(billing.startCheckout(uid("own"), W, plan("plus"))).rejects.toMatchObject({
      status: 403,
      code: "purchases_blocked",
      message: expect.stringContaining("Contact support"),
    });
    await expect(
      ws.createWorkspaceForPurchase(uid("own"), { name: "More", plan: "plus", period: "yearly" }),
    ).rejects.toMatchObject({ code: "purchases_blocked" });
  });

  it("B2: a workspace held over a dispute can't buy a top-up or a plan", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    await getTestDb()
      .update(workspaces)
      .set({ billingHold: "dispute", billingHoldFrom: new Date() })
      .where(eq(workspaces.id, W));
    await expect(billing.startCheckout(uid("own"), W, { item: "topup" })).rejects.toMatchObject({
      status: 403,
      code: "purchases_blocked",
    });
  });
});

describe("plan changes on a paid workspace (C3)", () => {
  async function paid(over: Partial<typeof workspaceSubscriptions.$inferInsert> = {}) {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, (over.plan as "plus" | "pro") ?? "plus");
    const sub = await liveSubscription(W, over);
    return { W, sub };
  }

  it("an upgrade goes to the provider now, prorated — and the plan waits for the webhook", async () => {
    const { W, sub } = await paid();
    const res = await billing.changePlan(uid("own"), W, { plan: "pro", period: "yearly" });
    expect(res.kind).toBe("upgrade");
    expect(dodo.changePlan).toHaveBeenCalledWith(expect.anything(), sub, {
      product_id: PRODUCTS.pro_yearly,
      quantity: 1,
      proration_billing_mode: "prorated_immediately",
      effective_at: "immediately",
      on_payment_failure: "prevent_change",
    });
    expect((await workspaceRow(W)).plan).toBe("plus");
  });

  it("C3: a downgrade is scheduled for the next billing date and charges nothing now", async () => {
    const { W, sub } = await paid({ plan: "pro", productId: PRODUCTS.pro_yearly });
    const res = await billing.changePlan(uid("own"), W, { plan: "plus", period: "yearly" });
    expect(res.kind).toBe("downgrade");
    expect(dodo.changePlan).toHaveBeenCalledWith(expect.anything(), sub, {
      product_id: PRODUCTS.plus_yearly,
      quantity: 1,
      proration_billing_mode: "do_not_bill",
      effective_at: "next_billing_date",
    });
    const [row] = await getTestDb().select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.subscriptionId, sub));
    expect(row).toMatchObject({ plan: "pro", scheduledPlan: "plus", scheduledPeriod: "yearly" });
    expect((await workspaceRow(W)).plan).toBe("pro");

    // Picking the current plan again cancels the waiting downgrade.
    const undo = await billing.changePlan(uid("own"), W, { plan: "pro", period: "yearly" });
    expect(undo.kind).toBe("undone");
    expect(dodo.cancelScheduledPlanChange).toHaveBeenCalledWith(expect.anything(), sub);
  });

  it("a new choice replaces a downgrade already waiting", async () => {
    const { W } = await paid({ plan: "pro", productId: PRODUCTS.pro_yearly, scheduledPlan: "plus", scheduledPeriod: "yearly" });
    await billing.changePlan(uid("own"), W, { plan: "plus", period: "monthly" });
    expect(vi.mocked(dodo.changePlan).mock.calls.at(-1)![2]).toMatchObject({ cancel_scheduled_change_plan: true });
  });

  it("refuses the plan it's already on, a plan whose payment is failing, and non-admins", async () => {
    const { W } = await paid();
    await expect(billing.changePlan(uid("own"), W, { plan: "plus", period: "yearly" })).rejects.toMatchObject({
      status: 400,
    });
    await getTestDb().update(workspaceSubscriptions).set({ status: "past_due" });
    await expect(billing.changePlan(uid("own"), W, { plan: "pro", period: "yearly" })).rejects.toMatchObject({
      status: 409,
    });
    await registerUser("ed");
    await ws.addMember(uid("own"), W, { email: "ed@example.com", access: { mode: "all", role: "editor" } });
    await expect(billing.changePlan(uid("ed"), W, { plan: "pro", period: "yearly" })).rejects.toMatchObject({
      status: 403,
    });
    expect(dodo.changePlan).not.toHaveBeenCalled();
  });

  it("cancels at the end of the period, and can be kept again", async () => {
    const { W, sub } = await paid();
    await billing.cancelPlan(uid("own"), W);
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, { cancel_at_next_billing_date: true });
    await billing.resumePlan(uid("own"), W);
    expect(dodo.updateSubscription).toHaveBeenLastCalledWith(expect.anything(), sub, {
      cancel_at_next_billing_date: false,
    });
    // Cancelling doesn't touch the plan: it runs to the end of what was paid for.
    expect((await workspaceRow(W)).plan).toBe("plus");
  });

  it("opens the provider's portal for the workspace's billing customer", async () => {
    const { W } = await paid();
    const { url } = await billing.billingPortalUrl(uid("own"), W);
    expect(url).toContain("portal");
    expect(dodo.createPortalSession).toHaveBeenCalledWith(expect.anything(), "cus_own", expect.stringContaining("/app/settings/billing"));
  });
});

describe("a second workspace leads to checkout", () => {
  it("creates it view-only and returns its checkout — paying is what opens it up", async () => {
    await ownWorkspace();
    const res = await ws.createWorkspaceForPurchase(uid("own"), { name: "Side project", plan: "pro", period: "monthly" });
    expect(res.reused).toBe(false);
    expect(res.checkoutPath).toBe("/app/upgrade/checkout?plan=pro&period=monthly");
    const ent = await getWorkspaceEntitlements(res.workspace.id);
    expect(ent).toMatchObject({ plan: "free", readOnly: true, readOnlyReason: "extra_free" });
    // Bought from the new workspace: its checkout is a normal one, with its trial.
    const order = await billing.buildCheckoutOrder(uid("own"), res.workspace.id, plan("pro", "monthly"), { country: "US" });
    expect(order.workspace.id).toBe(res.workspace.id);
  });

  it("two at once make one waiting workspace, not two", async () => {
    await ownWorkspace();
    const both = await Promise.all(
      ["One", "Two"].map((name) => ws.createWorkspaceForPurchase(uid("own"), { name, plan: "plus", period: "yearly" })),
    );
    expect(new Set(both.map((b) => b.workspace.id)).size).toBe(1);
    const owned = await getTestDb().select().from(workspaces).where(eq(workspaces.ownerId, uid("own")));
    expect(owned).toHaveLength(2);
  });

  it("reuses a workspace still waiting for its plan instead of making another", async () => {
    await ownWorkspace();
    const first = await ws.createWorkspaceForPurchase(uid("own"), { name: "One", plan: "plus", period: "yearly" });
    const again = await ws.createWorkspaceForPurchase(uid("own"), { name: "Two", plan: "plus", period: "yearly" });
    expect(again).toMatchObject({ reused: true, workspace: { id: first.workspace.id } });
    const owned = await getTestDb().select().from(workspaces).where(eq(workspaces.ownerId, uid("own")));
    expect(owned).toHaveLength(2);
  });

  it("creates nothing on a server that can't take payments", async () => {
    await ownWorkspace();
    unconfigureBilling();
    await expect(
      ws.createWorkspaceForPurchase(uid("own"), { name: "Nope", plan: "plus", period: "yearly" }),
    ).rejects.toMatchObject({ code: "billing_unavailable" });
    const owned = await getTestDb().select().from(workspaces).where(eq(workspaces.ownerId, uid("own")));
    expect(owned).toHaveLength(1);
  });
});

describe("account deletion", () => {
  it("stops every plan the person pays for — reversibly, before erasing — and keeps the rows to place later events", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    const sub = await liveSubscription(W);
    await deleteAccount(uid("own"), "DELETE");
    // Cancel at period end: nothing more is charged, and it's undoable if the deletion had failed.
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, { cancel_at_next_billing_date: true });
    const [row] = await getTestDb().select().from(workspaceSubscriptions);
    expect(row).toMatchObject({ subscriptionId: sub, buyerUserId: null, cancelAtPeriodEnd: true, cancelWanted: "period_end" });
  });

  it("asks the provider again even when our row already says the plan is cancelling (it may be stale)", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    const sub = await liveSubscription(W, { cancelAtPeriodEnd: true });
    await deleteAccount(uid("own"), "DELETE");
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, { cancel_at_next_billing_date: true });
  });

  it("stops a plan the person pays for in someone else's workspace — which survives, keeps its plan to the end, and loses the payer's name", async () => {
    // "own" owns W; "payer" (an admin of W) bought its plan, then deletes their account.
    const W = await ownWorkspace();
    await registerUser("payer");
    await ws.addMember(uid("own"), W, { email: "payer@example.com", access: { mode: "all", role: "admin" } });
    await setWorkspacePlan(W, "pro");
    const sub = await liveSubscription(W, { buyerUserId: uid("payer"), plan: "pro", productId: PRODUCTS.pro_yearly });
    await getTestDb().insert(billingPayments).values({
      paymentId: "pay_by_payer",
      workspaceId: W,
      buyerUserId: uid("payer"),
      kind: "plan",
      subscriptionId: sub,
      status: "succeeded",
      totalAmountMinor: 199900,
      currency: "INR",
      invoiceUrl: "https://invoice/pdf",
      paidAt: new Date(),
    });
    signInAs("payer");
    await deleteAccount(uid("payer"), "DELETE");

    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, { cancel_at_next_billing_date: true });
    expect((await workspaceRow(W)).plan).toBe("pro");
    const [row] = await getTestDb().select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.subscriptionId, sub));
    expect(row).toMatchObject({ buyerUserId: null, cancelWanted: "period_end" });
    const [pay] = await getTestDb().select().from(billingPayments).where(eq(billingPayments.paymentId, "pay_by_payer"));
    expect(pay).toMatchObject({ buyerUserId: null, workspaceId: W });
  });

  it("a plan that isn't running is cancelled now — after the account is gone, never before", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    const sub = await liveSubscription(W, { status: "on_hold" });
    await deleteAccount(uid("own"), "DELETE");
    expect(dodo.updateSubscription).not.toHaveBeenCalled();
    await settleDeferred();
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, {
      status: "cancelled",
      cancel_reason: "cancelled_by_merchant",
    });
  });

  it("deletes nothing when the provider refuses — the person retries", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    await liveSubscription(W);
    vi.mocked(dodo.updateSubscription).mockRejectedValueOnce(
      new dodo.DodoError(502, "billing_provider_error", "Couldn't cancel the plan", null, null),
    );
    await expect(deleteAccount(uid("own"), "DELETE")).rejects.toMatchObject({ code: "billing_provider_error" });
    expect(await getTestDb().select().from(workspaces).where(eq(workspaces.id, W))).toHaveLength(1);
  });
});
