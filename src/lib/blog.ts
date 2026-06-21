import type { ComponentType } from "react";
import * as conversation from "@/content/blog/track-your-money-like-a-conversation.mdx";
import * as openSource from "@/content/blog/moneytracker-is-now-open-source.mdx";
import * as introducing from "@/content/blog/introducing-moneytracker.mdx";

/** Frontmatter exported from each post's `.mdx` file as `export const meta`. */
export type BlogMeta = {
  title: string;
  /** ISO date (YYYY-MM-DD). ISO strings sort lexically, so no Date needed. */
  date: string;
  /** ISO date of the last meaningful edit, if any (used for `dateModified`). */
  updated?: string;
  readingMinutes: number;
  tag: string;
  excerpt: string;
  /** Defaults to the site author. */
  author?: string;
  /** Hidden in production, shown in dev so you can preview before publishing. */
  draft?: boolean;
  /** Root-relative or absolute social image; falls back to the site default. */
  image?: string;
};

export type BlogPost = BlogMeta & {
  slug: string;
  /** The rendered MDX body (the file's default export). */
  Component: ComponentType;
};

type MdxModule = { default: ComponentType; meta: BlogMeta };

/**
 * The post registry: each URL slug paired with its imported MDX module. Posts
 * are imported statically (no `fs`, no dynamic `import()`) so the whole blog
 * compiles to static HTML at build time — which is what keeps it cheap and
 * safe on Cloudflare Workers. Add a post by dropping an `.mdx` file in
 * `src/content/blog` and adding one line here.
 */
const registry: { slug: string; mod: MdxModule }[] = [
  { slug: "track-your-money-like-a-conversation", mod: conversation },
  { slug: "moneytracker-is-now-open-source", mod: openSource },
  { slug: "introducing-moneytracker", mod: introducing },
];

const isProd = process.env.NODE_ENV === "production";

/** Visible posts, newest first. Drafts are dropped in production builds. */
const posts: BlogPost[] = registry
  .map(({ slug, mod }) => ({ slug, Component: mod.default, ...mod.meta }))
  .filter((post) => !isProd || !post.draft)
  .sort((a, b) => (a.date < b.date ? 1 : -1));

export function getPosts(): BlogPost[] {
  return posts;
}

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((post) => post.slug === slug);
}

/** Human-readable date, e.g. "June 15, 2026". */
export function formatPostDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
