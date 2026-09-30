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
export type ToolGroup = "everyday" | "dates" | "grow" | "plan" | "debt" | "business";

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
    id: "plan",
    label: "Planning & goals",
    blurb: "Know where you stand, and when you'll get there.",
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
      "Add or remove GST or VAT — inclusive, exclusive and reverse GST — with the CGST/SGST/IGST split and 70+ countries' rates preset. Free calculator, no sign-up.",
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

  // ---- Batch 2: tools 12–22 ----
  {
    slug: "simple-interest-calculator",
    label: "Simple interest calculator",
    title: "Simple Interest Calculator — SI = PRT/100",
    h1: "Simple interest calculator",
    description:
      "Calculate simple interest from principal, rate and time — or solve for the missing one — with the working shown and a compound comparison. Free.",
    blurb: "Interest, principal, rate or time — with the steps.",
    action: "Calculate interest",
    group: "grow",
    related: [
      "compound-interest-calculator",
      "fd-calculator",
      "loan-calculator",
      "percentage-calculator",
    ],
    keywords: ["si", "prt", "principal", "rate", "time", "interest formula", "flat rate"],
    published: true,
  },
  {
    slug: "loan-calculator",
    label: "EMI & loan calculator",
    title: "EMI & Loan Calculator — Amortization Schedule",
    h1: "EMI & loan calculator",
    description:
      "Work out your loan EMI, total interest and a month-by-month amortization schedule, with prepayments that cut interest and tenure. Free, no sign-up.",
    blurb: "Monthly EMI, total interest and a full schedule.",
    action: "Calculate EMI",
    group: "debt",
    related: [
      "loan-comparison-calculator",
      "credit-card-payoff-calculator",
      "simple-interest-calculator",
      "compound-interest-calculator",
    ],
    keywords: ["emi", "mortgage", "home loan", "car loan", "personal loan", "amortization", "prepayment"],
    published: true,
  },
  {
    slug: "loan-comparison-calculator",
    label: "Loan comparison calculator",
    title: "Loan Comparison Calculator — Compare Offers",
    h1: "Loan comparison calculator",
    description:
      "Compare two or three loan offers side by side — EMI, total interest and the true total cost including fees — and see which loan is really cheaper.",
    blurb: "Which loan offer is really cheaper, fees included.",
    action: "Compare loans",
    group: "debt",
    related: [
      "loan-calculator",
      "credit-card-payoff-calculator",
      "simple-interest-calculator",
      "percentage-calculator",
    ],
    keywords: ["compare loans", "loan offers", "processing fee", "cheapest loan", "emi"],
    published: true,
  },
  {
    slug: "net-worth-calculator",
    label: "Net worth calculator",
    title: "Net Worth Calculator — Assets Minus Debts",
    h1: "Net worth calculator",
    description:
      "Add up what you own and what you owe to find your net worth — cash, investments, property, loans and cards — and see how it changes over time.",
    blurb: "What you own minus what you owe.",
    action: "Calculate net worth",
    group: "plan",
    related: [
      "fire-calculator",
      "when-can-i-afford-it",
      "compound-interest-calculator",
      "loan-calculator",
    ],
    keywords: ["assets", "liabilities", "wealth", "balance sheet", "how rich am i"],
    published: true,
  },
  {
    slug: "fire-calculator",
    label: "FIRE calculator",
    title: "FIRE Calculator — FIRE Number & Coast FIRE",
    h1: "FIRE calculator",
    description:
      "Find your FIRE number and when you can retire early — Coast, Lean and Fat FIRE, the 4% rule and your savings rate. Free, no sign-up.",
    blurb: "Your FIRE number and early-retirement date.",
    action: "Find my FIRE number",
    group: "plan",
    related: [
      "net-worth-calculator",
      "sip-calculator",
      "compound-interest-calculator",
      "inflation-calculator",
    ],
    keywords: ["early retirement", "4% rule", "coast fire", "lean fire", "fat fire", "retire"],
    published: true,
  },
  {
    slug: "savings-challenge",
    label: "Savings challenge",
    title: "Savings Challenge — 52-Week & 100-Envelope",
    h1: "Savings challenge tracker",
    description:
      "Start a 52-week or 100-envelope savings challenge in any currency: tick off each step, watch the total grow, and print a tracker. Free, no sign-up.",
    blurb: "52-week and 100-envelope challenges, printable.",
    action: "Start a challenge",
    group: "plan",
    related: [
      "when-can-i-afford-it",
      "net-worth-calculator",
      "compound-interest-calculator",
      "sip-calculator",
    ],
    keywords: ["52 week challenge", "100 envelope challenge", "money challenge", "printable", "saving"],
    published: true,
  },
  {
    slug: "when-can-i-afford-it",
    label: "When can I afford it?",
    title: "Savings Goal Calculator — When Can I Afford It",
    h1: "When can I afford it?",
    description:
      "Find when you can afford something from your savings and monthly saving, or how much to set aside each month to buy it by a date. Free goal calculator.",
    blurb: "When you can buy it, or what to save each month.",
    action: "Plan my goal",
    group: "plan",
    related: [
      "savings-challenge",
      "net-worth-calculator",
      "compound-interest-calculator",
      "sip-calculator",
    ],
    keywords: ["savings goal", "save for", "how long to save", "monthly saving", "afford"],
    published: true,
  },
  {
    slug: "freelance-rate-calculator",
    label: "Freelance rate calculator",
    title: "Freelance Rate Calculator — Hourly & Day Rate",
    h1: "Freelance rate calculator",
    description:
      "Work out what to charge as a freelancer: the hourly and day rate that covers your target income, taxes, expenses and time off. Free, no sign-up.",
    blurb: "The hourly rate that pays what you need.",
    action: "Calculate my rate",
    group: "business",
    related: [
      "invoice-generator",
      "quotation-generator",
      "vat-calculator",
      "percentage-calculator",
    ],
    keywords: ["hourly rate", "day rate", "freelancer", "consultant", "how much to charge"],
    published: true,
  },
  {
    slug: "fd-calculator",
    label: "FD & RD calculator",
    title: "FD & RD Calculator — Maturity & Interest",
    h1: "FD & RD calculator",
    description:
      "Calculate fixed and recurring deposit maturity amounts and interest, with quarterly compounding as Indian banks use and an optional TDS estimate. Free.",
    blurb: "Fixed and recurring deposit maturity.",
    action: "Calculate maturity",
    group: "grow",
    related: [
      "simple-interest-calculator",
      "compound-interest-calculator",
      "sip-calculator",
      "inflation-calculator",
    ],
    keywords: ["fixed deposit", "recurring deposit", "fd interest", "rd", "maturity", "tds"],
    published: true,
  },
  {
    slug: "currency-converter",
    label: "Currency converter",
    title: "Currency Converter — Today's Exchange Rates",
    h1: "Currency converter",
    description:
      "Convert between currencies at today's reference rates — one amount into several currencies at once, and a trip mode for a list of expenses. Free.",
    blurb: "One amount in several currencies at once.",
    action: "Convert currency",
    group: "everyday",
    related: [
      "vat-calculator",
      "inflation-calculator",
      "percentage-calculator",
      "amount-in-words",
    ],
    keywords: ["exchange rate", "forex", "usd to inr", "euro", "convert money", "fx"],
    published: true,
  },
  {
    slug: "inflation-calculator",
    label: "Inflation calculator",
    title: "Inflation Calculator — Value of Money Then & Now",
    h1: "Inflation calculator",
    description:
      "See what money from any year is worth today, and how much prices rose, from official consumer price data for 40+ countries. Free, no sign-up.",
    blurb: "What money from the past is worth today.",
    action: "Calculate inflation",
    group: "everyday",
    related: [
      "currency-converter",
      "compound-interest-calculator",
      "fire-calculator",
      "percentage-calculator",
    ],
    keywords: ["cpi", "purchasing power", "value of money", "price rise", "then vs now"],
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
