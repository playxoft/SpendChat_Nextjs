import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/json-ld";
import { getPost, formatPostDate, socialCoverAlt } from "@/lib/blog";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { FaqSection } from "@/components/marketing/faq-section";
import { absoluteImage, breadcrumbJsonLd, faqJsonLd, ogImage } from "@/lib/seo";
import { siteConfig } from "@/lib/site";
import { marketingCta } from "@/lib/marketing";

type Params = { params: Promise<{ slug: string }> };

/**
 * The width of a post — text, cover and figures alike, so nothing sits wider
 * than the column it belongs to.
 *
 * `4xl` (896px) is the widest the body copy tolerates. Line length is the
 * constraint: past roughly 90 characters the eye starts losing its place on
 * the return sweep to the next line, which is why newspapers set narrow
 * columns on wide paper. Figures are rendered at 1200px and scale down to fit
 * this, which is comfortably legible for the tables among them.
 *
 * One constant, so widening the post means changing it here and nowhere else.
 */
const POST_WIDTH = "max-w-4xl";

// Render on demand rather than prerendering (SSG). The posts' MDX is bundled
// at build time, so there's nothing to fetch — but on Cloudflare/OpenNext,
// prerendered dynamic routes need an incremental cache to be served (otherwise
// they 404), while on-demand dynamic routes always work. `getPost` returns
// undefined for unknown slugs below, so those still 404 as expected.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  const url = `/blog/${post.slug}`;
  // The post's own cover, falling back to the shared card. Both are 1200×630 —
  // covers are generated at that size by `scripts/blog-image.html`. Declaring
  // the dimensions lets a chat client lay the preview out before fetching the
  // bytes; if a post ever ships a differently-sized image, drop them for it.
  //
  // Only the cover takes the post's alt text. The fallback card keeps its own,
  // because it depicts the product rather than this article — and `ogImage`
  // already carries the sentence that says so.
  const image = post.image
    ? { ...ogImage, url: post.image, alt: socialCoverAlt(post) }
    : ogImage;

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      siteName: siteConfig.name,
      title: post.title,
      description: post.excerpt,
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
      authors: [post.author ?? siteConfig.author],
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: [image],
    },
  };
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const url = `${siteConfig.url}/blog/${post.slug}`;
  const faqs = post.faqs ?? [];
  const trail = [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${post.slug}` },
  ];
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    author: {
      "@type": "Organization",
      name: post.author ?? siteConfig.author,
      url: siteConfig.url,
    },
    publisher: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
    // Absolute, and *not* by bare concatenation: a post may ship an absolute
    // cover, which prefixing would corrupt into a URL Google silently drops.
    image: absoluteImage(post.image ?? siteConfig.ogImage),
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: post.tag,
  };

  return (
    <article className={`mx-auto ${POST_WIDTH} px-4 pb-24 pt-4 sm:pt-6`}>
      <JsonLd data={articleJsonLd} />
      <JsonLd data={breadcrumbJsonLd(trail)} />
      {/* Only ever emitted from `post.faqs`, which is also what the visible
          block below renders — structured data describing text a reader can't
          find on the page is the exact mismatch the spam policies target. */}
      {faqs.length > 0 && <JsonLd data={faqJsonLd(faqs)} />}
      {/* A visible trail, not just a "back" link: the BreadcrumbList above
          describes navigation, and structured data for navigation the reader
          can't see is the mismatch the spam policies target. Google also
          renders the trail in place of the raw URL in the result snippet. */}
      <Breadcrumbs trail={trail} />

      {/* Header */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium">
          {post.tag}
        </span>
        <span>{formatPostDate(post.date)}</span>
        {/* Shown because it is claimed: `updated` is what `dateModified` and
            `og:modifiedTime` above report, and a markup date with nothing
            matching it on the page is a freshness signal Google is entitled to
            discount — the same visible/markup parity the FAQ and breadcrumb
            comments below turn on. */}
        {post.updated && post.updated !== post.date && (
          <>
            <span aria-hidden>·</span>
            <span>Updated {formatPostDate(post.updated)}</span>
          </>
        )}
        <span aria-hidden>·</span>
        <span>{post.readingMinutes} min read</span>
      </div>
      <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
        {post.title}
      </h1>
      <p className="mt-4 text-pretty text-lg text-muted-foreground">{post.excerpt}</p>

      {/* Cover — generated by scripts/blog-image.html. Plain <img> rather than
          next/image: it's a static file in `public/`, served off the CDN, so
          the optimizer (a Worker invocation on OpenNext) would only add a hop.
          The intrinsic size is declared so the article reserves its space. */}
      {post.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.image}
          alt={post.coverAlt}
          width={1200}
          height={630}
          className="mt-8 h-auto w-full rounded-2xl border"
        />
      )}

      {/* Body — rendered from the post's MDX, styled via src/mdx-components.tsx */}
      <div className="mt-10 [&>:first-child]:mt-0">
        <post.Component />
      </div>

      {/* The same array that produced the `FAQPage` markup above. */}
      <FaqSection
        faqs={faqs}
        heading="Frequently asked questions"
        className="mt-14"
      />

      {/* CTA */}
      <div className="mt-14 rounded-3xl border bg-card p-7 text-center">
        <h2 className="text-xl font-semibold tracking-tight">
          Start tracking your money
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
          It&apos;s free, private, and open source. Set up takes under a minute.
        </p>
        <Button asChild className={`mt-6 ${marketingCta}`}>
          <Link href="/sign-up">
            Get started <ArrowRight />
          </Link>
        </Button>
      </div>
    </article>
  );
}
