import type { ComponentType } from "react";
import type { Faq } from "@/lib/seo";
import * as openSourceGuide from "@/content/blog/open-source-expense-tracker.mdx";
import * as csvTaxes from "@/content/blog/export-expenses-to-csv-for-taxes.mdx";
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
  faqs?: Faq[];
  /**
   * The post's cover: shown on the index card and above the article, and used
   * as its social preview. Root-relative or absolute; falls back to the shared
   * site card. Generate it with `scripts/blog-image.html` (1200×630, dark) —
   * see that file's header comment for the Chrome command.
   */
  image?: string;
  /**
   * Alt text for the cover, when the card shows something worth describing.
   *
   * Leaving it out is the normal case and is not a gap: the covers we generate
   * are title cards, so beside the headline they are decorative and
   * `BlogPost.coverAlt` resolves to `""`. Set this when the cover carries
   * content the prose doesn't — a chart, a screenshot, a before/after — and
   * describe what it shows, not that it is an image. It is also what a chat
   * preview announces (see `socialCoverAlt`), where the card stands alone.
   */
  imageAlt?: string;
};

export type BlogPost = BlogMeta & {
  slug: string;
  /** The rendered MDX body (the file's default export). */
  Component: ComponentType;
  /**
   * Alt text for the cover **where it appears beside the headline** — the
   * article page and the index card. Derived once here because those two and
   * the social card each used to decide it for themselves, and they disagreed.
   *
   * Empty when a post declares no `imageAlt`, which marks the image decorative.
   * That is the honest answer for the covers we generate: they are title cards
   * whose content *is* the headline, printed again as the `<h1>` directly below
   * on the post and as the card title on the index. Alt text repeating it makes
   * a screen reader read the same sentence twice and tells a crawler nothing it
   * did not already have. A cover that shows something else says so in
   * `imageAlt`, and that wins.
   */
  coverAlt: string;
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
  { slug: "open-source-expense-tracker", mod: openSourceGuide },
  { slug: "export-expenses-to-csv-for-taxes", mod: csvTaxes },
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
  .map(({ slug, mod }) => ({
    slug,
    Component: mod.default,
    ...mod.meta,
    coverAlt: mod.meta.imageAlt ?? "",
  }))
  .filter((post) => !isProd || !post.draft)
  // `localeCompare` rather than `a.date < b.date ? 1 : -1`: that form never
  // returns 0, so two posts sharing a date make an inconsistent comparator and
  // the engine may order them either way between builds — which would move the
  // index, the RSS item order and the eager-loaded LCP cover with it.
  .sort((a, b) => b.date.localeCompare(a.date));

/**
 * Alt text for the cover **as a social card** — a different question from
 * `coverAlt`, and the reason the two are not one field.
 *
 * In a chat preview the image is shown on its own, with no `<h1>` beside it, so
 * the duplication that makes `coverAlt` empty simply isn't there: an empty
 * `og:image:alt` would drop the only description the card has. The headline is
 * a good description of a title card, so it stands in when the post declares
 * nothing better.
 */
export function socialCoverAlt(post: BlogPost): string {
  return post.imageAlt || post.title;
}

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
