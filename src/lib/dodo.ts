import "server-only";
import { ApiError } from "@/lib/errors";
import type { BillingConfig } from "@/lib/billing-config";
import { describeError, logger } from "@/lib/logger";

/**
 * The payment provider (Dodo Payments), over its REST API — the **only** module
 * that talks to it, so tests mock this file and nothing else.
 *
 * Plain `fetch`, not the provider's SDK. We call seven endpoints; the SDK would
 * add a dependency to the Worker for typed models of hundreds, and its default
 * retries (2, on 409/429/5xx) would re-send money-moving POSTs such as a plan
 * change. Here every call is sent once, with a timeout, and a failure becomes
 * one `ApiError` the UI can show. The host comes from `config.baseUrl`
 * (`DODO_PAYMENTS_LIVE_MODE`), never from an override.
 *
 * Only the fields we read are typed; webhooks carry the same objects and are
 * validated where they're parsed (`services/billing-webhook.ts`).
 */

const TIMEOUT_MS = 15_000;

/** The provider refused or failed a request. `status` is ours (502/409/…); `providerStatus` theirs. */
export class DodoError extends ApiError {
  readonly providerStatus: number | null;
  readonly providerCode: string | null;
  constructor(status: number, code: string, message: string, providerStatus: number | null, providerCode: string | null) {
    super(status, code, message);
    this.providerStatus = providerStatus;
    this.providerCode = providerCode;
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * What a call does, in the words its errors use: "open checkout", "change
 * the plan"… `refusedHint` is the way out when the provider refuses it.
 */
type Op = { what: string; refusedHint?: string };

async function request<T>(
  config: BillingConfig,
  method: Method,
  path: string,
  op: Op,
  opts: { body?: unknown; query?: Record<string, string | boolean | undefined> } = {},
): Promise<T> {
  const url = new URL(path, config.baseUrl);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn(`Payment provider request ${method} ${path} failed: ${describeError(err)}`, {
      event: "dodo.request_failed",
      method,
      path,
      durationMs: Date.now() - started,
    });
    throw new DodoError(
      502,
      "billing_provider_error",
      `Couldn't ${op.what} — the payment provider didn't answer. Try again in a moment.`,
      null,
      null,
    );
  }
  const durationMs = Date.now() - started;
  const text = await res.text();
  if (!res.ok) {
    let providerCode: string | null = null;
    let providerMessage = "";
    try {
      const parsed = JSON.parse(text) as { code?: unknown; message?: unknown };
      providerCode = typeof parsed.code === "string" ? parsed.code : null;
      providerMessage = typeof parsed.message === "string" ? parsed.message.slice(0, 300) : "";
    } catch {
      // Not JSON — the status says enough.
    }
    logger.warn(
      `Payment provider answered ${res.status} to ${method} ${path}${providerCode ? ` (${providerCode})` : ""}`,
      { event: "dodo.request_rejected", method, path, status: res.status, providerCode, providerMessage, durationMs },
    );
    // A 4xx is about this request (a change the provider won't make now); 5xx
    // and 429 are theirs to fix or wait out.
    const clientSide = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw new DodoError(
      clientSide ? 409 : 502,
      clientSide ? "billing_provider_refused" : "billing_provider_error",
      clientSide
        ? `The payment provider couldn't ${op.what} right now.${op.refusedHint ? ` ${op.refusedHint}` : " Try again in a moment."}`
        : `Couldn't ${op.what} — the payment provider didn't answer. Try again in a moment.`,
      res.status,
      providerCode,
    );
  }
  logger.info(`Payment provider answered ${res.status} to ${method} ${path} in ${durationMs}ms`, {
    event: "dodo.request_ok",
    method,
    path,
    status: res.status,
    durationMs,
  });
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DodoError(
      502,
      "billing_provider_error",
      `Couldn't ${op.what} — the payment provider sent an unreadable answer.`,
      res.status,
      null,
    );
  }
}

/** The `POST /checkouts` body we send (only the fields we use). */
export type DodoCheckoutRequest = {
  product_cart: { product_id: string; quantity: number }[];
  customer: { email: string; name?: string };
  billing_address: { country: string };
  billing_currency: string;
  allowed_payment_method_types: string[];
  feature_flags: {
    allow_currency_selection: boolean;
    allow_customer_editing_country: boolean;
    allow_discount_code: boolean;
    always_create_new_customer: boolean;
  };
  metadata: Record<string, string>;
  return_url: string;
  cancel_url: string;
  subscription_data?: { trial_period_days: number };
};

export async function createCheckoutSession(
  config: BillingConfig,
  body: DodoCheckoutRequest,
): Promise<{ sessionId: string; checkoutUrl: string }> {
  const res = await request<{ session_id?: unknown; checkout_url?: unknown }>(
    config,
    "POST",
    "/checkouts",
    { what: "open checkout" },
    { body },
  );
  if (typeof res?.session_id !== "string" || typeof res.checkout_url !== "string") {
    throw new DodoError(502, "billing_provider_error", "Couldn't open checkout — the payment provider sent no checkout page.", 200, null);
  }
  return { sessionId: res.session_id, checkoutUrl: res.checkout_url };
}

export type DodoChangePlanRequest = {
  product_id: string;
  quantity: 1;
  proration_billing_mode: "prorated_immediately" | "do_not_bill";
  effective_at: "immediately" | "next_billing_date";
  /** Replace a downgrade already waiting for the renewal. */
  cancel_scheduled_change_plan?: boolean;
  on_payment_failure?: "prevent_change" | "apply_change";
};

export async function changePlan(
  config: BillingConfig,
  subscriptionId: string,
  body: DodoChangePlanRequest,
): Promise<void> {
  await request(
    config,
    "POST",
    `/subscriptions/${encodeURIComponent(subscriptionId)}/change-plan`,
    { what: "change the plan", refusedHint: "Try again, or use Manage payment method." },
    { body },
  );
}

/** Drop a plan change scheduled for the renewal. */
export async function cancelScheduledPlanChange(config: BillingConfig, subscriptionId: string): Promise<void> {
  await request(config, "DELETE", `/subscriptions/${encodeURIComponent(subscriptionId)}/change-plan/scheduled`, {
    what: "cancel the scheduled plan change",
  });
}

export type DodoSubscriptionPatch =
  | { cancel_at_next_billing_date: boolean }
  | { status: "cancelled"; cancel_reason?: "cancelled_by_customer" | "cancelled_by_merchant" }
  | { metadata: Record<string, string> };

export async function updateSubscription(
  config: BillingConfig,
  subscriptionId: string,
  body: DodoSubscriptionPatch,
): Promise<void> {
  const what =
    "status" in body
      ? "cancel the plan"
      : "cancel_at_next_billing_date" in body
        ? body.cancel_at_next_billing_date
          ? "cancel the plan"
          : "keep the plan"
        : "update the plan";
  await request(
    config,
    "PATCH",
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { what, refusedHint: "Try again, or use Manage payment method." },
    { body },
  );
}

/** A one-day link to the provider's customer portal (payment methods, invoices, recovery). */
export async function createPortalSession(
  config: BillingConfig,
  customerId: string,
  returnUrl: string,
): Promise<string> {
  const res = await request<{ link?: unknown }>(
    config,
    "POST",
    `/customers/${encodeURIComponent(customerId)}/customer-portal/session`,
    { what: "open the payment page" },
    { query: { return_url: returnUrl, send_email: false } },
  );
  if (typeof res?.link !== "string") {
    throw new DodoError(502, "billing_provider_error", "Couldn't open the payment page — the payment provider sent no link.", 200, null);
  }
  return res.link;
}

/** A payment as the provider has it — read to tell whose a refund or dispute is. */
export async function getPayment(config: BillingConfig, paymentId: string): Promise<unknown> {
  return request<unknown>(config, "GET", `/payments/${encodeURIComponent(paymentId)}`, {
    what: "read the payment",
  });
}

/** The current state of a subscription — the same object its webhooks carry. */
export async function getSubscription(config: BillingConfig, subscriptionId: string): Promise<unknown> {
  return request<unknown>(config, "GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    what: "read the subscription",
  });
}
