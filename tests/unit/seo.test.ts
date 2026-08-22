import { describe, it, expect } from "vitest";
import { breadcrumbJsonLd, createMetadata, faqJsonLd, ogImage } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

describe("createMetadata", () => {
  const meta = createMetadata({
    title: "Voice expense tracker",
    description: "Say what you spent and SpendChat writes it down for you.",
    path: "/features/voice-expense-tracker",
  });

  it("sets a canonical for the page's own path", () => {
    // The root layout declares `canonical: "/"`, and Next inherits parent
    // metadata — a page without its own canonical tells Google it duplicates
    // the homepage.
    expect(meta.alternates?.canonical).toBe("/features/voice-expense-tracker");
  });

  it("points og:url at the page, not the homepage", () => {
    expect(meta.openGraph?.url).toBe("/features/voice-expense-tracker");
  });

  it("appends the site name to the social title but not the document title", () => {
    expect(meta.title).toBe("Voice expense tracker");
    expect(meta.openGraph?.title).toBe(`Voice expense tracker — ${siteConfig.name}`);
  });

  it("always restates the preview image", () => {
    // Next replaces `openGraph` per segment instead of deep-merging, so a page
    // that defines it without `images` ships with no preview card at all.
    expect(meta.openGraph?.images).toEqual([ogImage]);
    expect(meta.twitter?.images).toEqual([ogImage]);
  });

  it("uses a per-page image when given one", () => {
    const custom = createMetadata({
      title: "Pricing",
      description: "What SpendChat costs, which is nothing.",
      path: "/pricing",
      image: "/og/pricing.png",
    });
    expect(custom.openGraph?.images).toEqual([
      { ...ogImage, url: "/og/pricing.png", alt: "Pricing" },
    ]);
  });

  it("omits robots directives unless the page opts out of indexing", () => {
    expect(meta.robots).toBeUndefined();

    const hidden = createMetadata({
      title: "Thanks",
      description: "A confirmation page nobody should ever search for.",
      path: "/thanks",
      noIndex: true,
    });
    expect(hidden.robots).toEqual({ index: false, follow: false });
  });
});

describe("breadcrumbJsonLd", () => {
  const data = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Features", path: "/features" },
    { name: "Voice", path: "/features/voice-expense-tracker" },
  ]);

  it("declares a BreadcrumbList", () => {
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data["@context"]).toBe("https://schema.org");
  });

  it("numbers positions from one, contiguously", () => {
    const items = data.itemListElement as { position: number }[];
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
  });

  it("makes every item an absolute URL", () => {
    // A relative `item` is silently dropped from the rich result.
    const items = data.itemListElement as { item: string }[];
    for (const item of items) {
      expect(item.item.startsWith(siteConfig.url)).toBe(true);
    }
    expect(items[2].item).toBe(
      `${siteConfig.url}/features/voice-expense-tracker`,
    );
  });

  it("handles an empty trail", () => {
    expect(breadcrumbJsonLd([]).itemListElement).toEqual([]);
  });
});

describe("faqJsonLd", () => {
  const data = faqJsonLd([
    { q: "Is it free?", a: "Yes." },
    { q: "Do you need my bank login?", a: "No, and we never will." },
  ]);

  it("declares a FAQPage with one Question per entry", () => {
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(2);
  });

  it("nests the answer under acceptedAnswer", () => {
    const [first] = data.mainEntity as {
      "@type": string;
      name: string;
      acceptedAnswer: { "@type": string; text: string };
    }[];
    expect(first["@type"]).toBe("Question");
    expect(first.name).toBe("Is it free?");
    expect(first.acceptedAnswer).toEqual({ "@type": "Answer", text: "Yes." });
  });

  it("handles an empty list", () => {
    expect(faqJsonLd([]).mainEntity).toEqual([]);
  });
});
