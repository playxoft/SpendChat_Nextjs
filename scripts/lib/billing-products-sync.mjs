/**
 * The decisions `scripts/billing-products.mjs` makes — which provider product is
 * which SKU, what to create, what to update — with the HTTP call injected, so
 * `tests/unit/billing-products-sync.test.ts` can run it against a fake provider.
 *
 * Finding a SKU's product, in order:
 *  1. the product whose `metadata.sku` names it (what this script sets);
 *  2. the id `DODO_PRODUCTS` already holds for it (the id cache), if it exists;
 *  3. exactly one product with the same name.
 * Two products claiming one SKU, or several with its name and no other way to
 * tell, **abort the run** — it never guesses, and never creates a duplicate.
 */

/** Pages of `GET /products`, de-duplicated (whether the first page is 0 or 1 isn't documented). */
export async function listProducts(call) {
  const byId = new Map();
  for (let page = 0; page < 50; page++) {
    const res = await call("GET", `/products?page_size=100&page_number=${page}`);
    const items = res?.items ?? [];
    const before = byId.size;
    for (const item of items) if (item?.product_id) byId.set(item.product_id, item);
    if (items.length < 100 || byId.size === before) break;
  }
  return [...byId.values()];
}

/** Fields that decide whether an existing product needs a PATCH. */
export function differs(existing, body) {
  const changes = [];
  if ((existing.name ?? "") !== body.name) changes.push("name");
  if ((existing.description ?? "") !== body.description) changes.push("description");
  if (existing.tax_category !== body.tax_category) changes.push("tax category");
  if ((existing.pricing_mode ?? null) !== body.pricing_mode) changes.push("pricing mode");
  if ((existing.metadata?.sku ?? null) !== body.metadata.sku) changes.push("metadata");
  const p = existing.price ?? {};
  for (const key of Object.keys(body.price)) {
    const want = body.price[key];
    const have = p[key];
    // Defaults the provider may omit: treat a missing false/0 as equal.
    if (have === undefined && (want === false || want === 0)) continue;
    if (have !== want) changes.push(`price.${key}`);
  }
  return changes;
}

/** A localized price's id, whatever the provider calls it. */
export function ruleIdOf(rule) {
  return rule?.id ?? rule?.localized_price_id ?? rule?.price_id ?? null;
}

class Ambiguous extends Error {}

/**
 * Which existing product each SKU is, or null to create it. Throws when it
 * can't tell — the caller aborts before writing anything.
 */
export async function matchProducts({ call, specs, listed, knownIds }) {
  const bySku = new Map();
  for (const item of listed) {
    const sku = item.metadata?.sku;
    if (!sku || !specs.some((s) => s.sku === sku)) continue;
    if (bySku.has(sku)) {
      throw new Ambiguous(
        `Two products carry metadata.sku = ${sku} (${bySku.get(sku)} and ${item.product_id}). Archive one in the dashboard, then run this again.`,
      );
    }
    bySku.set(sku, item.product_id);
  }
  const claimed = new Set(bySku.values());
  const out = {};
  for (const spec of specs) {
    let id = bySku.get(spec.sku) ?? null;
    if (!id && knownIds?.[spec.sku]) {
      const cached = knownIds[spec.sku];
      const exists = listed.some((i) => i.product_id === cached) || (await call("GET", `/products/${cached}`).catch(() => null));
      if (exists && !claimed.has(cached)) id = cached;
    }
    if (!id) {
      const named = listed.filter((i) => i.name === spec.name && !claimed.has(i.product_id));
      if (named.length > 1) {
        throw new Ambiguous(
          `${named.length} products are named "${spec.name}" and none is marked as ${spec.sku}. Archive the extras (or put the right id in DODO_PRODUCTS), then run this again.`,
        );
      }
      if (named.length === 1) id = named[0].product_id;
    }
    if (id) claimed.add(id);
    out[spec.sku] = id;
  }
  return out;
}

/**
 * Create or update every product and its localized prices. Returns the SKU →
 * product id map (`pdt_(new)` for one a dry run would create).
 */
export async function syncProducts({ call, specs, bodyOf, knownIds = null, dryRun = false, log = () => {} }) {
  const listed = await listProducts(call);
  const matched = await matchProducts({ call, specs, listed, knownIds });
  const ids = {};
  for (const spec of specs) {
    const body = bodyOf(spec);
    let id = matched[spec.sku];
    if (!id) {
      if (dryRun) {
        log(`+ would create ${spec.sku}`);
        ids[spec.sku] = "pdt_(new)";
        continue;
      }
      const created = await call("POST", "/products", body);
      id = created?.product_id;
      if (!id) throw new Error(`Creating ${spec.sku} returned no product_id`);
      log(`+ created ${spec.sku} → ${id}`);
    } else {
      const existing = await call("GET", `/products/${id}`);
      const changes = differs(existing ?? {}, body);
      if (changes.length === 0) log(`= ${spec.sku} ${id} is up to date`);
      else if (dryRun) log(`~ would update ${spec.sku} ${id}: ${changes.join(", ")}`);
      else {
        await call("PATCH", `/products/${id}`, body);
        log(`~ updated ${spec.sku} ${id}: ${changes.join(", ")}`);
      }
    }
    ids[spec.sku] = id;

    // Localized prices: one active rule per non-base currency, our own amount.
    const rules = (await call("GET", `/products/${id}/localized-prices`))?.items ?? [];
    for (const want of spec.localized) {
      const have = rules.find((r) => r.currency === want.currency);
      if (!have) {
        if (dryRun) log(`  + would add ${want.currency} ${want.amount}`);
        else {
          await call("POST", `/products/${id}/localized-prices`, { currency: want.currency, amount: want.amount });
          log(`  + ${want.currency} ${want.amount}`);
        }
      } else if (have.amount !== want.amount) {
        const ruleId = ruleIdOf(have);
        if (!ruleId) throw new Error(`The ${want.currency} price on ${spec.sku} has no id to update — change it in the dashboard.`);
        if (dryRun) log(`  ~ would set ${want.currency} ${have.amount} → ${want.amount}`);
        else {
          await call("PATCH", `/products/${id}/localized-prices/${ruleId}`, { amount: want.amount });
          log(`  ~ ${want.currency} ${have.amount} → ${want.amount}`);
        }
      }
    }
    for (const r of rules.filter((r) => !spec.localized.some((w) => w.currency === r.currency))) {
      log(`  ! ${spec.sku} has a ${r.currency} price we don't sell in — left as is`);
    }
  }
  return ids;
}
