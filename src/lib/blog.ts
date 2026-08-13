import type { ComponentType } from "react";
import * as receipts from "@/content/blog/how-to-organize-receipts-digitally.mdx";
import * as sharedExpenses from "@/content/blog/how-to-track-shared-expenses-with-your-partner.mdx";
import * as categorising from "@/content/blog/how-to-categorize-expenses.mdx";
import * as spreadsheet from "@/content/blog/spreadsheet-vs-expense-tracker-app.mdx";
import * as noBankConnection from "@/content/blog/expense-tracker-without-bank-connection.mdx";
import * as voiceLanguages from "@/content/blog/voice-expense-tracking-in-any-language.mdx";
import * as aiTracking from "@/content/blog/how-to-track-expenses-with-ai.mdx";
import * as conversation from "@/content/blog/track-your-money-like-a-conversation.mdx";
import * as openSource from "@/content/blog/spendchat-is-now-open-source.mdx";
import * as introducing from "@/content/blog/introducing-spendchat.mdx";

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
  /**
   * Q&As for the post, rendered visibly at the foot of the article *and* as
   * `FAQPage` structured data — both from this one array, so the two can never
   * disagree.
   *
   * That single source is the point. Marking up questions that aren't on the
   * page is a documented spam pattern, and the way it happens in practice is
   * never malice: someone edits the visible copy and forgets the JSON-LD
   * beside it. Keeping the FAQ in frontmatter rather than in the MDX body
   * makes that edit impossible to get wrong.
   *
   * Write answers as plain prose that stands alone — a rich result shows the
   * answer without the paragraph above it.
   */
  faqs?: { q: string; a: string }[];
  /**
   * The post's cover: shown on the index card and above the article, and used
   * as its social preview. Root-relative or absolute; falls back to the shared
   * site card. Generate it with `scripts/blog-image.html` (1200×630, dark) —
   * see that file's header comment for the Chrome command.
   */
  image?: string;
  /**
   * Alt text for the cover.
   *
   * Without this the cover falls back to the post title — which is printed as
   * the `<h1>` immediately above the image, so a screen reader hears the same
   * sentence twice and a crawler sees the title repeated in alt. Describe what
   * the card actually shows instead, or set it to `""` to mark a purely
   * decorative cover as decorative, which is more honest than a duplicate.
   */
  imageAlt?: string;
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
  { slug: "how-to-organize-receipts-digitally", mod: receipts },
  { slug: "how-to-track-shared-expenses-with-your-partner", mod: sharedExpenses },
  { slug: "how-to-categorize-expenses", mod: categorising },
  { slug: "spreadsheet-vs-expense-tracker-app", mod: spreadsheet },
  { slug: "expense-tracker-without-bank-connection", mod: noBankConnection },
  { slug: "voice-expense-tracking-in-any-language", mod: voiceLanguages },
  { slug: "how-to-track-expenses-with-ai", mod: aiTracking },
  { slug: "track-your-money-like-a-conversation", mod: conversation },
  { slug: "spendchat-is-now-open-source", mod: openSource },
  { slug: "introducing-spendchat", mod: introducing },
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
