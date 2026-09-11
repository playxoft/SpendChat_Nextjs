import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { getPosts, formatPostDate } from "@/lib/blog";
import { bento, bentoRow, bentoVariant } from "@/lib/grid-fill";
import { cn } from "@/lib/utils";
import { absoluteImage, createMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

const base = createMetadata({
  title: "Blog",
  description:
    "Updates, ideas, and notes from the team behind SpendChat — a minimal, open-source money tracker.",
  path: "/blog",
});

// Spread rather than replace: `alternates` also has to advertise the RSS feed,
// and overwriting it wholesale would drop the canonical URL createMetadata set.
export const metadata: Metadata = {
  ...base,
  alternates: {
    ...base.alternates,
    types: { "application/rss+xml": `${siteConfig.url}/blog/rss.xml` },
  },
};

export default function BlogPage() {
  const posts = getPosts();
  // The LCP candidate is the first cover that actually *renders*, which isn't
  // necessarily the first post — `image` is optional, so a coverless post at
  // the top would otherwise spend the eager hint on nothing and leave the real
  // one lazy.
  const lcpSlug = posts.find((post) => post.image)?.slug;
  // Capped at two columns: a full-bleed cover would be taller than the fold.
  const postCells = bento(posts.length, { sm: 2, lg: 3 }, 2);

  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${siteConfig.name} Blog`,
    description: metadata.description,
    url: `${siteConfig.url}/blog`,
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      dateModified: post.updated ?? post.date,
      image: absoluteImage(post.image ?? siteConfig.ogImage),
      url: `${siteConfig.url}/blog/${post.slug}`,
    })),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:pt-16">
      <JsonLd data={blogJsonLd} />
      {/* Header */}
      <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
        <Newspaper className="size-3.5" /> Blog
      </span>
      <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
        News & notes
      </h1>
      <p className="mt-4 text-pretty text-lg text-muted-foreground">
        Updates and ideas from the team building {siteConfig.name}.
      </p>

      {/* Post grid — 3 across on large screens. The post count is whatever has
          been written, so it almost never divides by three: the bento widens
          the newest posts until the spans do, which turns the remainder into a
          featured row instead of a card stranded at the bottom. */}
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post, i) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            // `overflow-hidden` on the card and no padding of its own: the
            // cover runs edge to edge and the card's own radius clips its
            // corners, so there's no seam between the two. Padding moves to the
            // text block below.
            // A widened card turns side-on: a cover stretched over two columns
            // would tower over the row it is meant to head. It flips at the
            // breakpoint the card actually widens at, not before.
            className={cn(
              "group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-md",
              bentoRow(postCells[i]),
              postCells[i].span,
            )}
          >
            {post.image && (
              // Plain <img>: covers are static files in `public/`, served
              // straight off the CDN, so next/image's optimizer (a Worker
              // invocation on OpenNext) would only add a hop. The intrinsic
              // 1200×630 is stated so the card reserves its space before the
              // bytes arrive and the grid doesn't jump.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.image}
                alt={post.coverAlt}
                width={1200}
                height={630}
                // The topmost cover is above the fold on desktop and is this
                // page's likely LCP element, so it loads eagerly and at high
                // priority — deferring it would delay the very metric the
                // rest of this card's markup is arranged around. Every cover
                // below it stays lazy.
                loading={post.slug === lcpSlug ? "eager" : "lazy"}
                fetchPriority={post.slug === lcpSlug ? "high" : undefined}
                className={cn(
                  "h-auto w-full border-b object-cover",
                  bentoVariant(
                    postCells[i],
                    {
                      sm: "sm:w-2/5 sm:shrink-0 sm:self-stretch sm:border-b-0 sm:border-r",
                      lg: "lg:w-2/5 lg:shrink-0 lg:self-stretch lg:border-b-0 lg:border-r",
                    },
                    {
                      sm: "sm:w-full sm:self-auto sm:border-b sm:border-r-0",
                      lg: "lg:w-full lg:self-auto lg:border-b lg:border-r-0",
                    },
                  ),
                )}
              />
            )}
            <div className="flex flex-1 flex-col p-6">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium">
                {post.tag}
              </span>
              <span>{formatPostDate(post.date)}</span>
              <span aria-hidden>·</span>
              <span>{post.readingMinutes} min read</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">
              {post.title}
            </h2>
            <p className="mt-2 text-muted-foreground">{post.excerpt}</p>
            <span className="mt-auto pt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
              Read post
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
