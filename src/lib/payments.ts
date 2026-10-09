import "server-only";
import { headers } from "next/headers";
import { planSku, type BillingSku } from "@/lib/billing-catalog";
import { requireBillingConfig, type BillingConfig } from "@/lib/billing-config";
import * as dodo from "@/lib/dodo";
import type { DodoCheckoutRequest } from "@/lib/dodo";
import type { PaidPersonalPlan, Period, Currency } from "@/lib/pricing";
import { siteConfig } from "@/lib/site";

/**
 * The payment provider's hosted checkout, behind one function. `startCheckout`
 * (`services/billing.ts`) has already checked who is buying, what, and for
 * which workspace, priced it from `lib/pricing.ts`, and decided the trial;
 * this turns that order into a provider checkout session and returns its URL.
 * The provider calls themselves live in `lib/dodo.ts`.
 */

export type CheckoutOrder = {
  workspace: { id: string; name: string };
  /** The admin buying it — the provider's customer. */
  buyer: { userId: string; email: string | null; name: string | null };
  line:
    | { kind: "plan"; plan: PaidPersonalPlan; period: Period; trialDays: number }
    | { kind: "topup"; actions: number; validityMonths: number };
  /** Minor units of `currency`, computed on the server — what the provider is expected to charge (pre-tax). */
  amountMinor: number;
  currency: Currency;
  /** The billing country the session is pinned to (the request's, or the currency's home). */
  country: string;
  /** The invoice line: "SpendChat Plus · 1 year · Workspace: Home". */
  description: string;
  /** Where the provider sends the buyer back to, as an app path. */
  returnPath: string;
  /** Where "back" on the checkout page goes, as an app path. */
  cancelPath: string;
};

export type CheckoutSession = { url: string; sessionId: string; productId: string };

/** The SKU an order sells. */
export function orderSku(order: CheckoutOrder): BillingSku {
  return order.line.kind === "plan" ? planSku(order.line.plan, order.line.period) : "topup";
}

/** Where a currency is billed when the request's own country isn't known (local dev, Tor). */
const HOME_COUNTRY: Record<Currency, string> = {
  INR: "IN",
  USD: "US",
  EUR: "DE",
  GBP: "GB",
  AUD: "AU",
  JPY: "JP",
};

/**
 * The country a checkout is pinned to: the request's own (Cloudflare's, which
 * the client can't set — the same one `checkoutCurrency` judged INR by), so tax
 * is worked out for where the buyer is and the rupee list can't be bought from
 * elsewhere; the currency's home country when the request has none.
 */
export function billingCountryFor(currency: Currency, requestCountry: string | null | undefined): string {
  const c = requestCountry?.trim().toUpperCase();
  if (c && /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1") return c;
  return HOME_COUNTRY[currency];
}

/** Card everywhere; UPI only for rupees — the provider shows it only for India + INR anyway. */
export function paymentMethodTypes(currency: Currency): string[] {
  return currency === "INR" ? ["upi_intent", "credit", "debit"] : ["credit", "debit"];
}

/**
 * The `POST /checkouts` body. Pure, so the payload can be tested: the product
 * for this plan and period, the country and currency pinned (the buyer can't
 * switch either on the provider's page — the price they saw is the price
 * charged), the trial days we decided (B1 — overriding the product's 21), and
 * our ids as metadata. The metadata is a convenience only: webhooks resolve a
 * purchase through the session row we store, never through metadata alone.
 */
export function checkoutRequest(order: CheckoutOrder, config: BillingConfig, origin: string): DodoCheckoutRequest {
  const sku = orderSku(order);
  const email = order.buyer.email?.trim();
  if (!email) throw new Error("A checkout needs the buyer's email");
  const name = order.buyer.name?.trim();
  return {
    product_cart: [{ product_id: config.products[sku], quantity: 1 }],
    customer: name ? { email, name } : { email },
    billing_address: { country: order.country },
    billing_currency: order.currency,
    allowed_payment_method_types: paymentMethodTypes(order.currency),
    feature_flags: {
      allow_currency_selection: false,
      allow_customer_editing_country: false,
      // Student codes are pre-applied by support, never typed (B5).
      allow_discount_code: false,
    },
    metadata: {
      workspace_id: order.workspace.id,
      buyer_user_id: order.buyer.userId,
      item: order.line.kind,
      sku,
    },
    return_url: `${origin}${order.returnPath}`,
    cancel_url: `${origin}${order.cancelPath}`,
    ...(order.line.kind === "plan" ? { subscription_data: { trial_period_days: order.line.trialDays } } : {}),
  };
}

/**
 * The origin the provider sends the buyer back to: the one they're on when it
 * is ours (the site, or a local/dev host), else the site's canonical URL. A
 * forged `Host` can't point someone else's return anywhere.
 */
export async function returnOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      const origin = `${proto}://${host}`.replace(/\/$/, "");
      const siteHost = new URL(siteConfig.url).host;
      const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
      if (host === siteHost || local || process.env.NODE_ENV !== "production") return origin;
    }
  } catch {
    // Outside a request (tests, scripts).
  }
  return siteConfig.url;
}

/**
 * Open a hosted checkout for `order` and return where to send the buyer.
 * Throws 503 `billing_unavailable` on a server without payment keys, so a
 * self-hosted copy fails cleanly instead of half-way through a purchase.
 */
export async function createCheckoutSession(order: CheckoutOrder): Promise<CheckoutSession> {
  const config = requireBillingConfig();
  const body = checkoutRequest(order, config, await returnOrigin());
  const session = await dodo.createCheckoutSession(config, body);
  return { url: session.checkoutUrl, sessionId: session.sessionId, productId: body.product_cart[0]!.product_id };
}
