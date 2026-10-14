import { createHmac } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { billingCheckoutSessions, workspaceSubscriptions, workspaces } from "@/db/schema";
import { BILLING_APP, type DodoProducts } from "@/lib/billing-catalog";
import { getTestDb } from "./test-db";

/**
 * Billing test kit: a configured "provider" (env values, product ids), signed
 * webhook deliveries built exactly as the provider builds them (Standard
 * Webhooks HMAC over `id.timestamp.body`), and payload builders for the
 * objects its webhooks carry. The provider's REST calls are mocked in each
 * test file (`vi.mock("@/lib/dodo")`).
 */

export const PRODUCTS: DodoProducts = {
  plus_monthly: "pdt_plus_m",
  plus_quarterly: "pdt_plus_q",
  plus_yearly: "pdt_plus_y",
  pro_monthly: "pdt_pro_m",
  pro_quarterly: "pdt_pro_q",
  pro_yearly: "pdt_pro_y",
  topup: "pdt_topup",
};

/** Our brand on the fake provider account; the provider stamps it on every payment. */
export const BRAND_ID = "brnd_SpendChatTest";

export const WEBHOOK_SECRET = `whsec_${Buffer.from("integration-test-webhook-secret!").toString("base64")}`;

const ENV = {
  DODO_PAYMENTS_API_KEY: "test_api_key",
  DODO_PAYMENTS_WEBHOOK_KEY: WEBHOOK_SECRET,
  DODO_PAYMENTS_LIVE_MODE: "false",
  DODO_PRODUCTS: JSON.stringify(PRODUCTS),
  DODO_BRAND_ID: BRAND_ID,
};

export function configureBilling(): void {
  Object.assign(process.env, ENV);
}

export function unconfigureBilling(): void {
  for (const key of Object.keys(ENV)) delete process.env[key];
}

export function signedHeaders(id: string, body: string, ts = Math.floor(Date.now() / 1000), secret = WEBHOOK_SECRET) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
  return new Headers({ "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": signature });
}

let seq = 0;

/** One signed delivery of `type` with `data`, through the webhook handler. */
export async function deliver(
  type: string,
  data: Record<string, unknown>,
  opts: { id?: string; at?: Date } = {},
): Promise<Response> {
  const { handleDodoWebhook } = await import("@/services/billing-webhook");
  const id = opts.id ?? `evt_${++seq}_${Date.now()}`;
  const body = JSON.stringify({
    business_id: "bus_test",
    type,
    timestamp: (opts.at ?? new Date()).toISOString(),
    data,
  });
  return handleDodoWebhook(body, signedHeaders(id, body));
}

const DAY = 24 * 60 * 60 * 1000;

/** A provider subscription object, as its webhooks carry it. */
export function subscriptionData(over: Record<string, unknown> & { workspaceId?: string; buyerUserId?: string } = {}) {
  const { workspaceId, buyerUserId, ...rest } = over;
  return {
    subscription_id: "sub_1",
    status: "active",
    product_id: PRODUCTS.plus_yearly,
    currency: "INR",
    customer: { customer_id: "cus_1", email: "own@example.com", name: "own" },
    payment_frequency_count: 1,
    payment_frequency_interval: "Year",
    subscription_period_count: 20,
    subscription_period_interval: "Year",
    next_billing_date: new Date(Date.now() + 21 * DAY).toISOString(),
    previous_billing_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    cancel_at_next_billing_date: false,
    trial_period_days: 21,
    recurring_pre_tax_amount: 129900,
    quantity: 1,
    // Every checkout of ours carries `app`, and its subscription inherits it.
    metadata: workspaceId
      ? { app: BILLING_APP, workspace_id: workspaceId, buyer_user_id: buyerUserId ?? "", item: "plan" }
      : { app: BILLING_APP },
    scheduled_change: null,
    ...rest,
  };
}

/** A provider payment object. */
export function paymentData(over: Record<string, unknown> = {}) {
  return {
    payment_id: `pay_${++seq}`,
    status: "succeeded",
    total_amount: 0,
    tax: 0,
    currency: "INR",
    created_at: new Date().toISOString(),
    subscription_id: null,
    checkout_session_id: null,
    invoice_url: "https://test.dodopayments.com/invoices/payments/x",
    brand_id: BRAND_ID,
    metadata: { app: BILLING_APP },
    customer: { customer_id: "cus_1", email: "own@example.com", name: "own" },
    ...over,
  };
}

/** The newest checkout session recorded for a workspace. */
export async function latestSession(workspaceId: string) {
  const [row] = await getTestDb()
    .select()
    .from(billingCheckoutSessions)
    .where(eq(billingCheckoutSessions.workspaceId, workspaceId))
    .orderBy(desc(billingCheckoutSessions.createdAt))
    .limit(1);
  return row!;
}

export async function workspaceRow(workspaceId: string) {
  const [row] = await getTestDb().select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return row!;
}

export async function subscriptionRow(subscriptionId: string) {
  const [row] = await getTestDb()
    .select()
    .from(workspaceSubscriptions)
    .where(eq(workspaceSubscriptions.subscriptionId, subscriptionId))
    .limit(1);
  return row;
}
