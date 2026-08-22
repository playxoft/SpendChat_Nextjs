import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { getPosts, formatPostDate } from "@/lib/blog";
import { createMetadata } from "@/lib/seo";
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
      // Absolute, as schema.org requires — a relative URL is silently dropped.
      image: `${siteConfig.url}${post.image ?? siteConfig.ogImage}`,
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

      {/* Post grid — 3 across on large screens (3x3 once there are 9 posts) */}
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group flex flex-col rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
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
                alt={post.title}
                width={1200}
                height={630}
                loading="lazy"
                className="mb-5 h-auto w-full rounded-xl border"
              />
            )}
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
          </Link>
        ))}
      </div>
    </div>
  );
}
