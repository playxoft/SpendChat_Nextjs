/**
 * The feature-page registry — one entry per `/features/<slug>` page.
 *
 * Everything downstream reads from here: the `/features` hub, the nav's
 * Features menu, `src/app/sitemap.ts`, and each page's "Related features"
 * block. Adding a page is one entry plus the page file, not five edits — which
 * is the point, because the failure mode we're guarding against is a page that
 * exists but is orphaned (no internal links, never crawled, never indexed).
 *
 * Deliberately dependency-free: no React, no `lucide-react`. `sitemap.ts` is a
 * Worker route and only needs the slugs, so icons are named here as strings and
 * resolved to components in `src/components/marketing/feature-icon.tsx`.
 */

/** Where a feature sits in the three-column Features menu and on the hub. */
export type FeatureGroup = "capture" | "understand" | "organise";

export const FEATURE_GROUPS: { id: FeatureGroup; label: string; blurb: string }[] = [
  {
    id: "capture",
    label: "Capture",
    blurb: "Four ways to get a transaction in — pick whichever is fastest right now.",
  },
  {
    id: "understand",
    label: "Understand",
    blurb: "Find any transaction, see where the money went, and take it with you.",
  },
  {
    id: "organise",
    label: "Organise",
    blurb: "Keep separate books, share them on your terms, and move at speed.",
  },
];

export type Feature = {
  /** Path segment under `/features`. Keyword-shaped on purpose — it's a ranking signal. */
  slug: string;
  /** Short label for the nav and hub cards. */
  label: string;
  /** `<title>`, without the site name (the root template appends " — SpendChat"). */
  title: string;
  /** The page's single `<h1>`. Written as a sentence, not a keyword string. */
  h1: string;
  /** Meta description — 50–160 chars, this is the Google snippet. */
  description: string;
  /** One-line blurb for hub cards and the nav menu. */
  blurb: string;
  /** Icon name resolved by `feature-icon.tsx`. */
  icon: string;
  group: FeatureGroup;
  /** Sibling slugs to surface in this page's "Related features" block. */
  related: string[];
  /**
   * Flip to `true` in the same change that adds the page file. While `false` the
   * entry is invisible everywhere — hub, nav, and sitemap all filter on it — so
   * the registry can describe the whole roadmap without shipping 404s or,
   * worse, sitemap entries that resolve to nothing (a crawl-budget leak that
   * Search Console reports as "Submitted URL not found").
   */
  published: boolean;
};

export const FEATURES: Feature[] = [
  // ---- Capture ----
  {
    slug: "chat-expense-tracker",
    label: "Chat entry",
    title: "Chat Expense Tracker — Log Money Like Texting",
    h1: "Track expenses like you'd text a friend",
    description:
      "Log an expense the way you send a message: amount, category, send. A running feed of income and expenses with a live balance. Free, no bank connection.",
    blurb: "Amount, category, send. Your money as a running conversation.",
    icon: "MessageSquare",
    group: "capture",
    related: ["ai-expense-tracker", "voice-expense-tracker", "bulk-add", "transactions"],
    published: true,
  },
  {
    slug: "ai-expense-tracker",
    label: "AI entry",
    title: "AI Expense Tracker — Type It in Plain English",
    h1: "Write it how you'd say it. The AI does the rest.",
    description:
      "Type “coffee 4.50 and 62 on groceries” and the AI turns it into categorised transactions you review before saving. Free AI expense tracking, with a human check.",
    blurb: "Type a messy sentence. Get clean, categorised drafts to approve.",
    icon: "Sparkles",
    group: "capture",
    related: ["voice-expense-tracker", "chat-expense-tracker", "categories", "privacy-and-security"],
    published: true,
  },
  {
    slug: "voice-expense-tracker",
    label: "Voice entry",
    title: "Voice Expense Tracker — Say It, Don't Type It",
    h1: "Say what you spent. In any language you speak.",
    description:
      "Hold one key and speak your expense. SpendChat transcribes it, drafts the transaction, and waits for your OK. Handles mixed languages, not just English.",
    blurb: "Hold M, speak, done — in the languages you actually mix.",
    icon: "Mic",
    group: "capture",
    related: ["ai-expense-tracker", "chat-expense-tracker", "privacy-and-security", "multiple-profiles"],
    published: true,
  },
  {
    slug: "bulk-add",
    label: "Bulk add",
    title: "Bulk Import Expenses from a Spreadsheet",
    h1: "Paste a year of expenses in one go",
    description:
      "Paste rows straight from a spreadsheet or notes app. SpendChat parses them into a preview you can fix, and nothing is saved until you say so.",
    blurb: "Paste rows from a spreadsheet, fix the preview, import.",
    icon: "ListPlus",
    group: "capture",
    related: ["chat-expense-tracker", "transactions", "categories", "export-and-print"],
    published: true,
  },

  // ---- Understand ----
  {
    slug: "transactions",
    label: "Transactions",
    title: "Transaction History — Filter, Search, Sort",
    h1: "Every transaction, exactly how you want to see it",
    description:
      "A sortable table of everything you've logged. Filter by date range, type and category, search your notes, and choose which columns you see.",
    blurb: "A table view with filters, note search and custom columns.",
    icon: "Table2",
    group: "understand",
    related: ["analytics", "export-and-print", "chat-expense-tracker", "categories"],
    published: true,
  },
  {
    slug: "analytics",
    label: "Analytics",
    title: "Spending Analytics — Where Your Money Goes",
    h1: "See where the money actually went",
    description:
      "A category breakdown, a month-by-month trend, and income against expenses — for any date range you pick. No dashboards to configure.",
    blurb: "Category breakdown and monthly trends for any date range.",
    icon: "ChartColumn",
    group: "understand",
    related: ["transactions", "multiple-profiles", "export-and-print", "categories"],
    published: true,
  },
  {
    slug: "receipts-and-files",
    label: "Receipts & files",
    title: "Receipt Storage for Bills and Invoices",
    h1: "Keep the receipt with the expense",
    description:
      "Attach receipts, bills and invoices to any transaction, or keep them in a Drive-style vault with folders, colour tags and share links. 1 GB per workspace.",
    blurb: "Attach receipts to transactions; keep the rest in a tagged vault.",
    icon: "Paperclip",
    group: "understand",
    related: ["transactions", "workspaces", "export-and-print", "privacy-and-security"],
    published: true,
  },
  {
    slug: "export-and-print",
    label: "Export & print",
    title: "Export Expenses to CSV, or Print a Report",
    h1: "Your data leaves as easily as it arrives",
    description:
      "Download the exact view you're looking at as a CSV, or print a clean report and save it as a PDF. No export limits, no paid tier, no lock-in.",
    blurb: "CSV of the filtered view, or a print-ready PDF report.",
    icon: "Download",
    group: "understand",
    related: ["transactions", "analytics", "privacy-and-security", "bulk-add"],
    published: false,
  },

  // ---- Organise ----
  {
    slug: "multiple-profiles",
    label: "Profiles",
    title: "Expense Tracker with Multiple Profiles",
    h1: "One app, separate books",
    description:
      "Give each part of your life its own profile — Personal, Home, Business — each with its own feed, balance and reports. Switch with a single keystroke.",
    blurb: "Separate feeds and balances for personal, home and business.",
    icon: "Users",
    group: "organise",
    related: ["workspaces", "analytics", "transactions", "chat-expense-tracker"],
    published: true,
  },
  {
    slug: "workspaces",
    label: "Workspaces",
    title: "Shared Expense Tracking for Families",
    h1: "Share the books without sharing your password",
    description:
      "Invite your partner, family or accountant to a workspace and choose what each of them can do — view, edit or administer. Shared categories and currency.",
    blurb: "Invite people to a shared workspace with viewer/editor/admin roles.",
    icon: "Building2",
    group: "organise",
    related: ["multiple-profiles", "categories", "privacy-and-security", "receipts-and-files"],
    published: false,
  },
  {
    slug: "categories",
    label: "Categories",
    title: "Custom Expense Categories, Your Way",
    h1: "Categories that match how you actually spend",
    description:
      "Start from a sensible default set, then rename, re-icon and add your own. Categories are shared across everyone in a workspace, so reports always line up.",
    blurb: "Rename, re-icon and add your own — shared across the workspace.",
    icon: "Tags",
    group: "organise",
    related: ["chat-expense-tracker", "analytics", "workspaces", "ai-expense-tracker"],
    published: false,
  },
  {
    slug: "keyboard-shortcuts",
    label: "Shortcuts",
    title: "Keyboard Shortcuts — Log Without the Mouse",
    h1: "Built for people who'd rather not touch the mouse",
    description:
      "Single keys jump between views and start an entry; ⌘/Ctrl combos send it. Press / for the full cheat sheet. Every shortcut adapts to your platform.",
    blurb: "Single-key navigation, ⌘/Ctrl to send, / for the cheat sheet.",
    icon: "Keyboard",
    group: "organise",
    related: ["chat-expense-tracker", "multiple-profiles", "bulk-add", "transactions"],
    published: false,
  },
  {
    slug: "privacy-and-security",
    label: "Privacy & security",
    title: "Private Expense Tracking, No Bank Login",
    h1: "We never ask for your bank login",
    description:
      "No bank credentials, no data selling, no ads in the app. Every query is scoped to your account, and the whole thing is open source so you can check.",
    blurb: "No bank credentials, no ads, no data selling — and open source.",
    icon: "ShieldCheck",
    group: "organise",
    related: ["voice-expense-tracker", "ai-expense-tracker", "export-and-print", "workspaces"],
    published: false,
  },
];

/**
 * Live pages only. Everything user-facing must go through this, never
 * `FEATURES` directly.
 *
 * Each helper takes the registry as an optional argument. That's for the tests:
 * these functions encode rules about how pages link to each other, and those
 * rules need checking against fixtures rather than against whatever happens to
 * be published this week — otherwise the interesting paths (a page whose
 * siblings are half-published, say) are untestable until rollout happens to
 * produce that state.
 */
export function publishedFeatures(from: Feature[] = FEATURES): Feature[] {
  return from.filter((f) => f.published);
}

export function getFeature(
  slug: string,
  from: Feature[] = FEATURES,
): Feature | undefined {
  return publishedFeatures(from).find((f) => f.slug === slug);
}

/** Published features for one group, in registry order. */
export function featuresInGroup(
  group: FeatureGroup,
  from: Feature[] = FEATURES,
): Feature[] {
  return publishedFeatures(from).filter((f) => f.group === group);
}

/**
 * The "Related features" set for a page: its declared siblings, filtered to
 * published ones and topped up from anywhere in the registry if that leaves
 * fewer than `min`.
 *
 * The top-up is what matters during rollout. Early on, most of a page's
 * declared siblings don't exist yet — the chat page names four, three of which
 * ship weeks later — and a page with one outbound internal link is a dead end
 * for a reader and a crawl cul-de-sac for Google. Better a slightly arbitrary
 * third link than a page that goes nowhere.
 */
export function relatedFeatures(
  slug: string,
  min = 3,
  from: Feature[] = FEATURES,
): Feature[] {
  const live = publishedFeatures(from);
  const self = live.find((f) => f.slug === slug);
  if (!self) return [];

  const picked = self.related
    .map((s) => live.find((f) => f.slug === s))
    .filter((f): f is Feature => Boolean(f));

  if (picked.length >= min) return picked;

  const seen = new Set([slug, ...picked.map((f) => f.slug)]);
  const fillers = live.filter((f) => !seen.has(f.slug));
  return [...picked, ...fillers.slice(0, min - picked.length)];
}

/** Absolute-from-root path for a feature page. */
export function featurePath(slug: string): string {
  return `/features/${slug}`;
}

/**
 * A link target that is never a 404: the feature's own page once it exists, and
 * the hub until then.
 *
 * Prose across the site refers to features by name — "see custom categories",
 * "more on analytics" — and those sentences get written before the page they
 * point at exists. Hard-coding `/features/categories` in that situation ships a
 * broken link, which costs a reader their place and tells Google the site is
 * poorly maintained. Routing to the hub keeps the sentence intact and the link
 * useful, and it upgrades itself the moment the page is published.
 *
 * Use this for *references*. Use `featurePath` where the page is known to exist
 * (a card in the hub, an entry in the nav), since those already filter on
 * `published`.
 */
export function featureLink(slug: string): string {
  return getFeature(slug) ? featurePath(slug) : "/features";
}
