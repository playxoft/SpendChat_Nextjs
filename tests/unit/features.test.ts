import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  FEATURES,
  FEATURE_GROUPS,
  featureLink,
  featurePath,
  featuresInGroup,
  getFeature,
  publishedFeatures,
  relatedFeatures,
  type Feature,
} from "@/lib/features";
import { siteConfig } from "@/lib/site";

/** Minimal fixture so the link rules can be tested independent of rollout state. */
function feature(overrides: Partial<Feature> & { slug: string }): Feature {
  return {
    label: overrides.slug,
    title: `${overrides.slug} title`,
    h1: `${overrides.slug} heading`,
    description: "x".repeat(80),
    blurb: "A blurb.",
    icon: "Sparkles",
    group: "capture",
    related: [],
    published: true,
    ...overrides,
  };
}

describe("FEATURES registry", () => {
  it("has unique slugs", () => {
    const slugs = FEATURES.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses lowercase, hyphenated slugs", () => {
    for (const f of FEATURES) {
      expect(f.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("every entry carries the copy a page needs", () => {
    for (const f of FEATURES) {
      expect(f.label).toBeTruthy();
      expect(f.title).toBeTruthy();
      expect(f.h1).toBeTruthy();
      expect(f.blurb).toBeTruthy();
      expect(f.icon).toBeTruthy();
    }
  });

  it("keeps descriptions inside Google's snippet window", () => {
    // Under ~50 chars wastes the snippet; over ~160 gets truncated mid-sentence.
    for (const f of FEATURES) {
      expect(f.description.length).toBeGreaterThanOrEqual(50);
      expect(f.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("keeps titles short enough to survive the SERP", () => {
    // Google truncates the result title around 60 characters, and the root
    // layout's template appends " — SpendChat" — 12 more — to whatever is
    // stored here. So the budget for this field is 48, not 60. Checking the
    // bare string against 60 is the mistake that ships four truncated titles.
    const SUFFIX = ` — ${siteConfig.name}`.length;
    for (const f of FEATURES) {
      expect(
        f.title.length + SUFFIX,
        `"${f.title}" renders as ${f.title.length + SUFFIX} chars`,
      ).toBeLessThanOrEqual(60);
    }
  });

  it("belongs to a declared group", () => {
    const ids = FEATURE_GROUPS.map((g) => g.id);
    for (const f of FEATURES) {
      expect(ids).toContain(f.group);
    }
  });

  it("only relates to slugs that exist, and never to itself", () => {
    const slugs = new Set(FEATURES.map((f) => f.slug));
    for (const f of FEATURES) {
      for (const rel of f.related) {
        expect(slugs.has(rel)).toBe(true);
        expect(rel).not.toBe(f.slug);
      }
    }
  });

  it("every published feature has a page file", () => {
    // A `published: true` entry with no page is a sitemap URL that 404s —
    // Search Console reports it as "Submitted URL not found" and it burns
    // crawl budget on every recrawl.
    for (const f of publishedFeatures()) {
      const page = path.join(
        process.cwd(),
        "src/app/(marketing)/features",
        f.slug,
        "page.tsx",
      );
      expect(fs.existsSync(page), `missing page for ${f.slug}`).toBe(true);
    }
  });
});

describe("publishedFeatures", () => {
  it("drops unpublished entries", () => {
    const list = [
      feature({ slug: "live" }),
      feature({ slug: "draft", published: false }),
    ];
    expect(publishedFeatures(list).map((f) => f.slug)).toEqual(["live"]);
  });

  it("reads the real registry by default", () => {
    expect(publishedFeatures().every((f) => f.published)).toBe(true);
  });
});

describe("getFeature", () => {
  it("finds a published feature by slug", () => {
    const list = [feature({ slug: "chat" })];
    expect(getFeature("chat", list)?.slug).toBe("chat");
  });

  it("does not find an unpublished one", () => {
    const list = [feature({ slug: "chat", published: false })];
    expect(getFeature("chat", list)).toBeUndefined();
  });

  it("defaults to the real registry", () => {
    expect(getFeature("definitely-not-a-feature")).toBeUndefined();
  });
});

describe("featuresInGroup", () => {
  it("returns published entries for one group, in registry order", () => {
    const list = [
      feature({ slug: "a", group: "capture" }),
      feature({ slug: "b", group: "organise" }),
      feature({ slug: "c", group: "capture" }),
      feature({ slug: "d", group: "capture", published: false }),
    ];
    expect(featuresInGroup("capture", list).map((f) => f.slug)).toEqual(["a", "c"]);
  });

  it("defaults to the real registry", () => {
    expect(featuresInGroup("capture").every((f) => f.group === "capture")).toBe(true);
  });
});

describe("relatedFeatures", () => {
  it("returns nothing for an unknown or unpublished slug", () => {
    const list = [feature({ slug: "a" })];
    expect(relatedFeatures("nope", 3, list)).toEqual([]);
  });

  it("returns the declared siblings when there are enough", () => {
    const list = [
      feature({ slug: "a", related: ["b", "c", "d"] }),
      feature({ slug: "b" }),
      feature({ slug: "c" }),
      feature({ slug: "d" }),
    ];
    expect(relatedFeatures("a", 3, list).map((f) => f.slug)).toEqual(["b", "c", "d"]);
  });

  it("skips siblings that aren't published yet", () => {
    const list = [
      feature({ slug: "a", related: ["b", "c"] }),
      feature({ slug: "b" }),
      feature({ slug: "c", published: false }),
    ];
    expect(relatedFeatures("a", 1, list).map((f) => f.slug)).toEqual(["b"]);
  });

  it("tops up from the rest of the registry to reach the minimum", () => {
    const list = [
      feature({ slug: "a", related: ["b"] }),
      feature({ slug: "b" }),
      feature({ slug: "c" }),
      feature({ slug: "d" }),
    ];
    const related = relatedFeatures("a", 3, list).map((f) => f.slug);
    expect(related).toHaveLength(3);
    expect(related[0]).toBe("b");
    expect(related).not.toContain("a"); // never links to itself
  });

  it("returns what it can when the registry is too small to reach the minimum", () => {
    const list = [feature({ slug: "a", related: [] }), feature({ slug: "b" })];
    expect(relatedFeatures("a", 5, list).map((f) => f.slug)).toEqual(["b"]);
  });

  it("defaults to the real registry", () => {
    expect(relatedFeatures("definitely-not-a-feature")).toEqual([]);
  });
});

describe("featurePath", () => {
  it("builds a root-relative path", () => {
    expect(featurePath("voice-expense-tracker")).toBe("/features/voice-expense-tracker");
  });
});

describe("featureLink", () => {
  it("points at the page once it's published", () => {
    const published = publishedFeatures()[0];
    expect(featureLink(published.slug)).toBe(featurePath(published.slug));
  });

  it("falls back to the hub for a feature that has no page yet", () => {
    // Prose across the site references features by name before their page
    // exists. Without this, those sentences ship as 404s.
    const unpublished = FEATURES.find((f) => !f.published);
    if (!unpublished) return; // every page shipped — nothing to guard
    expect(featureLink(unpublished.slug)).toBe("/features");
  });

  it("falls back to the hub for a slug that isn't in the registry at all", () => {
    expect(featureLink("not-a-feature")).toBe("/features");
  });
});

describe("FEATURE_GROUPS", () => {
  it("has unique ids and non-empty copy", () => {
    const ids = FEATURE_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of FEATURE_GROUPS) {
      expect(g.label).toBeTruthy();
      expect(g.blurb).toBeTruthy();
    }
  });
});
