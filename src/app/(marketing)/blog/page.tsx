import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessageSquarePlus, Newspaper, Rss } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { InvitationCard } from "@/components/marketing/invitation-card";
import { getPosts, formatPostDate } from "@/lib/blog";
import { bentoTail } from "@/lib/grid-fill";
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
  // Every post card stays one column wide (see the grid comment below), so the
  // remainder falls to the last of the two cards after them. Computed from the
  // post count rather than written out, because the count differs between dev
  // and production — `getPosts` drops drafts only in production — and a span
  // tuned by hand to what renders locally is a hole on the live site.
  const tail = bentoTail(posts.length + 2, { sm: 2, lg: 3 });

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

      {/* Post grid — every card the same width, 3 across on large screens. A
          chronological list reads as a list: widening the newest posts to
          square the rows off made the first two rows look like a different,
          two-column layout, which is worse than the gap it was closing. The
          two cards after the posts fill the remainder instead. */}
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            // `overflow-hidden` on the card and no padding of its own: the
            // cover runs edge to edge and the card's own radius clips its
            // corners, so there's no seam between the two. Padding moves to the
            // text block below.
            className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-md"
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
                className="h-auto w-full border-b"
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

        {/* Two cards, not filler: the feed had no link anywhere on the page it
            belongs to — only a <link rel="alternate"> no reader ever sees — and
            what somebody wants written about is worth asking for. They sit
            after the posts and carry the remainder the post count leaves.
            Muted and dashed, so neither is mistaken for a post. */}
        <InvitationCard
          icon={Rss}
          size="lg"
          title="Follow by RSS"
          body="New posts in your own reader, with nothing to sign up for and no email address to hand over."
          cta="Grab the feed"
          href="/blog/rss.xml"
          event="nav_link_click"
          params={{ location: "blog_index", label: "rss" }}
        />

        {/* The only card on this page that isn't one column wide: the posts
            plus these two cards rarely divide by both two and three, and
            widening the last one — a call to action, at the very end, after
            every post — closes the row without making any row of posts look
            like a different layout. `bentoTail` works the span out from the
            post count, so a fourteenth post doesn't reopen the gap. */}
        <InvitationCard
          icon={MessageSquarePlus}
          size="lg"
          title="Something you want covered?"
          body={
            <>
              Tell us what you&apos;re trying to work out about tracking money
              and we&apos;ll write it up properly.
            </>
          }
          cta="Suggest a topic"
          href={siteConfig.links.githubIssues}
          external
          event="outbound_click"
          params={{ destination: "github_issues", location: "blog_index" }}
          className={tail.span}
        />
      </div>
    </div>
  );
}
