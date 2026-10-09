#!/usr/bin/env node
/**
 * Create or update SpendChat's seven products in Dodo Payments, then print the
 * `DODO_PRODUCTS` value to paste into Doppler.
 *
 * Usage (each script wraps its own `doppler run --config <env>`; don't prefix another):
 *   pnpm billing:products:dev                 # test mode — Doppler dev
 *   pnpm billing:products:prod                # live mode — Doppler prd (the owner runs this)
 *   pnpm billing:products:dev -- --dry-run    # show what would change; writes nothing
 *
 * What it makes comes from `src/lib/billing-catalog.ts` — the price list in
 * `src/lib/pricing.ts` and the plans in `src/lib/plans.ts` — never typed in here:
 *  - Plus and Pro, every 1, 3 and 12 months: subscriptions with **no trial on
 *    the product** (checkout grants the 21 days to eligible buyers — B1 fails
 *    closed), a 20-year term (a term equal to the billing frequency ends after
 *    one cycle), tax category SaaS, prices exclusive of tax;
 *  - the one-time AI top-up;
 *  - each priced in rupees, with a localized price — our own number, never an
 *    FX conversion — for USD, EUR, GBP, AUD and JPY (`pricing_mode: by_currency`);
 *  - filed under our brand — `DODO_BRAND_ID`, or when that's unset the one live
 *    brand named `BILLING_BRAND_NAME` ("SpendChat"). The brand is whose name
 *    and logo checkout and invoices show; the run aborts if it can't be found.
 *
 * Idempotent: existing products are found by the `metadata.sku` this script
 * sets (else the id `DODO_PRODUCTS` already holds, else one product with the
 * exact name — two candidates abort the run rather than guess), and only what
 * differs is updated (a price edit never re-prices existing subscribers — the
 * provider's rule). Run it again after a price change. The logic lives in
 * `scripts/lib/billing-products-sync.mjs` (unit-tested against a fake provider).
 *
 * Output: progress goes to stderr; stdout gets exactly one line,
 * `DODO_PRODUCTS={…}`. With `--dry-run` nothing is written; reads still happen
 * when a key is set, so the plan is real.
 *
 * Guard: `--env=dev` must have `DODO_PAYMENTS_LIVE_MODE=false`, `--env=prod`
 * `true` (the package scripts pass it), so a live key can't be used from the
 * dev config by accident or the other way round.
 *
 * Needs Node ≥ 22.18 (type stripping + `module.registerHooks`): the catalog is
 * TypeScript and is imported as is.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The catalog's own imports are extensionless (`./pricing`), as the app's
// bundler expects; teach Node to find the `.ts` file next to them.
registerHooks({
  resolve(specifier, context, next) {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[cm]?[jt]sx?$/.test(specifier) &&
      context.parentURL?.endsWith(".ts")
    ) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
    return next(specifier, context);
  },
});

const { BILLING_BRAND_NAME, BILLING_SKUS, parseDodoProducts, productBody, productSpecs } = await import(
  "../src/lib/billing-catalog.ts"
);
const { resolveBrand, syncProducts } = await import("./lib/billing-products-sync.mjs");

const HOSTS = { test: "https://test.dodopayments.com", live: "https://live.dodopayments.com" };
/** What `DODO_PAYMENTS_LIVE_MODE` must be for each `--env`. */
const EXPECTED_LIVE = { dev: false, prod: true };
const USAGE = "usage: pnpm billing:products:dev|prod [-- --dry-run]";

/** `pnpm run x -- --flag` forwards a bare `--` too; it isn't an argument. */
const args = process.argv.slice(2).filter((a) => a !== "--");
const opts = { dryRun: false, env: null };
for (const arg of args) {
  if (arg === "--dry-run") opts.dryRun = true;
  else if (/^--env=(dev|prod)$/.test(arg)) opts.env = arg.slice("--env=".length);
  else {
    console.error(`Unrecognised argument "${arg}".\n${USAGE}`);
    process.exit(2);
  }
}
if (!opts.env) {
  console.error(`--env=dev|prod is required (the package scripts pass it).\n${USAGE}`);
  process.exit(2);
}

const log = (...m) => console.error(...m);
const apiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
// Same rule as `parseLiveMode` in src/lib/billing-config.ts (server-only, so not importable here).
const liveRaw = process.env.DODO_PAYMENTS_LIVE_MODE?.trim().toLowerCase();
const liveMode = liveRaw === "true" ? true : liveRaw === "false" ? false : null;
const brandIdEnv = process.env.DODO_BRAND_ID?.trim() || null;
const specs = productSpecs();

function printSpec(spec) {
  const what = spec.kind === "subscription" ? `${spec.period}, no trial on the product (checkout grants it)` : "one-time";
  log(`  ${spec.sku.padEnd(15)} ${spec.name}  (${what})`);
  log(`    ${[spec.base, ...spec.localized].map((p) => `${p.currency} ${p.amount}`).join(" · ")}  (minor units; yen are whole yen)`);
}

if (!apiKey || liveRaw === undefined || liveRaw === "") {
  if (!opts.dryRun) {
    console.error("DODO_PAYMENTS_API_KEY and DODO_PAYMENTS_LIVE_MODE must be set (Doppler). Nothing was changed.");
    process.exit(2);
  }
  log("No Dodo key here — showing the products this would create (dry run, no requests):\n");
  for (const spec of specs) printSpec(spec);
  log("\nDODO_PRODUCTS would be printed here after a real run.");
  process.exit(0);
}
if (liveMode === null) {
  console.error(`DODO_PAYMENTS_LIVE_MODE must be true or false (got "${liveRaw}"). Nothing was changed.`);
  process.exit(2);
}
if (EXPECTED_LIVE[opts.env] !== liveMode) {
  console.error(
    `Refusing: --env=${opts.env} expects DODO_PAYMENTS_LIVE_MODE=${EXPECTED_LIVE[opts.env]}, but it is ${liveMode}. Nothing was changed.`,
  );
  process.exit(2);
}
if (process.env.DODO_PAYMENTS_BASE_URL) {
  console.error("Unset DODO_PAYMENTS_BASE_URL — the host comes from DODO_PAYMENTS_LIVE_MODE alone.");
  process.exit(2);
}

const base = liveMode ? HOSTS.live : HOSTS.test;

async function call(method, path, body) {
  const res = await fetch(new URL(path, base), {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

// The ids Doppler already holds are the cache that finds a product whose
// metadata the listing doesn't show.
const cached = parseDodoProducts(process.env.DODO_PRODUCTS);
const knownIds = cached.ok ? cached.products : null;

try {
  log(`Dodo ${liveMode ? "live mode" : "test mode"} — ${opts.dryRun ? "dry run, nothing will be written" : "creating / updating products"}`);
  const brand = await resolveBrand(call, { id: brandIdEnv, name: BILLING_BRAND_NAME });
  log(`Brand: ${brand.name} (${brand.id})`);
  if (brand.byName) log(`  Found by name — pin it: set DODO_BRAND_ID=${brand.id} in Doppler.`);
  log("");
  const bodyOf = (spec) => ({ ...productBody(spec), brand_id: brand.id });
  const ids = await syncProducts({ call, specs, bodyOf, knownIds, dryRun: opts.dryRun, log });
  if (opts.dryRun) {
    log("\nDry run — nothing was written. Run without --dry-run to create/update, then paste the line it prints.");
  } else {
    log("\nPaste this into Doppler as DODO_PRODUCTS (the value after the =):");
    console.log(`DODO_PRODUCTS=${JSON.stringify(Object.fromEntries(BILLING_SKUS.map((s) => [s, ids[s]])))}`);
  }
} catch (err) {
  console.error(`Failed — nothing after this point was written: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(3);
}
