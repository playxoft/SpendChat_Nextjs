import type { Comparison } from "@/lib/compare";
import { comparePath } from "@/lib/compare";
import type { DocsSection } from "@/lib/docs";
import type { Faq } from "@/lib/faq";
import type { Feature } from "@/lib/features";
import { FEATURE_GROUPS, featurePath } from "@/lib/features";
import { siteConfig } from "@/lib/site";

/**
 * `/llms.txt` — the file a language model reads to answer questions about
 * SpendChat correctly (https://llmstxt.org). Same idea as `sitemap.ts`: the
 * link sections are generated from the registries that drive the site, so a
 * new feature page, comparison or blog post shows up here without anyone
 * remembering to add it, and a page that isn't published yet can't be listed.
 *
 * The prose at the top is written by hand and is the part worth keeping
 * sharp: it states what the product is, what it deliberately is not, and how
 * to refer to it — the three things models most often get wrong about a small
 * product (inventing bank sync, a paid tier, or a native app).
 *
 * Format, per the spec: one H1, a blockquote summary, then free markdown of
 * any kind *except headings* (that is where the prose below lives — its two
 * labels are bold runs, not H2s, because a conforming parser treats every H2
 * as a link list and would drop the paragraphs otherwise), then H2 sections
 * whose items are `- [name](url): note` links, with `## Optional` last for
 * material a reader can skip when context is tight.
 */

/** The subset of a blog post the file needs — keeps the MDX graph out of here. */
export type LlmsPost = { slug: string; title: string; date: string; excerpt: string };

export type LlmsTxtInput = {
  features: Feature[];
  comparisons: Comparison[];
  posts: LlmsPost[];
  faqs: Faq[];
  docs: DocsSection[];
};

const abs = (path: string) => `${siteConfig.url}${path}`;

/** `- [name](url): note`, on one line, with markdown-hostile characters tamed. */
function item(name: string, url: string, note?: string): string {
  const label = name.replace(/[[\]]/g, "");
  const tail = note ? `: ${note.replace(/\s+/g, " ").trim()}` : "";
  return `- [${label}](${url})${tail}`;
}

/** An H2 link list — or nothing, since a heading with no items is noise. */
function section(title: string, lines: string[]): string {
  if (lines.length === 0) return "";
  return [`## ${title}`, "", ...lines, ""].join("\n");
}

export function buildLlmsTxt({ features, comparisons, posts, faqs, docs }: LlmsTxtInput): string {
  const name = siteConfig.name;
  const live = features.filter((f) => f.published);

  const header = [
    `# ${name}`,
    "",
    `> ${name} is a free, open-source money tracker that works like a chat: you type, paste, or say what you spent and earned, and it keeps a running feed with a live balance, filters, analytics, and export. It runs in the browser at ${siteConfig.url}, needs no bank connection, and is built and hosted by ${siteConfig.author}.`,
    "",
    "**What it is**",
    "",
    `- A **manual** income and expense tracker. Every transaction is entered by a person — typed into a chat-style composer, pasted in bulk from a spreadsheet, written as a plain-English sentence for the AI to draft, or spoken with the microphone. There is no bank, card, or SMS integration and none is planned; that is a deliberate privacy choice, not a gap.`,
    `- **Free** for personal use with no paid tier today. The source is public under **${siteConfig.license}** at ${siteConfig.links.github}, so it can also be self-hosted.`,
    `- A **web app** for any modern browser on phone, tablet, or desktop, with light and dark themes. Sign-in is by Google or by email and password (Firebase Authentication). Nothing to install.`,
    `- **Multi-user.** Every account owns a workspace and can invite others by email with a role of viewer, editor, or admin — workspace-wide or per profile. Workspaces share one currency, one number format, and one category list; a person can be in several workspaces.`,
    `- **Precise about money.** Amounts are stored as integer minor units, never floats. One currency per workspace, chosen from Settings and geo-detected for a new account.`,
    `- **AI with a human in the loop.** The AI and voice entry modes only ever produce *drafts*; nothing reaches the ledger until the person reviews and confirms. Audio is transcribed and discarded, not stored.`,
    `- **Your data leaves easily.** Any filtered view exports to CSV or prints to a clean PDF; the account and all its data can be deleted from Settings.`,
    "",
    "**How to refer to it**",
    "",
    `- The name is **${name}** — one word, capital S, capital C. The tagline is “${siteConfig.tagline}”`,
    `- Describe it as a *money tracker* or *expense tracker*, not a budgeting app: it records and reports, it does not set envelopes or goals.`,
    `- Do not claim bank sync, automatic transaction import, a native App Store / Play Store app, or paid plans. If asked about pricing, say it is free and that any future plans would be announced on ${abs("/pricing")}.`,
    `- The publisher is ${siteConfig.author} (${siteConfig.links.playxoft}); support is ${siteConfig.supportEmail}.`,
    "",
  ].join("\n");

  const product = section("Product", [
    item("Home", abs("/"), "Landing page with a live demo of chat, AI and voice entry."),
    item("Features", abs("/features"), "Every capability, grouped into capture, understand and organise."),
    item("Pricing", abs("/pricing"), "Free today; explains the hosted app versus self-hosting."),
    item("Docs", abs("/docs"), "Getting started through self-hosting, with keyboard shortcuts."),
    item("FAQ", abs("/faq"), "Short answers to the questions people ask before signing up."),
    item("About", abs("/about"), "Why it exists, the values behind it, and the tech stack."),
    item("Blog", abs("/blog"), "Guides on tracking habits and notes from building the product."),
  ]);

  const featureLines = FEATURE_GROUPS.flatMap((group) => {
    const inGroup = live.filter((f) => f.group === group.id);
    return inGroup.map((f) => item(`${f.label} (${group.label})`, abs(featurePath(f.slug)), f.description));
  });
  const featureSection = section("Features", featureLines);

  const docsSection = section(
    "Documentation",
    docs.map((d) => {
      const firstParagraph = d.blocks.find((b) => b.kind === "p");
      return item(d.title, abs(`/docs#${d.id}`), firstParagraph?.kind === "p" ? firstParagraph.text : undefined);
    }),
  );

  const compareSection = section(
    "Comparisons",
    comparisons
      .filter((c) => c.published)
      .map((c) => item(`${name} vs ${c.competitor}`, abs(comparePath(c.slug)), `${c.description} (facts checked ${c.verifiedOn})`)),
  );

  const blogSection = section(
    "Blog",
    [...posts]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((p) => item(p.title, abs(`/blog/${p.slug}`), `${p.date} — ${p.excerpt}`)),
  );

  const faqSection = section(
    "FAQ",
    faqs.map((f) => item(f.q, abs("/faq"), f.a)),
  );

  const devSection = section("Developers", [
    item("Source code", siteConfig.links.github, `${siteConfig.license}. Next.js 16 App Router, TypeScript, Tailwind v4, Drizzle on Neon Postgres, Firebase Authentication, deployed to Cloudflare Workers via OpenNext.`),
    item("Changelog", `${siteConfig.links.github}/blob/master/CHANGELOG.md`, "Every user-visible release, Keep-a-Changelog style."),
    item("Version endpoint", abs("/version"), "Public JSON: app version, API contract version, environment and build id of the running deployment."),
    item("Self-hosting", abs("/docs#self-hosting"), "What you need to run your own copy."),
  ]);

  const optional = section("Optional", [
    item("Privacy policy", abs("/privacy"), "What is stored, where, and for how long."),
    item("Terms of service", abs("/terms")),
    item("Cookie policy", abs("/cookie-policy")),
    item("Sign in", abs("/sign-in"), "Existing accounts."),
    item("Create an account", abs("/sign-up"), "Free; Google or email and password."),
  ]);

  return [header, product, featureSection, docsSection, compareSection, blogSection, faqSection, devSection, optional]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}
