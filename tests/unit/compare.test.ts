import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPARISONS, comparePath, getComparison, publishedComparisons } from "@/lib/compare";
import { siteConfig } from "@/lib/site";

/**
 * The `/compare/*` registry has the same job as the features one: the hub,
 * the sitemap and each page read it, so what it promises must exist. These
 * checks are the ones that would otherwise be found by Search Console weeks
 * later ("Submitted URL not found", a truncated title, a snippet Google rewrote).
 */
describe("COMPARISONS registry", () => {
  it("has unique, lowercase, hyphenated slugs", () => {
    const slugs = COMPARISONS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("every entry carries the copy a page needs", () => {
    for (const c of COMPARISONS) {
      for (const key of ["competitor", "title", "h1", "description", "blurb"] as const) {
        expect(c[key].trim().length, `${c.slug}.${key}`).toBeGreaterThan(0);
      }
      expect(c.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("keeps descriptions inside Google's snippet window", () => {
    for (const c of COMPARISONS) {
      expect(c.description.length, c.slug).toBeGreaterThanOrEqual(50);
      expect(c.description.length, c.slug).toBeLessThanOrEqual(160);
    }
  });

  it("keeps titles short enough to survive the SERP with the site name appended", () => {
    // Same budget as the feature pages: Google truncates around 60 characters
    // and the root template appends " — SpendChat" to whatever is stored here.
    const SUFFIX = ` — ${siteConfig.name}`.length;
    for (const c of COMPARISONS) {
      expect(c.title.length + SUFFIX, `"${c.title}"`).toBeLessThanOrEqual(60);
    }
  });

  it("every published comparison has a page file", () => {
    for (const c of publishedComparisons()) {
      const file = join(process.cwd(), "src/app/(marketing)/compare", c.slug, "page.tsx");
      expect(existsSync(file), `${comparePath(c.slug)} is published but ${file} is missing`).toBe(
        true,
      );
    }
  });

  it("getComparison ignores unpublished entries", () => {
    const list = [{ ...COMPARISONS[0]!, published: false }];
    expect(getComparison(COMPARISONS[0]!.slug, list)).toBeUndefined();
    expect(publishedComparisons(list)).toEqual([]);
  });
});
