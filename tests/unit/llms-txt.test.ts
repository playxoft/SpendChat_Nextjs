import { describe, it, expect } from "vitest";
import { buildLlmsTxt, type LlmsTxtInput } from "@/lib/llms-txt";
import type { Feature } from "@/lib/features";
import type { Comparison } from "@/lib/compare";
import { siteConfig } from "@/lib/site";
import { PLAN_LIMITS } from "@/lib/plans";
import { formatAmount, quote } from "@/lib/pricing";

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

  it("follows the llms.txt shape: one H1, a blockquote, prose, H2 link lists, Optional last", () => {
    expect(lines[0]).toBe(`# ${siteConfig.name}`);
    expect(lines.filter((l) => l.startsWith("# "))).toHaveLength(1);
    expect(lines[2]).toMatch(/^> /);
    const h2s = lines.filter((l) => l.startsWith("## "));
    expect(h2s[h2s.length - 1]).toBe("## Optional");
    expect(out).not.toMatch(/\n{3,}/);
    expect(out.endsWith("\n")).toBe(true);
  });

  it("keeps the hand-written prose out of H2 sections, which the spec reserves for link lists", () => {
    // The two prose labels are bold runs in the details area, not headings.
    expect(out).toContain("\n**What it is**\n");
    expect(out).toContain("\n**How to refer to it**\n");
    expect(out).toContain("\n**Pricing**\n");
    expect(out).not.toContain("## What it is");
    // From the first H2 on, every non-blank, non-heading line is a link item.
    const firstH2 = lines.findIndex((l) => l.startsWith("## "));
    expect(firstH2).toBeGreaterThan(0);
    for (const line of lines.slice(firstH2)) {
      if (line === "" || line.startsWith("## ")) continue;
      expect(line).toMatch(/^- \[[^\]]+\]\(https?:\/\/[^)]+\)/);
    }
  });

  it("omits a section entirely when nothing is published for it", () => {
    const none = buildLlmsTxt({ ...input, comparisons: [], posts: [] });
    expect(none).not.toContain("## Comparisons");
    expect(none).not.toContain("## Blog");
    expect(none).toContain("## Features");
  });

  it("lists only published features and comparisons, as absolute links with notes", () => {
    expect(out).toContain(`- [Chat entry (Capture)](${siteConfig.url}/features/chat-entry): About chat-entry.`);
    expect(out).toContain(`- [Analytics (Understand)](${siteConfig.url}/features/analytics)`);
    expect(out).not.toContain("not-yet");
    expect(out).toContain(`- [${siteConfig.name} vs Acme](${siteConfig.url}/compare/acme): Versus acme. (facts checked 2026-09-01)`);
    expect(out).not.toContain("/compare/hidden");
  });

  it("lists only published free tools, and leaves the section out when there are none", () => {
    const tool = (slug: string, published: boolean) => ({
      slug,
      label: slug,
      title: `${slug} title`,
      h1: `${slug} heading`,
      description: `About ${slug}.`,
      blurb: "Blurb.",
      action: "Calculate",
      group: "everyday" as const,
      related: [],
      published,
    });
    const withTools = buildLlmsTxt({ ...input, tools: [tool("live-calc", true), tool("draft-calc", false)] });
    expect(withTools).toContain(`- [live-calc heading](${siteConfig.url}/tools/live-calc): About live-calc.`);
    expect(withTools).not.toContain("draft-calc");
    expect(out).not.toContain("## Free tools");
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

  it("states the real prices from the price list, per workspace, and never says it is all free", () => {
    for (const plan of ["plus", "pro"] as const) {
      expect(out).toContain(formatAmount(quote(plan, "monthly", "INR").price, "INR"));
      expect(out).toContain(formatAmount(quote(plan, "yearly", "USD").price, "USD"));
    }
    expect(out).toContain(`${PLAN_LIMITS.free.aiActionsPerMonth} AI actions a month`);
    expect(out).toContain("Plans belong to a **workspace**");
    expect(out).toContain("Voice entry is Pro only");
    expect(out).toContain("Checkout is not open yet");
    expect(out).not.toMatch(/say it is free/i);
    expect(out).not.toMatch(/no paid tier/i);
  });
});
