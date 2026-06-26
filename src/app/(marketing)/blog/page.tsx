import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { getPosts, formatPostDate } from "@/lib/blog";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Updates, ideas, and notes from the team behind SpendChat — a minimal, open-source money tracker.",
  alternates: {
    canonical: "/blog",
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
      url: `${siteConfig.url}/blog/${post.slug}`,
    })),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:pt-16">
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

      {/* Post list */}
      <div className="mt-12 space-y-4">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group block rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
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
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
              Read post
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
