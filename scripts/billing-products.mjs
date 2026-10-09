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
 *  - Plus and Pro, every 1, 3 and 12 months: subscriptions with a 21-day trial
 *    that needs a payment method, a 20-year term (a term equal to the billing
 *    frequency ends after one cycle), tax category SaaS, prices exclusive of tax;
 *  - the one-time AI top-up;
 *  - each priced in rupees, with a localized price — our own number, never an
 *    FX conversion — for USD, EUR, GBP, AUD and JPY (`pricing_mode: by_currency`).
 *
 * Idempotent: existing products are found by the `metadata.sku` this script
 * sets, and only what differs is updated (a price edit never re-prices existing
 * subscribers — the provider's rule). Run it again after a price change.
 *
 * Output: progress goes to stderr; stdout gets exactly one line,
 * `DODO_PRODUCTS={…}`. With `--dry-run` nothing is written; reads still happen
 * when a key is set, so the plan is real.
 *
 * Guard: `--env=dev` must be talking to `test_mode`, `--env=prod` to
 * `live_mode` (the package scripts pass it), so a live key can't be used from
 * the dev config by accident or the other way round.
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

const { BILLING_SKUS, productBody, productSpecs } = await import("../src/lib/billing-catalog.ts");

const HOSTS = { test_mode: "https://test.dodopayments.com", live_mode: "https://live.dodopayments.com" };
const EXPECTED_MODE = { dev: "test_mode", prod: "live_mode" };
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
const mode = process.env.DODO_PAYMENTS_ENVIRONMENT?.trim();
const specs = productSpecs();

if (!apiKey || !mode) {
  if (!opts.dryRun) {
    console.error("DODO_PAYMENTS_API_KEY and DODO_PAYMENTS_ENVIRONMENT must be set (Doppler). Nothing was changed.");
    process.exit(2);
  }
  log("No Dodo key here — showing the products this would create (dry run, no requests):\n");
  for (const spec of specs) printSpec(spec);
  log("\nDODO_PRODUCTS would be printed here after a real run.");
  process.exit(0);
}
if (!(mode in HOSTS)) {
  console.error(`DODO_PAYMENTS_ENVIRONMENT must be test_mode or live_mode (got "${mode}").`);
  process.exit(2);
}
if (EXPECTED_MODE[opts.env] !== mode) {
  console.error(
    `Refusing: --env=${opts.env} expects ${EXPECTED_MODE[opts.env]}, but DODO_PAYMENTS_ENVIRONMENT is ${mode}. Nothing was changed.`,
  );
  process.exit(2);
}
if (process.env.DODO_PAYMENTS_BASE_URL) {
  console.error("Unset DODO_PAYMENTS_BASE_URL — the host comes from DODO_PAYMENTS_ENVIRONMENT alone.");
  process.exit(2);
}

const base = HOSTS[mode];

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

function printSpec(spec) {
  const what = spec.kind === "subscription" ? `${spec.period}, ${spec.trialDays}-day trial` : "one-time";
  log(`  ${spec.sku.padEnd(15)} ${spec.name}  (${what})`);
  log(`    ${[spec.base, ...spec.localized].map((p) => `${p.currency} ${p.amount}`).join(" · ")}  (minor units)`);
}

/**
 * Every product (not archived), page by page. Whether the first page is 0 or 1
 * isn't documented, so pages are de-duplicated by id and the walk stops at a
 * short page or one that adds nothing new.
 */
async function listProducts() {
  const byId = new Map();
  for (let page = 0; page < 50; page++) {
    const res = await call("GET", `/products?page_size=100&page_number=${page}`);
    const items = res?.items ?? [];
    const before = byId.size;
    for (const item of items) byId.set(item.product_id, item);
    if (items.length < 100 || byId.size === before) break;
  }
  return [...byId.values()];
}

/** Fields that decide whether an existing product needs a PATCH. */
function differs(existing, body) {
  const changes = [];
  if ((existing.name ?? "") !== body.name) changes.push("name");
  if ((existing.description ?? "") !== body.description) changes.push("description");
  if (existing.tax_category !== body.tax_category) changes.push("tax category");
  if ((existing.pricing_mode ?? null) !== body.pricing_mode) changes.push("pricing mode");
  const p = existing.price ?? {};
  for (const key of Object.keys(body.price)) {
    const want = body.price[key];
    const have = p[key];
    // Defaults the provider may omit: treat missing false/0 as equal.
    if (have === undefined && (want === false || want === 0)) continue;
    if (have !== want) changes.push(`price.${key}`);
  }
  return changes;
}

try {
  log(`Dodo ${mode} — ${opts.dryRun ? "dry run, nothing will be written" : "creating / updating products"}\n`);
  const listed = await listProducts();
  const bySku = new Map();
  for (const item of listed) {
    const sku = item.metadata?.sku;
    if (!sku || !BILLING_SKUS.includes(sku)) continue;
    if (bySku.has(sku)) {
      throw new Error(
        `Two products carry metadata.sku = ${sku} (${bySku.get(sku)} and ${item.product_id}). Archive one in the dashboard, then run this again.`,
      );
    }
    bySku.set(sku, item.product_id);
  }

  const ids = {};
  for (const spec of specs) {
    const body = productBody(spec);
    let id = bySku.get(spec.sku);
    if (!id) {
      if (opts.dryRun) {
        log(`+ would create ${spec.sku}`);
        printSpec(spec);
        ids[spec.sku] = "pdt_(new)";
        continue;
      }
      const created = await call("POST", "/products", body);
      id = created.product_id;
      log(`+ created ${spec.sku} → ${id}`);
    } else {
      const existing = await call("GET", `/products/${id}`);
      const changes = differs(existing, body);
      if (changes.length === 0) log(`= ${spec.sku} ${id} is up to date`);
      else if (opts.dryRun) log(`~ would update ${spec.sku} ${id}: ${changes.join(", ")}`);
      else {
        await call("PATCH", `/products/${id}`, body);
        log(`~ updated ${spec.sku} ${id}: ${changes.join(", ")}`);
      }
    }
    ids[spec.sku] = id;

    // Localized prices: one active rule per non-base currency, our own amount.
    const rules = id.startsWith("pdt_(") ? [] : ((await call("GET", `/products/${id}/localized-prices`))?.items ?? []);
    for (const want of spec.localized) {
      const have = rules.find((r) => r.currency === want.currency);
      if (!have) {
        if (opts.dryRun) log(`  + would add ${want.currency} ${want.amount}`);
        else {
          await call("POST", `/products/${id}/localized-prices`, { currency: want.currency, amount: want.amount });
          log(`  + ${want.currency} ${want.amount}`);
        }
      } else if (have.amount !== want.amount) {
        if (opts.dryRun) log(`  ~ would set ${want.currency} ${have.amount} → ${want.amount}`);
        else {
          await call("PATCH", `/products/${id}/localized-prices/${have.id}`, { amount: want.amount });
          log(`  ~ ${want.currency} ${have.amount} → ${want.amount}`);
        }
      }
    }
    const extra = rules.filter((r) => !spec.localized.some((w) => w.currency === r.currency));
    for (const r of extra) log(`  ! ${spec.sku} has a ${r.currency} price we don't sell in — left as is`);
  }

  if (opts.dryRun) {
    log("\nDry run — nothing was written. Run without --dry-run to create/update, then paste the line it prints.");
  } else {
    log("\nPaste this into Doppler as DODO_PRODUCTS (the value after the =):");
    console.log(`DODO_PRODUCTS=${JSON.stringify(Object.fromEntries(BILLING_SKUS.map((s) => [s, ids[s]])))}`);
  }
} catch (err) {
  console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(3);
}
