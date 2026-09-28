/**
 * The free-tools registry — one entry per `/tools/<slug>` page.
 *
 * Same discipline as `src/lib/features.ts`: the `/tools` hub, the sitemap, and
 * each tool's "Related tools" block all read from here, so a new tool is one
 * entry plus its page file. A tool that exists but is linked from nowhere is
 * the failure this guards against — it never gets crawled.
 *
 * Deliberately dependency-free (no React, no `lucide-react`): `sitemap.ts` only
 * needs the slugs. Icons are named as strings and resolved in
 * `src/components/tools/tool-icon.tsx`.
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
  /** Icon name resolved by `tool-icon.tsx`. */
  icon: string;
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
    title: "Percentage Calculator — Increase, Change & Of",
    h1: "Percentage calculator",
    description:
      "Work out X% of Y, percentage increase or decrease, percent change and discounts — with the working shown. Free, instant, no signup.",
    blurb: "X% of Y, % change, increase, decrease and discounts.",
    icon: "Percent",
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
    label: "VAT & GST calculator",
    title: "VAT & GST Calculator — Add or Remove Tax",
    h1: "VAT, GST & sales tax calculator",
    description:
      "Add or remove VAT, GST or sales tax — reverse VAT included — with 75 countries' rates preset and India's CGST/SGST split. Free, no signup.",
    blurb: "Add or remove tax, with country rates preset.",
    icon: "Receipt",
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
    title: "Amount in Words — Number to Words Converter",
    h1: "Amount in words converter",
    description:
      "Convert any amount to words for cheques and invoices — Indian lakh/crore or international style, rupees and paise, dollars and cents.",
    blurb: "Write any amount out in words, cheque-ready.",
    icon: "PenLine",
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
    title: "Electricity Cost Calculator for Appliances",
    h1: "Appliance electricity cost calculator",
    description:
      "Work out what each appliance costs to run per hour, day, month and year from its wattage and your tariff. Add several and see the total.",
    blurb: "What each appliance costs to run, from watts and your tariff.",
    icon: "Zap",
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
    title: "Days Between Dates Calculator",
    h1: "Days between dates calculator",
    description:
      "Count the days, weeks and months between two dates, add or subtract days from a date, or count working days. Free date calculator.",
    blurb: "Days between dates, add days, working days.",
    icon: "CalendarDays",
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
    title: "Age Calculator — Exact Age in Years & Days",
    h1: "Age calculator",
    description:
      "Find your exact age in years, months and days, the days until your next birthday, and your age on any date. Free, instant, no signup.",
    blurb: "Exact age in years, months and days.",
    icon: "Cake",
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
    title: "Compound Interest Calculator with Deposits",
    h1: "Compound interest calculator",
    description:
      "See how savings grow with compound interest and monthly deposits: year-by-year table, chart and inflation-adjusted value. Free, no signup.",
    blurb: "Growth with monthly deposits, year by year.",
    icon: "TrendingUp",
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
    title: "SIP Calculator with Step-Up & Inflation",
    h1: "SIP calculator",
    description:
      "Estimate what a monthly SIP or investment grows to, with a yearly step-up and inflation-adjusted value. Year-by-year table and chart.",
    blurb: "Monthly investing with step-up and inflation.",
    icon: "PiggyBank",
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
    title: "Credit Card Payoff Calculator",
    h1: "Credit card payoff calculator",
    description:
      "See how long your credit card balance takes to clear and what it costs — and how much you save by paying more than the minimum.",
    blurb: "How long to clear a card, and the minimum-payment trap.",
    icon: "CreditCard",
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
    title: "Free Invoice Generator — No Signup",
    h1: "Free invoice generator",
    description:
      "Create an invoice in your browser — line items, tax, discounts, any currency, amount in words — and save it as a PDF. Free, no signup.",
    blurb: "Make an invoice and save it as a PDF.",
    icon: "FileText",
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
    title: "Quotation Generator — Free Quote Maker",
    h1: "Free quotation generator",
    description:
      "Make a price quotation or estimate in minutes: line items, tax, validity date and terms. Save it as a PDF and turn it into an invoice later.",
    blurb: "Price quotes and estimates, ready to send.",
    icon: "ClipboardList",
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

/** Absolute-from-root path for a tool page. */
export function toolPath(slug: string): string {
  return `/tools/${slug}`;
}
