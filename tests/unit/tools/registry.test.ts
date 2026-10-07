import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TOOLS,
  TOOL_GROUPS,
  getTool,
  toolOgImage,
  publishedTools,
  relatedTools,
  toolMenuColumns,
  toolPath,
  type Tool,
} from "@/lib/tools";
import { siteConfig } from "@/lib/site";
import { hasToolPreview } from "@/components/tools/tool-previews";
import { hasToolIcon } from "@/components/tools/tool-icon";

function tool(overrides: Partial<Tool> & { slug: string }): Tool {
  return {
    label: overrides.slug,
    icon: "Calculator",
    title: `${overrides.slug} title`,
    h1: `${overrides.slug} heading`,
    description: "x".repeat(80),
    blurb: "A blurb.",
    action: "Calculate",
    group: "everyday",
    related: [],
    published: true,
    ...overrides,
  };
}

describe("TOOLS registry", () => {
  it("has unique, lowercase, hyphenated slugs", () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("gives every tool a short verb for its hub button", () => {
    for (const t of TOOLS) {
      expect(t.action.trim(), t.slug).not.toBe("");
      expect(t.action.length, t.slug).toBeLessThanOrEqual(28);
    }
  });

  it("keeps descriptions inside Google's snippet window", () => {
    for (const t of TOOLS) {
      expect(t.description.length, t.slug).toBeGreaterThanOrEqual(50);
      expect(t.description.length, t.slug).toBeLessThanOrEqual(160);
    }
  });

  it("keeps titles short enough to survive the SERP once the site name is appended", () => {
    const SUFFIX = ` — ${siteConfig.name}`.length;
    for (const t of TOOLS) {
      expect(t.title.length + SUFFIX, `"${t.title}"`).toBeLessThanOrEqual(60);
    }
  });

  it("belongs to a declared group and relates only to real, other slugs", () => {
    const groups = TOOL_GROUPS.map((g) => g.id);
    const slugs = new Set(TOOLS.map((t) => t.slug));
    for (const t of TOOLS) {
      expect(groups).toContain(t.group);
      for (const rel of t.related) {
        expect(slugs.has(rel), `${t.slug} → ${rel}`).toBe(true);
        expect(rel).not.toBe(t.slug);
      }
    }
  });

  it("every published tool has a page file", () => {
    // A published entry without a page is a sitemap URL that 404s.
    for (const t of publishedTools()) {
      const page = path.join(process.cwd(), "src/app/(marketing)/tools", t.slug, "page.tsx");
      expect(fs.existsSync(page), `missing page for ${t.slug}`).toBe(true);
    }
  });
});

describe("social previews", () => {
  it("every published tool, and the hub, has its 1200×630 preview image under 300 KB", () => {
    // Regenerate with the loop in scripts/og-tools.html after adding a tool.
    for (const slug of ["index", ...publishedTools().map((t) => t.slug)]) {
      const file = path.join(process.cwd(), "public", toolOgImage(slug));
      expect(fs.existsSync(file), `missing ${toolOgImage(slug)}`).toBe(true);
      expect(fs.statSync(file).size, slug).toBeLessThan(300_000);
    }
  });
});

describe("hub cards", () => {
  it("every published tool has its mini picture", () => {
    // A tool without one renders an empty box on the hub, next to cards that sell.
    for (const t of publishedTools()) {
      expect(hasToolPreview(t.slug), `no preview for ${t.slug}`).toBe(true);
    }
  });
});

describe("Tools menu", () => {
  it("every tool's icon resolves, and no two tools share one", () => {
    for (const t of TOOLS) expect(hasToolIcon(t.icon), `${t.slug} → ${t.icon}`).toBe(true);
    const icons = publishedTools().map((t) => t.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("lists every published tool once, in three columns of whole groups in hub order", () => {
    const columns = toolMenuColumns(3);
    expect(columns).toHaveLength(3);
    const groups = columns.flat();
    expect(groups.map((g) => g.id)).toEqual(
      TOOL_GROUPS.map((g) => g.id).filter((id) => groups.some((x) => x.id === id)),
    );
    expect(groups.flatMap((g) => g.items.map((t) => t.slug)).sort()).toEqual(
      publishedTools().map((t) => t.slug).sort(),
    );
  });

  it("balances the columns: no other contiguous split has a shorter tallest column", () => {
    const registry = [
      tool({ slug: "a", group: "business" }),
      tool({ slug: "b", group: "business" }),
      tool({ slug: "c", group: "grow" }),
      tool({ slug: "d", group: "plan" }),
      tool({ slug: "e", group: "plan" }),
      tool({ slug: "f", group: "plan" }),
      tool({ slug: "g", group: "everyday" }),
    ];
    // Heights (heading + tools): business 3, grow 2, plan 4, everyday 2.
    const cols = toolMenuColumns(3, registry).map((c) => c.map((g) => g.id));
    expect(cols).toEqual([["business", "grow"], ["plan"], ["everyday"]]);
  });

  it("copes with fewer groups than columns", () => {
    const cols = toolMenuColumns(3, [tool({ slug: "a" })]);
    expect(cols).toEqual([[expect.objectContaining({ id: "everyday" })]]);
    expect(toolMenuColumns(3, [])).toEqual([[]]);
  });
});

describe("registry helpers", () => {
  const registry = [
    tool({ slug: "a", related: ["b", "c"] }),
    tool({ slug: "b" }),
    tool({ slug: "c", published: false }),
    tool({ slug: "d" }),
  ];

  it("publishedTools drops unpublished entries", () => {
    expect(publishedTools(registry).map((t) => t.slug)).toEqual(["a", "b", "d"]);
  });

  it("getTool finds unpublished entries too, so pages render in development", () => {
    expect(getTool("c", registry)?.slug).toBe("c");
    expect(getTool("zzz", registry)).toBeUndefined();
  });

  it("relatedTools skips unpublished siblings and tops up to the minimum", () => {
    expect(relatedTools("a", 2, registry).map((t) => t.slug)).toEqual(["b", "d"]);
  });

  it("toolPath is rooted at /tools", () => {
    expect(toolPath("age-calculator")).toBe("/tools/age-calculator");
  });
});
