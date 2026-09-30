/**
 * The free-tools registry — one entry per `/tools/<slug>` page.
 *
 * Same discipline as `src/lib/features.ts`: the `/tools` hub, the sitemap, and
 * each tool's "Related tools" block all read from here, so a new tool is one
 * entry plus its page file. A tool that exists but is linked from nowhere is
 * the failure this guards against — it never gets crawled.
 *
 * Deliberately dependency-free (no React): `sitemap.ts` only needs the slugs.
 * Each card's picture lives in `src/components/tools/tool-previews.tsx`.
 */

/** Where a tool sits on the `/tools` hub. */
export type ToolGroup = "everyday" | "dates" | "grow" | "debt" | "business";

export const TOOL_GROUPS: { id: ToolGroup; label: string; blurb: string }[] = [
  // First: the invoice and quotation generators are the tools people come back to.
  {
    id: "business",
    label: "Invoices & quotes",
    blurb: "Paperwork for freelancers and small businesses.",
  },
  {
    id: "everyday",
    label: "Everyday maths",
    blurb: "Percentages, tax, and the numbers on a bill.",
  },
  {
    id: "dates",
    label: "Dates",
    blurb: "Count days to a deadline, a due date or a birthday.",
  },
  {
    id: "grow",
    label: "Saving & investing",
    blurb: "See what regular saving grows into.",
  },
  {
    id: "debt",
    label: "Loans & debt",
    blurb: "Know what borrowing really costs before you sign.",
  },
];

export type Tool = {
  /** Path segment under `/tools`. Keyword-shaped on purpose — it's a ranking signal. */
  slug: string;
  /** Short label for hub cards and breadcrumbs. */
  label: string;
  /** `<title>`, without the site name (the root template appends " — SpendChat"). */
  title: string;
  /** The page's single `<h1>` — the primary search phrase, written plainly. */
  h1: string;
  /** Meta description — 50–160 chars, this is the Google snippet. */
  description: string;
  /** One-line blurb for hub cards. */
  blurb: string;
  /** The hub card's button — a verb for what the tool does ("Calculate GST"). */
  action: string;
  group: ToolGroup;
  /** Sibling slugs to surface in this page's "Related tools" block. */
  related: string[];
  /**
   * Extra words the `/tools` search should match — the names people actually
   * type ("gst", "cheque", "bill") that aren't already in the label or blurb.
   */
  keywords?: string[];
  /**
   * Flip to `true` in the same change that adds the page file. While `false`
   * the entry is invisible to the hub, related blocks and the sitemap.
   */
  published: boolean;
};

export const TOOLS: Tool[] = [
  // ---- Everyday maths ----
  {
    slug: "percentage-calculator",
    label: "Percentage calculator",
    title: "Percentage Calculator — %, Increase & Change",
    h1: "Percentage calculator",
    description:
      "Find X% of Y, what percent one number is of another, percentage increase or decrease, percent change and discounts — with the working shown. Free, no sign-up.",
    blurb: "X% of Y, % change, increase, decrease and discounts.",
    action: "Calculate percentage",
    group: "everyday",
    related: [
      "vat-calculator",
      "compound-interest-calculator",
      "credit-card-payoff-calculator",
      "amount-in-words",
    ],
    keywords: ["percent", "discount", "increase", "decrease", "change", "markup"],
    published: true,
  },
  {
    slug: "vat-calculator",
    label: "GST & VAT calculator",
    title: "GST & VAT Calculator — Add or Remove Tax",
    h1: "GST & VAT calculator",
    description:
      "Add or remove GST or VAT — inclusive, exclusive and reverse GST — with the CGST/SGST/IGST split and 75 countries' rates preset. Free tax calculator, no sign-up.",
    blurb: "Add or remove tax, with country rates preset.",
    action: "Calculate GST / VAT",
    group: "everyday",
    related: [
      "percentage-calculator",
      "invoice-generator",
      "amount-in-words",
      "electricity-cost-calculator",
    ],
    keywords: ["gst", "vat", "sales tax", "tax", "reverse", "cgst", "sgst", "igst"],
    published: true,
  },
  {
    slug: "amount-in-words",
    label: "Amount in words",
    title: "Number to Words Converter — Amount in Words",
    h1: "Amount in words & number to words converter",
    description:
      "Convert any number or amount to words for cheques and invoices: rupees in lakh and crore, dollars in millions, in cheque and US check formats. Free, no sign-up.",
    blurb: "Write any amount out in words, cheque-ready.",
    action: "Convert to words",
    group: "everyday",
    related: [
      "invoice-generator",
      "quotation-generator",
      "vat-calculator",
      "percentage-calculator",
    ],
    keywords: ["number to words", "cheque", "check", "rupees", "words", "lakh", "crore"],
    published: true,
  },
  {
    slug: "electricity-cost-calculator",
    label: "Electricity cost calculator",
    title: "Electricity Bill & Cost Calculator (kWh)",
    h1: "Electricity bill & appliance cost calculator",
    description:
      "Estimate your electricity bill: what each appliance — AC, fridge, heater, fan — costs per hour, day, month and year from its watts and your price per kWh.",
    blurb: "What each appliance costs to run, from watts and your tariff.",
    action: "Calculate electricity cost",
    group: "everyday",
    related: [
      "percentage-calculator",
      "vat-calculator",
      "compound-interest-calculator",
      "days-between-dates",
    ],
    keywords: ["power", "energy", "kwh", "bill", "ac", "appliance", "units"],
    published: true,
  },

  // ---- Dates ----
  {
    slug: "days-between-dates",
    label: "Days between dates",
    title: "Date Calculator — Days Between Two Dates",
    h1: "Days between dates calculator",
    description:
      "Count the days, weeks and months between two dates, count working days, or add and subtract days from a date. A free, instant date calculator with no sign-up.",
    blurb: "Days between dates, add days, working days.",
    action: "Count the days",
    group: "dates",
    related: [
      "age-calculator",
      "invoice-generator",
      "credit-card-payoff-calculator",
      "sip-calculator",
    ],
    keywords: ["date", "calendar", "working days", "business days", "countdown", "due date"],
    published: true,
  },
  {
    slug: "age-calculator",
    label: "Age calculator",
    title: "Age Calculator — Exact Age by Date of Birth",
    h1: "Age calculator",
    description:
      "Calculate your exact age from your date of birth in years, months and days — plus total weeks and days and a countdown to your next birthday. Free, no sign-up.",
    blurb: "Exact age in years, months and days.",
    action: "Calculate age",
    group: "dates",
    related: [
      "days-between-dates",
      "sip-calculator",
      "compound-interest-calculator",
      "percentage-calculator",
    ],
    keywords: ["birthday", "date of birth", "dob", "how old"],
    published: true,
  },

  // ---- Saving & investing ----
  {
    slug: "compound-interest-calculator",
    label: "Compound interest calculator",
    title: "Compound Interest Calculator — Monthly & Daily",
    h1: "Compound interest calculator",
    description:
      "Compound interest with monthly deposits and daily, monthly or yearly compounding: a year-by-year table, a growth chart and the inflation-adjusted value. Free.",
    blurb: "Growth with monthly deposits, year by year.",
    action: "Calculate interest",
    group: "grow",
    related: [
      "sip-calculator",
      "credit-card-payoff-calculator",
      "percentage-calculator",
      "age-calculator",
    ],
    keywords: ["interest", "savings", "investment", "growth", "fd"],
    published: true,
  },
  {
    slug: "sip-calculator",
    label: "SIP calculator",
    title: "SIP Calculator — Step-Up SIP & Returns",
    h1: "SIP calculator with step-up",
    description:
      "Estimate mutual fund SIP returns with an annual step-up: invested vs returns year by year, a growth chart and the inflation-adjusted value. Free, no sign-up.",
    blurb: "Monthly investing with step-up and inflation.",
    action: "Calculate SIP returns",
    group: "grow",
    related: [
      "compound-interest-calculator",
      "age-calculator",
      "percentage-calculator",
      "credit-card-payoff-calculator",
    ],
    keywords: ["mutual fund", "investment", "step-up", "returns", "monthly"],
    published: true,
  },

  // ---- Loans & debt ----
  {
    slug: "credit-card-payoff-calculator",
    label: "Credit card payoff calculator",
    title: "Credit Card Payoff & Interest Calculator",
    h1: "Credit card payoff calculator",
    description:
      "See how long your credit card takes to pay off, the total interest, and how much you save over minimum payments. Free credit card payoff calculator, no sign-up.",
    blurb: "How long to clear a card, and the minimum-payment trap.",
    action: "Plan my payoff",
    group: "debt",
    related: [
      "compound-interest-calculator",
      "percentage-calculator",
      "sip-calculator",
      "days-between-dates",
    ],
    keywords: ["debt", "loan", "credit card", "minimum payment", "apr", "interest"],
    published: true,
  },

  // ---- Invoices & quotes ----
  {
    slug: "invoice-generator",
    label: "Invoice generator",
    title: "Free Invoice Generator — No Sign-Up, PDF",
    h1: "Free invoice generator",
    description:
      "Create a professional invoice online in seconds: line items, GST or VAT, discounts, any currency. Save it as a PDF or share a link. Free, no sign-up.",
    blurb: "Make an invoice and save it as a PDF.",
    action: "Create an invoice",
    group: "business",
    related: [
      "quotation-generator",
      "vat-calculator",
      "amount-in-words",
      "days-between-dates",
    ],
    keywords: ["bill", "billing", "receipt", "pdf", "gst invoice", "freelance"],
    published: true,
  },
  {
    slug: "quotation-generator",
    label: "Quotation generator",
    title: "Free Quotation Maker & Estimate Generator",
    h1: "Free quotation & estimate maker",
    description:
      "Make a professional quotation or estimate online: line items, tax, validity and terms. Save as PDF, share a link, or turn it into an invoice. Free, no sign-up.",
    blurb: "Price quotes and estimates, ready to send.",
    action: "Create a quotation",
    group: "business",
    related: [
      "invoice-generator",
      "vat-calculator",
      "amount-in-words",
      "percentage-calculator",
    ],
    keywords: ["quote", "estimate", "proposal", "pdf", "price"],
    published: true,
  },
];

/** Entries whose page exists. */
export function publishedTools(from: Tool[] = TOOLS): Tool[] {
  return from.filter((t) => t.published);
}

/** A tool by slug, published or not — pages look themselves up while in development. */
export function getTool(slug: string, from: Tool[] = TOOLS): Tool | undefined {
  return from.find((t) => t.slug === slug);
}

/** Published tools in one hub group, in registry order. */
export function toolsInGroup(group: ToolGroup, from: Tool[] = TOOLS): Tool[] {
  return publishedTools(from).filter((t) => t.group === group);
}

/**
 * The siblings to show under a tool: its declared `related` slugs that are
 * published, topped up from the rest of the registry so a page always has at
 * least `min` outbound links while the rollout is incomplete.
 */
export function relatedTools(slug: string, min = 3, from: Tool[] = TOOLS): Tool[] {
  const live = publishedTools(from);
  const self = from.find((t) => t.slug === slug);
  if (!self) return [];

  const picked = self.related
    .map((s) => live.find((t) => t.slug === s))
    .filter((t): t is Tool => Boolean(t));

  if (picked.length >= min) return picked;

  const seen = new Set([slug, ...picked.map((t) => t.slug)]);
  const fillers = live.filter((t) => !seen.has(t.slug));
  return [...picked, ...fillers.slice(0, min - picked.length)];
}

/**
 * The social preview for a tool page (or `"index"` for the hub): a static
 * 1200×630 PNG in `public/og/tools/`, generated from `scripts/og-tools.html`.
 */
export function toolOgImage(slug: string): string {
  return `/og/tools/${slug}.png`;
}

/** Absolute-from-root path for a tool page. */
export function toolPath(slug: string): string {
  return `/tools/${slug}`;
}
