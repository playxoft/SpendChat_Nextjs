import "server-only";
import { parseDodoProducts, type DodoProducts } from "@/lib/billing-catalog";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * The payment provider's configuration, read from the environment on every
 * call (inside the request, like `getDb()` — a Worker's env isn't there at
 * module load). Four values, all in Doppler (`dev` = test mode, `prd` = live)
 * and as Worker secrets:
 *
 *   DODO_PAYMENTS_API_KEY      the API key (Developer → API Keys)
 *   DODO_PAYMENTS_WEBHOOK_KEY  the webhook signing secret, `whsec_…`
 *   DODO_PAYMENTS_LIVE_MODE    `true` = live mode, real money; `false` = test mode
 *   DODO_PRODUCTS              the product ids, printed by `pnpm billing:products:*`
 *   DODO_BRAND_ID              optional: the brand we sell under (`brnd_…`). One
 *                              provider account can sell for several brands; set,
 *                              it's what the products are filed under and how the
 *                              webhook tells our payments from theirs
 *
 * The API host comes from the live-mode switch alone. `DODO_PAYMENTS_BASE_URL`
 * (the provider SDK's override) is never read: setting it together with the
 * switch is ambiguous, so there is one way to say where to go.
 *
 * Unset or invalid → billing is unavailable: checkout answers 503
 * `billing_unavailable` and the page says "Payments aren't available on this
 * server yet". Nothing crashes, and a self-hosted copy without keys keeps
 * working as an all-Free app.
 */

export type BillingConfig = {
  apiKey: string;
  webhookKey: string;
  /** True when payments are real (live mode); false in test mode. */
  liveMode: boolean;
  /** Our brand on the provider account (`DODO_BRAND_ID`), or null when unset. */
  brandId: string | null;
  /** `https://test.dodopayments.com` or `https://live.dodopayments.com`. */
  baseUrl: string;
  products: DodoProducts;
};

export const DODO_HOSTS = {
  test: "https://test.dodopayments.com",
  live: "https://live.dodopayments.com",
} as const;

/**
 * `DODO_PAYMENTS_LIVE_MODE`: exactly `true` or `false` (any case). Anything
 * else — unset included — is null, and billing stays off: guessing would
 * either charge real cards or send live buyers to test mode.
 */
export function parseLiveMode(raw: string | undefined): boolean | null {
  const value = raw?.trim().toLowerCase();
  return value === "true" ? true : value === "false" ? false : null;
}

export type BillingConfigResult = { ok: true; config: BillingConfig } | { ok: false; reason: string };

/** Pure: the config from a set of values (what `readBillingConfig` reads from `process.env`). */
export function parseBillingConfig(env: {
  apiKey?: string;
  webhookKey?: string;
  liveMode?: string;
  products?: string;
  brandId?: string;
}): BillingConfigResult {
  const apiKey = env.apiKey?.trim();
  const webhookKey = env.webhookKey?.trim();
  const liveMode = parseLiveMode(env.liveMode);
  if (!apiKey) return { ok: false, reason: "DODO_PAYMENTS_API_KEY is not set" };
  if (!webhookKey) return { ok: false, reason: "DODO_PAYMENTS_WEBHOOK_KEY is not set" };
  if (!webhookKey.startsWith("whsec_")) {
    return { ok: false, reason: "DODO_PAYMENTS_WEBHOOK_KEY must be the whsec_… signing secret" };
  }
  if (liveMode === null) {
    return { ok: false, reason: "DODO_PAYMENTS_LIVE_MODE must be true or false" };
  }
  const products = parseDodoProducts(env.products);
  if (!products.ok) return { ok: false, reason: products.error };
  const brandId = env.brandId?.trim() || null;
  // A primary brand's id is the business's own (`bus_…`).
  if (brandId && !/^(brnd|bus)_[A-Za-z0-9]+$/.test(brandId)) {
    return { ok: false, reason: "DODO_BRAND_ID must be a brand id (brnd_…)" };
  }
  return {
    ok: true,
    config: {
      apiKey,
      webhookKey,
      liveMode,
      baseUrl: liveMode ? DODO_HOSTS.live : DODO_HOSTS.test,
      products: products.products,
      brandId,
    },
  };
}

/** Logged once per isolate, so a misconfigured server can't flood the logs. */
let warned = false;

export function readBillingConfig(): BillingConfigResult {
  const result = parseBillingConfig({
    apiKey: process.env.DODO_PAYMENTS_API_KEY,
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY,
    liveMode: process.env.DODO_PAYMENTS_LIVE_MODE,
    products: process.env.DODO_PRODUCTS,
    brandId: process.env.DODO_BRAND_ID,
  });
  if (!result.ok && !warned) {
    warned = true;
    // Only the reason — it names a variable, never a value.
    logger.warn(`Billing is unavailable on this server: ${result.reason}`, {
      event: "billing.bad_config",
      reason: result.reason,
    });
  }
  return result;
}

export function billingAvailable(): boolean {
  return readBillingConfig().ok;
}

/** The message a buyer sees when this server can't take payments. */
export const BILLING_UNAVAILABLE_MESSAGE = "Payments aren't available on this server yet.";

export function billingUnavailable(): ApiError {
  return new ApiError(503, "billing_unavailable", BILLING_UNAVAILABLE_MESSAGE);
}

/** The config, or 503 `billing_unavailable`. */
export function requireBillingConfig(): BillingConfig {
  const result = readBillingConfig();
  if (!result.ok) throw billingUnavailable();
  return result.config;
}
