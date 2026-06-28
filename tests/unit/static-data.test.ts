import { describe, it, expect } from "vitest";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { siteConfig, marketingNav, appNav } from "@/lib/site";
import { faqs } from "@/lib/faq";
import { marketingCta } from "@/lib/marketing";

describe("DEFAULT_CATEGORIES", () => {
  it("seeds 10 expense and 5 income categories", () => {
    expect(DEFAULT_CATEGORIES.filter((c) => c.kind === "expense")).toHaveLength(10);
    expect(DEFAULT_CATEGORIES.filter((c) => c.kind === "income")).toHaveLength(5);
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

describe("siteConfig", () => {
  it("has the required metadata fields", () => {
    expect(siteConfig.name).toBe("SpendChat");
    expect(siteConfig.url).not.toMatch(/\/$/); // trailing slash stripped
    expect(siteConfig.keywords.length).toBeGreaterThan(0);
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
