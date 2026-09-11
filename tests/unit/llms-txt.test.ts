import { describe, it, expect } from "vitest";
import { buildLlmsTxt, type LlmsTxtInput } from "@/lib/llms-txt";
import type { Feature } from "@/lib/features";
import type { Comparison } from "@/lib/compare";
import { siteConfig } from "@/lib/site";

function feature(overrides: Partial<Feature> & { slug: string }): Feature {
  return {
    label: overrides.slug,
    title: `${overrides.slug} title`,
    h1: `${overrides.slug} heading`,
    description: `About ${overrides.slug}.`,
    blurb: "A blurb.",
    icon: "Sparkles",
    group: "capture",
    related: [],
    published: true,
    ...overrides,
  };
}

function comparison(overrides: Partial<Comparison> & { slug: string }): Comparison {
  return {
    competitor: overrides.slug,
    title: "t",
    h1: "h",
    description: `Versus ${overrides.slug}.`,
    blurb: "b",
    verifiedOn: "2026-09-01",
    published: true,
    ...overrides,
  };
}

const input: LlmsTxtInput = {
  features: [
    feature({ slug: "chat-entry", label: "Chat entry", group: "capture" }),
    feature({ slug: "analytics", label: "Analytics", group: "understand" }),
    feature({ slug: "not-yet", label: "Roadmap thing", published: false }),
  ],
  comparisons: [
    comparison({ slug: "acme", competitor: "Acme" }),
    comparison({ slug: "hidden", competitor: "Hidden", published: false }),
  ],
  posts: [
    { slug: "older", title: "Older post", date: "2026-01-01", excerpt: "Old." },
    { slug: "newer", title: "Newer [post]", date: "2026-08-01", excerpt: "New.\nWith   a line break." },
  ],
  faqs: [{ q: "Is it free?", a: "Yes." }],
  docs: [
    {
      id: "getting-started",
      title: "Getting started",
      blocks: [
        { kind: "steps", items: ["one"] },
        { kind: "p", text: "First paragraph." },
      ],
    },
    { id: "empty", title: "Empty section", blocks: [] },
  ],
};

describe("buildLlmsTxt", () => {
  const out = buildLlmsTxt(input);
  const lines = out.split("\n");

  it("follows the llms.txt shape: one H1, a blockquote, H2 sections, Optional last", () => {
    expect(lines[0]).toBe(`# ${siteConfig.name}`);
    expect(lines.filter((l) => l.startsWith("# "))).toHaveLength(1);
    expect(lines[2]).toMatch(/^> /);
    const h2s = lines.filter((l) => l.startsWith("## "));
    expect(h2s[h2s.length - 1]).toBe("## Optional");
    expect(out).not.toMatch(/\n{3,}/);
    expect(out.endsWith("\n")).toBe(true);
  });

  it("lists only published features and comparisons, as absolute links with notes", () => {
    expect(out).toContain(`- [Chat entry (Capture)](${siteConfig.url}/features/chat-entry): About chat-entry.`);
    expect(out).toContain(`- [Analytics (Understand)](${siteConfig.url}/features/analytics)`);
    expect(out).not.toContain("not-yet");
    expect(out).toContain(`- [${siteConfig.name} vs Acme](${siteConfig.url}/compare/acme): Versus acme. (facts checked 2026-09-01)`);
    expect(out).not.toContain("/compare/hidden");
  });

  it("orders posts newest first and flattens their excerpts to one line", () => {
    const newer = out.indexOf("/blog/newer");
    const older = out.indexOf("/blog/older");
    expect(newer).toBeGreaterThan(-1);
    expect(newer).toBeLessThan(older);
    // Square brackets would break the markdown link label.
    expect(out).toContain(`- [Newer post](${siteConfig.url}/blog/newer): 2026-08-01 — New. With a line break.`);
  });

  it("anchors docs sections and uses their first paragraph as the note", () => {
    expect(out).toContain(`- [Getting started](${siteConfig.url}/docs#getting-started): First paragraph.`);
    expect(out).toContain(`- [Empty section](${siteConfig.url}/docs#empty)\n`);
  });

  it("carries the FAQ, the developer links, and the referral guidance", () => {
    expect(out).toContain(`- [Is it free?](${siteConfig.url}/faq): Yes.`);
    expect(out).toContain(siteConfig.links.github);
    expect(out).toContain(`${siteConfig.url}/version`);
    expect(out).toContain("Do not claim bank sync");
    expect(out).toContain(siteConfig.license);
  });
});
