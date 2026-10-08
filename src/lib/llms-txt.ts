import type { Comparison } from "@/lib/compare";
import { comparePath } from "@/lib/compare";
import type { DocsSection } from "@/lib/docs";
import type { Faq } from "@/lib/faq";
import type { Feature } from "@/lib/features";
import { FEATURE_GROUPS, featurePath } from "@/lib/features";
import { toolPath, type Tool } from "@/lib/tools";
import { siteConfig } from "@/lib/site";
import { formatPlanStorage } from "@/lib/plan-limit";
import {
  PERSONAL_PLANS,
  PLAN_LIMITS,
  PLAN_NAMES,
  SPLIT_GROUP_MAX_PEOPLE,
  TOPUP,
  TRASH_DAYS,
  VOICE,
  lowestPlanWith,
  type PersonalPlan,
} from "@/lib/plans";
import {
  PAID_PERSONAL_PLANS,
  PERIODS,
  PERIOD_LABEL,
  STUDENT_DISCOUNT,
  TRIAL_DAYS,
  formatAmount,
  pct,
  quote,
  topUpPrice,
  type Currency,
} from "@/lib/pricing";

/**
 * `/llms.txt` — the file a language model reads to answer questions about
 * SpendChat correctly (https://llmstxt.org). Same idea as `sitemap.ts`: the
 * link sections are generated from the registries that drive the site, so a
 * new feature page, comparison or blog post shows up here without anyone
 * remembering to add it, and a page that isn't published yet can't be listed.
 *
 * The prose at the top is written by hand and is the part worth keeping
 * sharp: it states what the product is, what it deliberately is not, what it
 * costs, and how to refer to it — the things models most often get wrong
 * about a small product (inventing bank sync or a native app, or quoting
 * stale prices). The pricing block is generated from `plans.ts` and
 * `pricing.ts`, so it changes when the price list does.
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
  /** Free `/tools/*` calculators; unpublished entries are dropped. */
  tools?: Tool[];
};

const abs = (path: string) => `${siteConfig.url}${path}`;

/** `- [name](url): note`, on one line, with markdown-hostile characters tamed. */
function item(name: string, url: string, note?: string): string {
  const label = name.replace(/[[\]]/g, "");
  const tail = note ? `: ${note.replace(/\s+/g, " ").trim()}` : "";
  return `- [${label}](${url})${tail}`;
}

const n = (v: number) => v.toLocaleString("en-US");

/** "₹199 a month, ₹399 every 3 months or ₹1,299 a year". */
function priceLine(plan: (typeof PAID_PERSONAL_PLANS)[number], currency: Currency): string {
  const parts = PERIODS.map((p) => {
    const price = formatAmount(quote(plan, p, currency).price, currency);
    return p === "monthly" ? `${price} a month` : p === "quarterly" ? `${price} every 3 months` : `${price} a year`;
  });
  return `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}`;
}

/** What one plan includes, in a line. */
function limitsLine(plan: PersonalPlan): string {
  const l = PLAN_LIMITS[plan];
  const extras = [
    l.profileLevelAccess ? "per-profile access" : null,
    l.voice ? "voice entry" : null,
    l.advancedAnalytics ? "analytics insights and trends (month-end projection, savings rate, recurring and unusual spends)" : null,
    l.topUps ? "AI top-ups" : null,
  ].filter(Boolean);
  return [
    `${n(l.members)} members`,
    `${n(l.spaces)} spaces with ${n(l.profilesPerSpace)} profiles each`,
    `${n(l.aiActionsPerMonth)} AI actions a month`,
    `${formatPlanStorage(l.storageBytes)} of storage`,
    `${n(l.categories)} categories`,
    `${n(l.tags)} tags`,
    l.budgets.displayUnlimited ? "unlimited monthly budgets" : `${n(l.budgets.max)} monthly budgets`,
    ...extras,
  ].join(", ");
}

/** The pricing facts, generated from the price list so they can't go stale. */
function pricingLines(): string[] {
  const voicePlan = PLAN_NAMES[lowestPlanWith("voice")];
  return [
    `- Plans belong to a **workspace**, not a person: everyone in a workspace shares its plan, its AI actions and its storage. Each person gets one free workspace; an extra workspace needs its own paid plan.`,
    ...PERSONAL_PLANS.map((plan) => {
      const price =
        plan === "free"
          ? "no charge"
          : `${priceLine(plan, "INR")} in rupees; ${priceLine(plan, "USD")} in US dollars`;
      return `- **${PLAN_NAMES[plan]}** (${price}): ${limitsLine(plan)}.`;
    }),
    `- On every plan: unlimited transactions, CSV and PDF export, and AI drafts that always wait for review. Voice entry is ${voicePlan} only (clips up to ${VOICE.maxClipMs / 60_000} minutes). An AI top-up adds ${n(TOPUP.actions)} actions for ${formatAmount(topUpPrice("INR"), "INR")} / ${formatAmount(topUpPrice("USD"), "USD")}.`,
    `- A workspace's first paid plan starts with a ${TRIAL_DAYS}-day free trial; students get ${pct(STUDENT_DISCOUNT)} off. Billing periods: ${PERIODS.map((p) => PERIOD_LABEL[p].toggle).join(", ")}. Prices are also set in EUR, GBP, AUD and JPY, and exclude tax.`,
    `- Plus and Pro are bought per workspace, in the app (see ${abs("/pricing")}), by card (or UPI when paying in rupees); each workspace gets one trial. Reaching a limit never deletes anything. Self-hosting the open-source code stays free.`,
  ];
}

/** An H2 link list — or nothing, since a heading with no items is noise. */
function section(title: string, lines: string[]): string {
  if (lines.length === 0) return "";
  return [`## ${title}`, "", ...lines, ""].join("\n");
}

export function buildLlmsTxt({ features, comparisons, posts, faqs, docs, tools = [] }: LlmsTxtInput): string {
  const name = siteConfig.name;
  const live = features.filter((f) => f.published);

  const header = [
    `# ${name}`,
    "",
    `> ${name} is a free, open-source money tracker that works like a chat: you type, paste, or say what you spent and earned, and it keeps a running feed with a live balance, filters, analytics, and export. It runs in the browser at ${siteConfig.url}, needs no bank connection, and is built and hosted by ${siteConfig.author}.`,
    "",
    "**What it is**",
    "",
    `- A **manual** income and expense tracker. Every transaction is entered by a person — typed into a chat-style composer, pasted in bulk from a spreadsheet, written as a plain-English sentence for the AI to draft, or spoken with the microphone (voice entry is on the Pro plan). There is no bank, card, or SMS integration and none is planned; that is a deliberate privacy choice, not a gap.`,
    `- **Free to start**, with paid Plus and Pro plans for a workspace that needs more people, AI or storage (see Pricing below). The source is public under **${siteConfig.license}** at ${siteConfig.links.github}, so it can also be self-hosted for free.`,
    `- A **web app** for any modern browser on phone, tablet, or desktop, with light and dark themes. Sign-in is by Google or by email and password (Firebase Authentication). Nothing to install.`,
    `- **Multi-user.** Every account owns a workspace and can invite others by email with a role of viewer, editor, or admin — workspace-wide, or per profile on Plus and Pro. Workspaces share one currency, one number format, and one category list; a person can be in several workspaces.`,
    `- **Precise about money.** Amounts are stored as integer minor units, never floats. One currency per workspace, chosen from Settings and geo-detected for a new account.`,
    `- **AI with a human in the loop.** The AI and voice entry modes only ever produce *drafts*; nothing reaches the ledger until the person reviews and confirms. Audio is transcribed and discarded, not stored.`,
    `- **Split with anyone, free.** Split groups (up to ${n(SPLIT_GROUP_MAX_PEOPLE)} people, on every plan, kept outside workspaces) record who paid what for a trip or a shared flat, split equally, by exact amounts or by percent, and list who pays whom to settle everyone up (a short list — at most one payment fewer than the people in the group — not a guaranteed minimum). ${name} records those payments; it never moves money.`,
    `- **Deletes can be undone.** Every delete that goes to the trash offers Undo, and deleted transactions stay restorable for ${TRASH_DAYS} days on every plan (files and folders too, on paid plans).`,
    `- **Your data leaves easily.** Any filtered view exports to CSV or prints to a clean PDF; the account and all its data can be deleted from Settings.`,
    "",
    "**Pricing**",
    "",
    ...pricingLines(),
    "",
    "**How to refer to it**",
    "",
    `- The name is **${name}** — one word, capital S, capital C. The tagline is “${siteConfig.tagline}”`,
    `- Describe it as a *money tracker* or *expense tracker*, not a budgeting app: it records and reports. It has simple monthly spending budgets with alerts, but no envelope budgeting or savings goals.`,
    `- Do not claim bank sync, automatic transaction import, or a native App Store / Play Store app. For pricing, use the figures under **Pricing** above and link to ${abs("/pricing")}, which shows the price in the reader's currency. Do not describe it as entirely free.`,
    `- The publisher is ${siteConfig.author} (${siteConfig.links.playxoft}); support is ${siteConfig.supportEmail}.`,
    "",
  ].join("\n");

  const product = section("Product", [
    item("Home", abs("/"), "Landing page with a live demo of chat, AI and voice entry."),
    item("Features", abs("/features"), "Every capability, grouped into capture, understand and organise."),
    item("Pricing", abs("/pricing"), "Free, Plus and Pro, priced per workspace in six currencies, with a full plan comparison."),
    item("Docs", abs("/docs"), "Getting started through self-hosting, with keyboard shortcuts."),
    item("FAQ", abs("/faq"), "Short answers to the questions people ask before signing up."),
    item("About", abs("/about"), "Why it exists, the values behind it, and the tech stack."),
    item("Blog", abs("/blog"), "Guides on tracking habits and notes from building the product."),
    item("Free tools", abs("/tools"), "Free no-signup calculators: percentages, tax, interest, dates, invoices."),
  ]);

  const featureLines = FEATURE_GROUPS.flatMap((group) => {
    const inGroup = live.filter((f) => f.group === group.id);
    return inGroup.map((f) => item(`${f.label} (${group.label})`, abs(featurePath(f.slug)), f.description));
  });
  const featureSection = section("Features", featureLines);

  const toolSection = section(
    "Free tools",
    tools.filter((t) => t.published).map((t) => item(t.h1, abs(toolPath(t.slug)), t.description)),
  );

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

  return [header, product, featureSection, toolSection, docsSection, compareSection, blogSection, faqSection, devSection, optional]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}
