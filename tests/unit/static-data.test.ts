import { describe, it, expect } from "vitest";
import { DEFAULT_CATEGORIES, DEFAULT_TAGS } from "@/lib/categories";
import { PLAN_LIMITS } from "@/lib/plans";
import { siteConfig, marketingNav, appNav } from "@/lib/site";
import { faqs } from "@/lib/faq";
import { marketingCta } from "@/lib/marketing";

describe("DEFAULT_CATEGORIES", () => {
  it("seeds 7 expense and 3 income categories", () => {
    expect(DEFAULT_CATEGORIES.filter((c) => c.kind === "expense")).toHaveLength(7);
    expect(DEFAULT_CATEGORIES.filter((c) => c.kind === "income")).toHaveLength(3);
  });
  it("every category has a name, valid kind, and icon", () => {
    for (const c of DEFAULT_CATEGORIES) {
      expect(c.name).toBeTruthy();
      expect(c.icon).toBeTruthy();
      expect(["income", "expense"]).toContain(c.kind);
    }
  });
  it("names are unique within a kind", () => {
    for (const kind of ["income", "expense"] as const) {
      const names = DEFAULT_CATEGORIES.filter((c) => c.kind === kind).map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe("DEFAULT_TAGS", () => {
  it("seeds 2 tags with hex colours, within the Free tag cap", () => {
    expect(DEFAULT_TAGS).toHaveLength(2);
    for (const t of DEFAULT_TAGS) expect(t.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(DEFAULT_TAGS.length).toBeLessThan(PLAN_LIMITS.free.tags);
  });
  it("leaves room under the Free category cap", () => {
    expect(DEFAULT_CATEGORIES.length).toBeLessThan(PLAN_LIMITS.free.categories);
  });
});

describe("siteConfig", () => {
  it("has the required metadata fields", () => {
    expect(siteConfig.name).toBe("SpendChat");
    expect(siteConfig.url).not.toMatch(/\/$/); // trailing slash stripped
    expect(siteConfig.topics.length).toBeGreaterThan(0);
    expect(siteConfig.ogImage).toBeTruthy();
  });
  it("nav entries are well-formed", () => {
    for (const item of marketingNav) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.label).toBeTruthy();
    }
    for (const item of appNav) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.label).toBeTruthy();
      expect(item.icon).toBeTruthy();
    }
  });
});

describe("faqs", () => {
  it("are non-empty Q/A pairs", () => {
    expect(faqs.length).toBeGreaterThan(0);
    for (const f of faqs) {
      expect(f.q).toBeTruthy();
      expect(f.a).toBeTruthy();
    }
  });
});

describe("marketingCta", () => {
  it("is a non-empty class string", () => {
    expect(typeof marketingCta).toBe("string");
    expect(marketingCta).toContain("rounded-xl");
  });
});
