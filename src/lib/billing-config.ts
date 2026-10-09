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
 *   DODO_PAYMENTS_ENVIRONMENT  `test_mode` | `live_mode` — picks the API host
 *   DODO_PRODUCTS              the product ids, printed by `pnpm billing:products:*`
 *
 * The API host comes from the environment alone. `DODO_PAYMENTS_BASE_URL` (the
 * provider SDK's override) is never read: setting it together with an
 * environment is ambiguous, so there is one way to say where to go.
 *
 * Unset or invalid → billing is unavailable: checkout answers 503
 * `billing_unavailable` and the page says "Payments aren't available on this
 * server yet". Nothing crashes, and a self-hosted copy without keys keeps
 * working as an all-Free app.
 */

export type DodoEnvironment = "test_mode" | "live_mode";

export type BillingConfig = {
  apiKey: string;
  webhookKey: string;
  environment: DodoEnvironment;
  /** `https://test.dodopayments.com` or `https://live.dodopayments.com`. */
  baseUrl: string;
  products: DodoProducts;
};

export const DODO_HOSTS: Record<DodoEnvironment, string> = {
  test_mode: "https://test.dodopayments.com",
  live_mode: "https://live.dodopayments.com",
};

export type BillingConfigResult = { ok: true; config: BillingConfig } | { ok: false; reason: string };

/** Pure: the config from a set of values (what `readBillingConfig` reads from `process.env`). */
export function parseBillingConfig(env: {
  apiKey?: string;
  webhookKey?: string;
  environment?: string;
  products?: string;
}): BillingConfigResult {
  const apiKey = env.apiKey?.trim();
  const webhookKey = env.webhookKey?.trim();
  const environment = env.environment?.trim();
  if (!apiKey) return { ok: false, reason: "DODO_PAYMENTS_API_KEY is not set" };
  if (!webhookKey) return { ok: false, reason: "DODO_PAYMENTS_WEBHOOK_KEY is not set" };
  if (!webhookKey.startsWith("whsec_")) {
    return { ok: false, reason: "DODO_PAYMENTS_WEBHOOK_KEY must be the whsec_… signing secret" };
  }
  if (environment !== "test_mode" && environment !== "live_mode") {
    return { ok: false, reason: "DODO_PAYMENTS_ENVIRONMENT must be test_mode or live_mode" };
  }
  const products = parseDodoProducts(env.products);
  if (!products.ok) return { ok: false, reason: products.error };
  return {
    ok: true,
    config: { apiKey, webhookKey, environment, baseUrl: DODO_HOSTS[environment], products: products.products },
  };
}

/** Logged once per isolate, so a misconfigured server can't flood the logs. */
let warned = false;

export function readBillingConfig(): BillingConfigResult {
  const result = parseBillingConfig({
    apiKey: process.env.DODO_PAYMENTS_API_KEY,
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY,
    environment: process.env.DODO_PAYMENTS_ENVIRONMENT,
    products: process.env.DODO_PRODUCTS,
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
