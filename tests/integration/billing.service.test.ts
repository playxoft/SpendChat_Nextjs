import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { workspaces } from "@/db/schema";
import { startCheckout as startCheckoutAction } from "@/actions/billing";
import { checkoutQuote, topUpQuote } from "@/lib/checkout";
import { TRIAL_DAYS, priceMinor, topUpPriceMinor } from "@/lib/pricing";
import { buildCheckoutOrder, startCheckout } from "@/services/billing";
import * as ws from "@/services/workspaces";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, registerUser, setWorkspacePlan, workspaceIdOf } from "./helpers/seed";

/**
 * `startCheckout` — who may buy, what, and at what price. The provider call
 * itself is the phase-9 seam (`lib/payments.ts`), which on a server without
 * payment keys answers 503 `billing_unavailable`; everything before it is
 * checked here.
 */

const plan = (p: "plus" | "pro", period: "monthly" | "quarterly" | "yearly" = "yearly") => ({
  item: "plan" as const,
  plan: p,
  period,
});

/** Bootstrap `alias` and return their own workspace id. */
async function ownWorkspace(alias = "own"): Promise<string> {
  signInAs(alias);
  await bootstrapUser(alias);
  return workspaceIdOf(alias);
}

/** Add `alias` to `W` with `role` on every space. */
async function addMemberAs(W: string, alias: string, role: "viewer" | "editor" | "admin") {
  await registerUser(alias);
  await ws.addMember(uid("own"), W, { email: `${alias}@example.com`, access: { mode: "all", role } });
}

describe("startCheckout — who may buy", () => {
  it("lets the owner reach the payment provider, which isn't configured here (503)", async () => {
    const W = await ownWorkspace();
    await expect(startCheckout(uid("own"), W, plan("pro"))).rejects.toMatchObject({
      status: 503,
      code: "billing_unavailable",
    });
  });

  it("lets another admin buy too", async () => {
    const W = await ownWorkspace();
    await addMemberAs(W, "adm", "admin");
    const order = await buildCheckoutOrder(uid("adm"), W, plan("plus"));
    expect(order.workspace.id).toBe(W);
    expect(order.buyer.userId).toBe(uid("adm"));
  });

  it("refuses an editor or a viewer with 403", async () => {
    const W = await ownWorkspace();
    await addMemberAs(W, "ed", "editor");
    await addMemberAs(W, "vw", "viewer");
    for (const who of ["ed", "vw"]) {
      await expect(startCheckout(uid(who), W, plan("plus"))).rejects.toMatchObject({
        status: 403,
        code: "forbidden",
      });
    }
  });

  it("refuses someone outside the workspace with 404", async () => {
    const W = await ownWorkspace();
    await bootstrapUser("out");
    await expect(startCheckout(uid("out"), W, plan("plus"))).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a malformed workspace id or item before touching anything", async () => {
    const W = await ownWorkspace();
    await expect(startCheckout(uid("own"), "not-a-uuid", plan("plus"))).rejects.toMatchObject({
      status: 422,
    });
    await expect(startCheckout(uid("own"), W, { item: "plan", plan: "free", period: "yearly" })).rejects.toMatchObject({
      status: 422,
    });
    await expect(startCheckout(uid("own"), W, { item: "plan", plan: "pro", period: "weekly" })).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe("startCheckout — what can be bought", () => {
  it("refuses the plan the workspace already has", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    await expect(startCheckout(uid("own"), W, plan("plus"))).rejects.toMatchObject({
      status: 400,
      code: "bad_request",
      message: expect.stringContaining("already on Plus"),
    });
  });

  it("refuses a downgrade — that happens at renewal, not through checkout", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "pro");
    await expect(startCheckout(uid("own"), W, plan("plus"))).rejects.toMatchObject({
      status: 400,
      code: "bad_request",
    });
  });

  it("refuses a top-up on Free", async () => {
    const W = await ownWorkspace();
    await expect(startCheckout(uid("own"), W, { item: "topup" })).rejects.toMatchObject({
      status: 400,
      code: "bad_request",
      message: expect.stringContaining("Top-ups"),
    });
  });

  it("sells an upgrade from Plus to Pro without a second trial", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    const order = await buildCheckoutOrder(uid("own"), W, plan("pro", "monthly"));
    expect(order.line).toEqual({ kind: "plan", plan: "pro", period: "monthly", trialDays: 0 });
  });

  it("buys nothing on its own — the plan only changes once the provider confirms", async () => {
    const W = await ownWorkspace();
    await expect(startCheckout(uid("own"), W, plan("pro"))).rejects.toMatchObject({ status: 503 });
    const [row] = await getTestDb().select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, W));
    expect(row!.plan).toBe("free");
  });
});

describe("startCheckout — the price is the server's", () => {
  it("prices a plan from the price list in the workspace's currency, with the trial from Free", async () => {
    const W = await ownWorkspace();
    await getTestDb().update(workspaces).set({ currency: "INR" }).where(eq(workspaces.id, W));
    const order = await buildCheckoutOrder(uid("own"), W, plan("pro", "yearly"), { country: "IN" });
    expect(order.currency).toBe("INR");
    expect(order.amountMinor).toBe(priceMinor("pro", "yearly", "INR"));
    expect(order.amountMinor).toBe(checkoutQuote("pro", "yearly", "INR").amountMinor);
    expect(order.line).toEqual({ kind: "plan", plan: "pro", period: "yearly", trialDays: TRIAL_DAYS });
  });

  it("falls back to US dollars for a currency we don't sell in", async () => {
    const W = await ownWorkspace();
    await getTestDb().update(workspaces).set({ currency: "SGD" }).where(eq(workspaces.id, W));
    const order = await buildCheckoutOrder(uid("own"), W, plan("plus", "quarterly"));
    expect(order.currency).toBe("USD");
    expect(order.amountMinor).toBe(priceMinor("plus", "quarterly", "USD"));
  });

  it("uses the currency the buyer chose, still priced from the list", async () => {
    const W = await ownWorkspace();
    const order = await buildCheckoutOrder(uid("own"), W, { ...plan("plus", "monthly"), currency: "EUR" });
    expect(order.currency).toBe("EUR");
    expect(order.amountMinor).toBe(priceMinor("plus", "monthly", "EUR"));
  });

  it("only charges the rupee list to a request from a rupee country (security review: currency arbitrage)", async () => {
    const W = await ownWorkspace();
    const pro = { ...plan("pro", "yearly"), currency: "INR" as const };
    // From India: the rupee price.
    const fromIndia = await buildCheckoutOrder(uid("own"), W, pro, { country: "IN" });
    expect(fromIndia.currency).toBe("INR");
    expect(fromIndia.amountMinor).toBe(priceMinor("pro", "yearly", "INR"));
    // Asking for rupees from the US, or from nowhere known, is refused — the
    // page would have shown the regional price instead.
    await expect(buildCheckoutOrder(uid("own"), W, pro, { country: "US" })).rejects.toMatchObject({ status: 400 });
    await expect(buildCheckoutOrder(uid("own"), W, pro, { country: null })).rejects.toMatchObject({ status: 400 });
    // With no explicit currency, the regional price is used.
    const fromUs = await buildCheckoutOrder(uid("own"), W, plan("pro", "yearly"), { country: "US" });
    expect(fromUs.currency).toBe("USD");
    expect(fromUs.amountMinor).toBe(priceMinor("pro", "yearly", "USD"));
    // A workspace set to INR doesn't unlock it either.
    await getTestDb().update(workspaces).set({ currency: "INR" }).where(eq(workspaces.id, W));
    const viaWorkspace = await buildCheckoutOrder(uid("own"), W, plan("pro", "yearly"), { country: "GB" });
    expect(viaWorkspace.currency).toBe("GBP");
    // Top-ups follow the same rule.
    await setWorkspacePlan(W, "plus");
    await expect(
      buildCheckoutOrder(uid("own"), W, { item: "topup", currency: "INR" }, { country: "US" }),
    ).rejects.toMatchObject({ status: 400 });
    const topUp = await buildCheckoutOrder(uid("own"), W, { item: "topup" }, { country: "US" });
    expect(topUp.amountMinor).toBe(topUpPriceMinor("USD"));
  });

  it("asks for a reload instead of charging a currency the page didn't show (second review of #90)", async () => {
    const W = await ownWorkspace();
    // The page showed rupees (from India); by submit the request is from the US.
    await expect(
      buildCheckoutOrder(uid("own"), W, { ...plan("plus", "monthly"), currency: "INR" }, { country: "US" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("ignores a price the client tries to send", async () => {
    const W = await ownWorkspace();
    const order = await buildCheckoutOrder(uid("own"), W, { ...plan("pro", "yearly"), amountMinor: 1 });
    expect(order.amountMinor).toBe(priceMinor("pro", "yearly", "USD"));
  });

  it("prices a top-up on a paid plan", async () => {
    const W = await ownWorkspace();
    await setWorkspacePlan(W, "plus");
    const order = await buildCheckoutOrder(uid("own"), W, { item: "topup", currency: "INR" }, { country: "IN" });
    expect(order.amountMinor).toBe(topUpPriceMinor("INR"));
    expect(order.line).toEqual({
      kind: "topup",
      actions: topUpQuote("INR").actions,
      validityMonths: topUpQuote("INR").validityMonths,
    });
  });
});

describe("startCheckout action", () => {
  it("returns the provider's refusal as a failed result, not a throw", async () => {
    const W = await ownWorkspace();
    const res = await startCheckoutAction(W, plan("pro"));
    expect(res).toMatchObject({ ok: false, code: "billing_unavailable" });
  });
});
