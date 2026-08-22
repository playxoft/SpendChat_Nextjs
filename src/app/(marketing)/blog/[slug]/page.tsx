import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/json-ld";
import { getPost, formatPostDate } from "@/lib/blog";
import { ogImage } from "@/lib/seo";
import { siteConfig } from "@/lib/site";
import { marketingCta } from "@/lib/marketing";

type Params = { params: Promise<{ slug: string }> };

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
  // Falls back to the shared card. Only that card's dimensions are known up
  // front — a post's own image can be any size, so don't claim 1200×630 for it.
  const image = post.image
    ? { url: post.image, alt: post.title }
    : { ...ogImage, alt: post.title };

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
    image: `${siteConfig.url}${post.image ?? siteConfig.ogImage}`,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: post.tag,
  };

  return (
    <article className="mx-auto max-w-2xl px-4 pb-24 pt-10 sm:pt-16">
      <JsonLd data={articleJsonLd} />
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All posts
      </Link>

      {/* Header */}
      <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium">
          {post.tag}
        </span>
        <span>{formatPostDate(post.date)}</span>
        <span aria-hidden>·</span>
        <span>{post.readingMinutes} min read</span>
      </div>
      <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
        {post.title}
      </h1>
      <p className="mt-4 text-pretty text-lg text-muted-foreground">{post.excerpt}</p>

      {/* Body — rendered from the post's MDX, styled via src/mdx-components.tsx */}
      <div className="mt-10 [&>:first-child]:mt-0">
        <post.Component />
      </div>

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
