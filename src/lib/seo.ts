import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

type PageSeo = {
  /** Page title, without the site name — the root template appends " — SpendChat". */
  title: string;
  /** 50–160 chars. This is the snippet Google shows, and the chat preview subtitle. */
  description: string;
  /** Route path this page is served from, e.g. "/features". Must start with "/". */
  path: string;
  /** Override the shared OG image. Defaults to the root `opengraph-image.png`. */
  image?: string;
  /** Keep the page out of search results (e.g. thank-you or gated pages). */
  noIndex?: boolean;
};

/**
 * The shared preview card shown when a link is pasted into WhatsApp, Telegram,
 * X, Slack, iMessage, etc. Source: `scripts/og-image.html` → `public/opengraph-image.png`.
 *
 * It lives in `public/` rather than using Next's `opengraph-image` file
 * convention on purpose. The convention serves the image from a Next route
 * handler — i.e. a Worker invocation on OpenNext — whereas `public/` is emitted
 * into `.open-next/assets` and served straight off Cloudflare's CDN. Chat
 * crawlers give up quickly, so the fewer moving parts between them and the
 * bytes, the better.
 *
 * Dimensions are declared here so crawlers can lay the card out without
 * downloading the image first. `metadataBase` (root layout) turns the relative
 * URL absolute, which every one of these crawlers requires.
 */
export const ogImage = {
  url: siteConfig.ogImage,
  width: 1200,
  height: 630,
  alt: `${siteConfig.name} — ${siteConfig.tagline}`,
  type: "image/png",
};

/**
 * Builds a page's `metadata` export.
 *
 * Use this for every new page instead of hand-writing a `Metadata` object. Two
 * inheritance traps are the reason it exists, both of which silently cost
 * traffic rather than failing loudly:
 *
 * 1. The root layout declares `alternates: { canonical: "/" }`. Next inherits
 *    parent metadata into any page that doesn't override it, so a page that
 *    forgets `alternates` tells Google it's a duplicate of the homepage — and
 *    gets dropped from the index.
 * 2. The root layout's `openGraph.url` is the homepage, so a page that doesn't
 *    override it reports the wrong `og:url`.
 *
 * Taking `path` as a required argument makes both impossible to forget.
 *
 * `images` is always set explicitly, which looks redundant next to the
 * `opengraph-image.png` file convention but isn't: Next does *not* deep-merge
 * `openGraph` across segments. A page that defines `openGraph` at all replaces
 * the parent's whole object, discarding the file-convention image with it — so
 * relying on inheritance here silently ships pages with no preview image.
 * Width/height are stated inline so chat clients can lay the card out without
 * fetching the image first.
 */
export function createMetadata({
  title,
  description,
  path,
  image,
  noIndex,
}: PageSeo): Metadata {
  const titleWithSite = `${title} — ${siteConfig.name}`;
  const images = [image ? { ...ogImage, url: image, alt: title } : ogImage];

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: siteConfig.name,
      title: titleWithSite,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: titleWithSite,
      description,
      images,
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}

/** One step in a breadcrumb trail. `path` is root-relative, e.g. "/features". */
export type Crumb = { name: string; path: string };

/**
 * `BreadcrumbList` structured data for a nested page.
 *
 * Worth the few lines: Google renders the trail in place of the raw URL in the
 * result snippet, which is both a click-through win and free context for a
 * reader deciding whether `/features/voice-expense-tracker` is what they wanted.
 * Positions are 1-based and must be contiguous, and every `item` has to be an
 * absolute URL — a relative one is silently dropped from the rich result.
 *
 * Pair it with a visible trail on the page (`<Breadcrumbs>`): structured data
 * that describes navigation the reader can't see is exactly the mismatch the
 * spam policies target.
 */
export function breadcrumbJsonLd(trail: Crumb[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${siteConfig.url}${crumb.path}`,
    })),
  };
}

/**
 * `FAQPage` structured data.
 *
 * **Only call this with questions and answers that are visibly rendered on the
 * same page.** Marking up hidden or absent content is a documented spam pattern
 * and risks a manual action against the whole domain — which would cost far
 * more than the rich result is worth. The answer string should match the
 * on-page text; light HTML is permitted by the spec but plain text is safer.
 */
export function faqJsonLd(
  items: { q: string; a: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}
