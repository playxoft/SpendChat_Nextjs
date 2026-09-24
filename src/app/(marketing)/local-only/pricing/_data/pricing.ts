/**
 * Price book for the draft pricing page. Nothing here is wired to billing; it
 * only drives the marketing page under `/local-only/pricing`.
 *
 * Amounts are integer minor units ×100 in every currency (yen included —
 * this is display-only, so one convention beats a per-currency exponent).
 *
 * Decisions (2026-09-24):
 * - Two audiences. Personal: Free, Plus, Pro, Family. Business: Starter,
 *   Growth, Scale, Enterprise (contact sales).
 * - Six currencies: INR, USD, EUR, GBP, AUD, JPY. Pricing is set **per
 *   currency**, not per country: each currency is priced for the market that
 *   uses it, and the rupee carries the regional discount. A visitor starts on
 *   the currency nearest their country (USD when none is close) and can switch.
 * - The regional discount is never stated on the page (2026-09-24): visitors
 *   see prices in their currency, nothing about how other currencies compare.
 *   `discount` stays here because the rupee prices are derived from it.
 * - Personal plans bill on 1, 3 or 12 months; business plans on 1 or 12.
 */

export type Period = "monthly" | "quarterly" | "yearly";
export type Audience = "personal" | "business";
export type PaidPlan = "plus" | "pro" | "family" | "starter" | "growth" | "scale";
export type PlanId = "free" | PaidPlan | "enterprise";
export type Currency = "INR" | "USD" | "EUR" | "GBP" | "AUD" | "JPY";

type Prices = Record<PaidPlan, Partial<Record<Period, number>>> & { topUp: number };

export const STUDENT_DISCOUNT = 0.6;
export const TRIAL_DAYS = 21;
export const MIN_BUSINESS_SEATS = 3;

// ── Currencies ─────────────────────────────────────────────────────────────

export const CURRENCIES: {
  code: Currency;
  name: string;
  /** Below the global (USD) price, for the market this currency serves. */
  discount: number;
  /** Units per US dollar — converts the rupee list into this currency's prices. */
  perUsd: number;
}[] = [
  { code: "INR", name: "Indian rupee", discount: 0.62, perUsd: 88 },
  { code: "USD", name: "US dollar", discount: 0, perUsd: 1 },
  { code: "EUR", name: "Euro", discount: 0, perUsd: 0.92 },
  { code: "GBP", name: "British pound", discount: 0, perUsd: 0.79 },
  { code: "AUD", name: "Australian dollar", discount: 0, perUsd: 1.52 },
  { code: "JPY", name: "Japanese yen", discount: 0, perUsd: 147 },
];

const meta = (c: Currency) => CURRENCIES.find((x) => x.code === c)!;

export function isCurrency(code: string): code is Currency {
  return CURRENCIES.some((c) => c.code === code);
}

export function currencyDiscount(c: Currency): number {
  return meta(c).discount;
}

/** "₹", "$", "€", "£", "A$", "¥". */
export function currencySymbol(currency: Currency): string {
  if (currency === "AUD") return "A$";
  return (
    new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

/** Rounds a converted amount onto a price someone would print. */
function charm(major: number, currency: Currency): number {
  if (currency === "JPY") return major >= 1000 ? Math.round(major / 100) * 100 : Math.round(major / 10) * 10;
  if (currency === "INR") return major >= 100 ? Math.round(major / 10) * 10 - 1 : Math.round(major);
  if (major < 30) return Math.max(0.99, Math.round(major) - 0.01);
  // $30 → $29, $120 → $119; anything not on a ten stays a whole number.
  const whole = Math.round(major);
  return whole % 10 === 0 ? whole - 1 : whole;
}

// ── Price lists ────────────────────────────────────────────────────────────
// Set in rupees (2026-09-24); every other currency is derived from them.
// Business prices are per seat, and business plans have no 3-month option.

const RUPEES: Prices = {
  plus: { monthly: 19900, quarterly: 29900, yearly: 99900 },
  pro: { monthly: 29900, quarterly: 49900, yearly: 199900 },
  family: { monthly: 39900, quarterly: 99900, yearly: 299900 },
  starter: { monthly: 29900, yearly: 199900 },
  growth: { monthly: 39900, yearly: 299900 },
  scale: { monthly: 49900, yearly: 399900 },
  topUp: 24900,
};

/**
 * The global price list in `currency`: the rupee price with the rupee
 * discount taken back off, converted, and charm-rounded ($5.99, £4.99, ¥880).
 * Euro reuses the dollar numerals — the norm for EU software pricing.
 */
function fromRupees(currency: Exclude<Currency, "INR">): Prices {
  const rate = (currency === "EUR" ? 1 : meta(currency).perUsd) / meta("INR").perUsd;
  const conv = (minor: number) =>
    Math.round(charm((minor / 100 / (1 - meta("INR").discount)) * rate, currency) * 100);
  const out = { topUp: conv(RUPEES.topUp) } as Prices;
  for (const plan of Object.keys(RUPEES).filter((k) => k !== "topUp") as PaidPlan[]) {
    out[plan] = Object.fromEntries(
      Object.entries(RUPEES[plan]).map(([period, minor]) => [period, conv(minor!)]),
    );
  }
  return out;
}

const LISTS: Record<Currency, Prices> = {
  INR: RUPEES,
  USD: fromRupees("USD"),
  EUR: fromRupees("EUR"),
  GBP: fromRupees("GBP"),
  AUD: fromRupees("AUD"),
  JPY: fromRupees("JPY"),
};


// ── Countries → nearest currency ───────────────────────────────────────────
// Only picks the starting currency; it doesn't change any price.

const COUNTRY_CURRENCY: Record<string, Currency> = {
  IN: "INR", NP: "INR", BT: "INR", BD: "INR", LK: "INR",
  GB: "GBP",
  AU: "AUD", NZ: "AUD",
  JP: "JPY",
  ...Object.fromEntries(
    "IE DE FR NL BE LU AT IT ES PT FI SE NO DK CH IS GR CY MT SK SI EE LV LT HR PL CZ HU RO BG TR"
      .split(" ")
      .map((c) => [c, "EUR" as Currency]),
  ),
};

export function currencyForCountry(country: string | null | undefined): Currency {
  return COUNTRY_CURRENCY[country?.toUpperCase() ?? ""] ?? "USD";
}

// ── Formatting ─────────────────────────────────────────────────────────────

export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** What the sales tax added at checkout is called where this currency is used. */
export function taxName(currency: Currency): string {
  if (currency === "INR" || currency === "AUD") return "GST";
  if (currency === "EUR" || currency === "GBP") return "VAT";
  return "sales tax";
}

export function formatAmount(major: number, currency: Currency): string {
  const whole = Number.isInteger(major) || currency === "JPY";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
    .format(major)
    .replace(/^\$/, currency === "AUD" ? "A$" : "$");
}

/**
 * `total / parts`, truncated — never rounded up, so a per-month figure never
 * adds up to more than what's charged. Rupees and yen drop to a whole unit
 * (₹299 over 3 months is ₹99). Other currencies keep their cents under 10,
 * where dropping them would misstate the price by a third ($8.99 / 3 is
 * $2.99, not $2).
 */
export function divide(total: number, parts: number, currency: Currency): number {
  if (parts === 1) return total;
  // Divide in integer minor units: `Math.floor(exact * 100)` on a float in
  // major units loses a cent whenever the product lands just under a whole
  // number (0.87 / 3 → 0.29 * 100 = 28.999… → $0.28).
  const exactMinor = Math.round(total * 100) / parts;
  const cents = currency !== "INR" && currency !== "JPY" && exactMinor < 1000;
  return cents ? Math.floor(exactMinor) / 100 : Math.floor(exactMinor / 100);
}

// ── Periods & quotes ───────────────────────────────────────────────────────

export const PERIOD_MONTHS: Record<Period, number> = { monthly: 1, quarterly: 3, yearly: 12 };

export const PERIOD_LABEL: Record<Period, { toggle: string; billed: string }> = {
  monthly: { toggle: "1 month", billed: "billed monthly" },
  quarterly: { toggle: "3 months", billed: "billed every 3 months" },
  yearly: { toggle: "1 year", billed: "billed yearly" },
};

/** Shortest → longest; also the order the selector shows them in. */
export const PERIODS_FOR: Record<Audience, Period[]> = {
  personal: ["monthly", "quarterly", "yearly"],
  business: ["monthly", "yearly"],
};

/** Priced per seat. */
export const BUSINESS_PAID: PlanId[] = ["starter", "growth", "scale"];

export function isPaid(plan: PlanId): plan is PaidPlan {
  return plan !== "free" && plan !== "enterprise";
}

/** Saving of `period` vs paying monthly, for one plan in this currency, 0–1. */
export function periodDiscount(plan: PaidPlan, period: Period, currency: Currency): number {
  const prices = LISTS[currency][plan];
  const base = prices.monthly;
  const minor = prices[period];
  if (base == null || minor == null || period === "monthly") return 0;
  return 1 - minor / (base * PERIOD_MONTHS[period]);
}

export type Quote =
  | { available: false }
  | {
      available: true;
      /** Charged each period. */
      price: number;
      /** The headline figure. */
      perMonth: number;
    };

export function quote(plan: PaidPlan, period: Period, currency: Currency): Quote {
  const minor = LISTS[currency][plan][period];
  if (minor == null) return { available: false };
  const months = PERIOD_MONTHS[period];
  const price = minor / 100;
  const perMonth = divide(price, months, currency);

  return { available: true, price, perMonth };
}

export function topUpPrice(currency: Currency): number {
  return LISTS[currency].topUp / 100;
}

// ── Plans ──────────────────────────────────────────────────────────────────

export const PLANS_FOR: Record<Audience, PlanId[]> = {
  personal: ["free", "plus", "pro", "family"],
  business: ["starter", "growth", "scale", "enterprise"],
};

export type PlanCopy = {
  name: string;
  tagline: string;
  members: string;
  highlight?: string;
  lead: string;
  features: string[];
};

export const PLAN_COPY: Record<PlanId, PlanCopy> = {
  free: {
    name: "Free",
    tagline: "Everything you need to track, forever.",
    members: "Just you",
    lead: "Includes",
    features: [
      "Unlimited transactions",
      "Chat-style entry & bulk add",
      "2 profiles, categories & tags",
      "Analytics, filters & search",
      "CSV & PDF export — never gated",
      "30 AI actions a month",
      "500 MB files vault",
      "Keyboard shortcuts for everything",
      "Web + mobile, light & dark themes",
    ],
  },
  plus: {
    name: "Plus",
    tagline: "AI entry for one, without thinking about limits.",
    members: "Just you",
    lead: "Everything in Free, and",
    features: [
      "500 AI actions a month",
      "Turn notes & receipts into entries",
      "2 GB files vault for receipts",
      "Folders, colours & file tags",
      "Receipts attached to transactions",
      "Multiple workspaces",
      "AI top-ups whenever you need them",
      "Email support",
    ],
  },
  pro: {
    name: "Pro",
    tagline: "For people who live in their finances.",
    members: "Just you",
    highlight: "Most popular",
    lead: "Everything in Plus, and",
    features: [
      "3,000 AI actions a month",
      "Voice entry — hold M and talk",
      "Speak in several languages at once",
      "10 GB files vault",
      "Share links for files & receipts",
      "Priority support",
      "Early access to new features",
    ],
  },
  family: {
    name: "Family",
    tagline: "The whole household, every feature.",
    members: "Up to 6 members",
    lead: "Everything in Pro, and",
    features: [
      "Up to 6 members, each with their own login",
      "Roles: viewer, editor, admin",
      "Share a single profile — for a helper or a teen",
      "Shared categories across the household",
      "6,000 AI actions a month, shared",
      "Voice entry for everyone",
      "25 GB shared files vault",
      "Invite by email or a join link",
    ],
  },
  starter: {
    name: "Starter",
    tagline: "Expenses and receipts for a small team, as fast as a chat.",
    members: `From ${MIN_BUSINESS_SEATS} seats`,
    lead: "Everything in Pro, and",
    features: [
      "1,000 AI actions per seat, pooled",
      "10 GB shared files vault",
      "Unlimited workspaces",
      "Role-based access, per workspace or profile",
      "Receipts attached to every entry",
      "CSV & PDF export for your accountant",
      "Add or remove seats any time",
    ],
  },
  growth: {
    name: "Growth",
    tagline: "For teams that run their spending through it every day.",
    members: `From ${MIN_BUSINESS_SEATS} seats`,
    highlight: "Most popular",
    lead: "Everything in Starter, and",
    features: [
      "3,000 AI actions per seat, pooled",
      "20 GB shared files vault",
      "File tags & folders shared across the team",
      "Priority support, next business day",
      "A 1:1 onboarding call for your team",
      "Early access to new features",
    ],
  },
  scale: {
    name: "Scale",
    tagline: "For larger teams with more people, receipts and workspaces.",
    members: `From ${MIN_BUSINESS_SEATS} seats`,
    lead: "Everything in Growth, and",
    features: [
      "5,000 AI actions per seat, pooled",
      "30 GB shared files vault",
      "Priority support, same business day",
      "A named contact for your account",
      "Annual invoicing on request",
      "Quarterly usage review",
    ],
  },
  enterprise: {
    name: "Enterprise",
    tagline: "For organisations with their own rules.",
    members: "Custom seats",
    lead: "Everything in Scale, and",
    features: [
      "Single sign-on (SSO)",
      "Custom AI & storage limits",
      "Purchase orders & invoicing",
      "Custom contract & terms",
      "Support agreement for self-hosting",
      "Security review assistance",
    ],
  },
};
