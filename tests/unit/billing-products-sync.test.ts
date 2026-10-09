import { describe, expect, it } from "vitest";
import { productBody, productSpecs, BILLING_SKUS } from "@/lib/billing-catalog";
// @ts-expect-error — a plain .mjs module (the products script's core), no types.
import { differs, findBrand, resolveBrand, ruleIdOf, syncProducts } from "../../scripts/lib/billing-products-sync.mjs";

/**
 * `pnpm billing:products:*` against a fake provider: what it creates, that a
 * second run writes nothing, what it updates, how it finds products without
 * metadata, and that it aborts rather than guess or duplicate.
 */

type Product = { product_id: string; name: string; metadata?: Record<string, string>; [k: string]: unknown };
type Rule = { id: string; currency: string; amount: number };

function fakeProvider(opts: { listWithoutMetadata?: boolean } = {}) {
  const products = new Map<string, Product>();
  const rules = new Map<string, Rule[]>();
  const writes: string[] = [];
  let n = 0;
  const call = async (method: string, path: string, body?: Record<string, unknown>) => {
    if (method === "GET" && path.startsWith("/products?")) {
      const page = Number(new URL(path, "http://x").searchParams.get("page_number"));
      const items = [...products.values()].map((p) => (opts.listWithoutMetadata ? { ...p, metadata: undefined } : p));
      return { items: page === 0 ? items : [] };
    }
    const lp = path.match(/^\/products\/([^/]+)\/localized-prices(?:\/([^/]+))?$/);
    if (lp) {
      const [, pid, rid] = lp;
      if (method === "GET") return { items: rules.get(pid!) ?? [] };
      writes.push(`${method} ${path}`);
      if (method === "POST") {
        rules.set(pid!, [...(rules.get(pid!) ?? []), { id: `lcp_${++n}`, currency: body!.currency as string, amount: body!.amount as number }]);
        return {};
      }
      const r = (rules.get(pid!) ?? []).find((x) => x.id === rid);
      if (r) r.amount = body!.amount as number;
      return {};
    }
    const one = path.match(/^\/products\/([^/]+)$/);
    if (one) {
      if (method === "GET") {
        const p = products.get(one[1]!);
        if (!p) throw new Error("404");
        return p;
      }
      writes.push(`${method} ${path}`);
      products.set(one[1]!, { ...products.get(one[1]!)!, ...(body as object) } as Product);
      return null;
    }
    if (method === "POST" && path === "/products") {
      writes.push("POST /products");
      const id = `pdt_${++n}`;
      products.set(id, { product_id: id, ...(body as object) } as Product);
      return { product_id: id };
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { call, products, rules, writes };
}

const specs = productSpecs();
const run = (call: unknown, extra: Record<string, unknown> = {}) =>
  syncProducts({ call, specs, bodyOf: productBody, ...extra }) as Promise<Record<string, string>>;

describe("billing:products sync", () => {
  it("creates the seven products with every localized price, then a second run writes nothing", async () => {
    const fake = fakeProvider();
    const ids = await run(fake.call);
    expect(Object.keys(ids)).toEqual([...BILLING_SKUS]);
    expect(fake.writes.filter((w) => w === "POST /products")).toHaveLength(7);
    for (const id of Object.values(ids)) expect(fake.rules.get(id)).toHaveLength(5);
    // Products carry no trial: checkout grants it (B1 fails closed).
    for (const p of fake.products.values()) {
      const price = p.price as Record<string, unknown>;
      if (price.type === "recurring_price") expect(price.trial_period_days).toBe(0);
    }
    fake.writes.length = 0;
    expect(await run(fake.call)).toEqual(ids);
    expect(fake.writes).toEqual([]);
  });

  it("updates only what changed — a product field, or one localized price", async () => {
    const fake = fakeProvider();
    const ids = await run(fake.call);
    fake.products.get(ids.pro_yearly!)!.name = "Old name";
    fake.rules.get(ids.topup!)!.find((r) => r.currency === "JPY")!.amount = 1;
    fake.writes.length = 0;
    await run(fake.call);
    expect(fake.writes.sort()).toEqual(
      [`PATCH /products/${ids.pro_yearly}`, expect.stringMatching(new RegExp(`^PATCH /products/${ids.topup}/localized-prices/lcp_`))].sort(),
    );
    expect(fake.rules.get(ids.topup!)!.find((r) => r.currency === "JPY")!.amount).toBe(870);
  });

  it("writes nothing in a dry run", async () => {
    const fake = fakeProvider();
    const ids = await run(fake.call, { dryRun: true });
    expect(fake.writes).toEqual([]);
    expect(ids.plus_monthly).toBe("pdt_(new)");
  });

  it("finds products by the cached ids, or by exact name, when the listing has no metadata", async () => {
    const fake = fakeProvider();
    const ids = await run(fake.call);
    const blind = fakeProvider({ listWithoutMetadata: true });
    for (const [k, v] of fake.products) blind.products.set(k, v);
    for (const [k, v] of fake.rules) blind.rules.set(k, v);
    expect(await run(blind.call, { knownIds: ids })).toEqual(ids);
    expect(await run(blind.call)).toEqual(ids);
    expect(blind.writes.filter((w) => w === "POST /products")).toEqual([]);
  });

  it("aborts rather than guess when two products share a name and nothing says which is which", async () => {
    const blind = fakeProvider({ listWithoutMetadata: true });
    const name = specs[0]!.name;
    blind.products.set("pdt_a", { product_id: "pdt_a", name });
    blind.products.set("pdt_b", { product_id: "pdt_b", name });
    await expect(run(blind.call)).rejects.toThrow(/2 products are named/);
    expect(blind.writes).toEqual([]);
  });

  it("aborts when two products claim one SKU", async () => {
    const fake = fakeProvider();
    fake.products.set("pdt_x", { product_id: "pdt_x", name: "x", metadata: { sku: "topup" } });
    fake.products.set("pdt_y", { product_id: "pdt_y", name: "y", metadata: { sku: "topup" } });
    await expect(run(fake.call)).rejects.toThrow(/Two products carry metadata.sku = topup/);
  });

  it("files products under the given brand, and moves one that sits on another", async () => {
    const fake = fakeProvider();
    const branded = (spec: (typeof specs)[number]) => ({ ...productBody(spec), brand_id: "brnd_a" });
    const ids = (await run(fake.call, { bodyOf: branded })) as Record<string, string>;
    for (const p of fake.products.values()) expect(p.brand_id).toBe("brnd_a");
    fake.products.get(ids.plus_monthly!)!.brand_id = "bus_primary";
    fake.writes.length = 0;
    await run(fake.call, { bodyOf: branded });
    expect(fake.writes).toEqual([`PATCH /products/${ids.plus_monthly}`]);
    // Without a brand in the body, whatever brand a product has is left alone.
    fake.writes.length = 0;
    await run(fake.call);
    expect(fake.writes).toEqual([]);
  });

  it("finds the one live brand by name, and refuses none or several", async () => {
    const brands = (items: unknown[]) => async () => ({ items });
    expect(await findBrand(brands([{ brand_id: "brnd_x", name: "Other" }, { brand_id: "brnd_s", name: "SpendChat" }]), "SpendChat")).toBe(
      "brnd_s",
    );
    // An archived namesake doesn't count; a bare-array listing works too.
    expect(
      await findBrand(async () => [{ brand_id: "brnd_old", name: "SpendChat", archived_at: "2026-01-01" }, { brand_id: "brnd_s", name: "SpendChat" }], "SpendChat"),
    ).toBe("brnd_s");
    await expect(findBrand(brands([{ brand_id: "brnd_x", name: "Other" }]), "SpendChat")).rejects.toThrow(/No brand is named/);
    await expect(
      findBrand(brands([{ brand_id: "a", name: "SpendChat" }, { brand_id: "b", name: "SpendChat" }]), "SpendChat"),
    ).rejects.toThrow(/2 brands are named/);
  });

  it("uses DODO_BRAND_ID when it names a live brand, else finds the brand by name", async () => {
    const listing = async () => ({
      items: [
        { brand_id: "brnd_s", name: "SpendChat" },
        { brand_id: "brnd_old", name: "Old", archived_at: "2026-01-01" },
      ],
    });
    expect(await resolveBrand(listing, { id: "brnd_s", name: "SpendChat" })).toEqual({ id: "brnd_s", name: "SpendChat", byName: false });
    expect(await resolveBrand(listing, { id: null, name: "SpendChat" })).toEqual({ id: "brnd_s", name: "SpendChat", byName: true });
    await expect(resolveBrand(listing, { id: "brnd_gone", name: "SpendChat" })).rejects.toThrow(/isn't a live brand/);
    await expect(resolveBrand(listing, { id: "brnd_old", name: "SpendChat" })).rejects.toThrow(/isn't a live brand/);
  });

  it("reads a localized price's id under any of its names, and compares bodies field by field", () => {
    expect(ruleIdOf({ id: "a" })).toBe("a");
    expect(ruleIdOf({ localized_price_id: "b" })).toBe("b");
    expect(ruleIdOf({})).toBeNull();
    const body = productBody(specs[0]!) as Record<string, unknown> & { metadata: { sku: string }; price: Record<string, unknown> };
    expect(differs({ ...body }, body)).toEqual([]);
    expect(differs({ ...body, price: { ...body.price, price: 1 } }, body)).toEqual(["price.price"]);
  });
});
