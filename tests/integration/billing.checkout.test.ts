import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  billingCheckoutSessions,
  users,
  workspaceSubscriptions,
  workspaces,
} from "@/db/schema";
import * as dodo from "@/lib/dodo";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { TRIAL_DAYS, priceMinor, topUpPriceMinor } from "@/lib/pricing";
import { createWorkspaceWithDefaults } from "@/lib/workspaces";
import * as billing from "@/services/billing";
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
      feature_flags: { allow_currency_selection: false, allow_customer_editing_country: false, allow_discount_code: false },
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
  it("cancels every live plan with the provider before erasing, and removes the billing rows", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    const sub = await liveSubscription(W);
    await billing.startCheckout(uid("own"), W, { item: "topup" }, { country: "US" });
    await deleteAccount(uid("own"), "DELETE");
    expect(dodo.updateSubscription).toHaveBeenCalledWith(expect.anything(), sub, {
      status: "cancelled",
      cancel_reason: "cancelled_by_customer",
    });
    expect(await getTestDb().select().from(workspaceSubscriptions)).toEqual([]);
    expect(await getTestDb().select().from(billingCheckoutSessions)).toEqual([]);
  });
});
