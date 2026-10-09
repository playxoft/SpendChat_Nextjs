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
 * charged), the trial days we decided (B1 — the products carry none, so 0
 * unless the buyer is eligible), and our ids as metadata. The metadata is a
 * convenience only: webhooks resolve a purchase through the session row we
 * store, never through metadata alone.
 *
 * Every checkout makes a **new provider customer**: the provider's portal
 * shows a customer's cards, subscriptions and invoices, so one customer per
 * purchase keeps one workspace's billing from showing another's. Discount codes
 * (the student code, B5) are accepted on plans only — a discounted top-up would
 * fail the amount check (A3) and grant nothing.
 *
 * The provider prints the product's name as the invoice line ("SpendChat Plus
 * · 1 year"); there's no field for our workspace's name on a subscription
 * invoice, so Settings → Billing lists invoices under their workspace.
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
      allow_discount_code: order.line.kind === "plan",
      always_create_new_customer: true,
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
 * The origin the provider sends the buyer back to. On a deployed Worker that's
 * `APP_ORIGIN` (set per environment in wrangler.toml), so beta returns to beta
 * and production to production whatever the build baked in. Without it
 * (`next dev`): the host the request came in on when it's ours, local, or any
 * host outside production (a tunnel); else the site's canonical URL. A forged
 * `Host` can't point a production return anywhere.
 */
export async function returnOrigin(): Promise<string> {
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured && /^https?:\/\/[^/\s]+$/.test(configured.replace(/\/$/, ""))) return configured.replace(/\/$/, "");
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
