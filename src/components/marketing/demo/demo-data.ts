import { DEFAULT_CATEGORIES } from "@/lib/categories";

/**
 * Shared seed data for every marketing demo.
 *
 * One set of numbers across every feature page, so a visitor who reads three of
 * them sees one coherent product rather than three unrelated mock-ups. The
 * amounts are deliberately unremarkable — a demo full of $4,000 dinners reads
 * as a mock-up; groceries and a phone bill read as software someone uses. The
 * same goes for anything a second surface repeats: the files vault's 1 GB quota
 * is shown on both a feature page and a homepage band, and a figure that moves
 * in one file and not the other is exactly the drift this module prevents.
 *
 * Every timestamp here is a **fixed string**, never `new Date()`. These seeds
 * are server-rendered (crawlers need the content in the HTML), and a clock read
 * during render produces a different value on the client — React reports that
 * as a hydration mismatch and throws the subtree away. Only user-triggered
 * additions read the real clock, in `demoTimeLabel()` below.
 *
 * **What follows the visitor and what doesn't.** Money does: `useDemoMoney()`
 * picks the visitor's currency and `demoAmount()` scales the seeded figure into
 * it, because a `$12.50` lunch costs a reader in Chennai a mental conversion.
 * Words don't — the day dividers say "Today" and "Yesterday", the file dates
 * say "21 Aug", and the marketing site has no i18n to make them say anything
 * else. Clock labels are on the words side of that line, and `demoTimeLabel()`
 * explains why in more detail than you'd expect, because it is the one place
 * where the two sides sit on the same row.
 */

/**
 * The currency the seeds are *written in* — not the one they render in.
 *
 * Every `amountMinor` below is USD minor units, and that is the assumption
 * `demoAmount()` scales from. Nothing renders `DEMO_CURRENCY` itself; it names
 * the unit so the seeds can be read without guessing.
 */
export const DEMO_CURRENCY = "USD";

/**
 * The locale the demos' **clock labels** are pinned to, on both sides — the
 * `timeLabel` strings below and the one `demoTimeLabel()` mints at runtime.
 * Amounts and dates do not use it; they follow `useDemoMoney()`.
 */
export const DEMO_LOCALE = "en-US";

export type DemoTxnType = "income" | "expense";

export type DemoTxn = {
  id: number;
  type: DemoTxnType;
  /** Integer minor units, exactly like `transactions.amount_minor`. */
  amountMinor: number;
  title: string;
  description?: string;
  categoryName: string;
  categoryIcon: string;
  /** Clock label in `DEMO_LOCALE`, never the visitor's — see `demoTimeLabel()`. */
  timeLabel: string;
  /** Day-divider group this row belongs to. Defaults to "Today". */
  day?: string;
};

export const DEMO_PROFILES = ["Personal", "Home", "Business"] as const;
export type DemoProfile = (typeof DEMO_PROFILES)[number];

export const DEMO_PROFILE_ICON: Record<DemoProfile, string> = {
  Personal: "👤",
  Home: "🏠",
  Business: "💼",
};

export const DEMO_PROFILE_BLURB: Record<DemoProfile, string> = {
  Personal: "Day-to-day spending",
  Home: "Rent, bills, the household",
  Business: "Invoices in, costs out",
};

/**
 * A separate feed per profile, so switching the picker genuinely swaps the data
 * — which is what profiles actually do in the app. A demo that only re-labels
 * the same rows teaches the wrong mental model.
 *
 * Each profile spans two days so the feed shows a day divider — the thing the
 * chat page's copy talks about — and reads as a history someone has been
 * keeping rather than three rows in an empty box.
 */
export const DEMO_SEEDS: Record<DemoProfile, DemoTxn[]> = {
  Personal: [
    { id: 1, day: "Yesterday", type: "expense", amountMinor: 890, title: "Morning coffee", categoryName: "Food & Dining", categoryIcon: "🍽️", timeLabel: "8:15 AM" },
    { id: 2, day: "Yesterday", type: "expense", amountMinor: 2400, title: "Bus pass top-up", categoryName: "Transport", categoryIcon: "🚆", timeLabel: "6:05 PM" },
    { id: 3, type: "income", amountMinor: 200000, title: "August salary", categoryName: "Salary", categoryIcon: "💼", timeLabel: "9:02 AM" },
    { id: 4, type: "expense", amountMinor: 1250, title: "Lunch with the team", categoryName: "Food & Dining", categoryIcon: "🍽️", timeLabel: "1:14 PM" },
    { id: 5, type: "expense", amountMinor: 4000, title: "Weekly groceries", categoryName: "Groceries", categoryIcon: "🛒", timeLabel: "6:30 PM" },
  ],
  Home: [
    { id: 1, day: "Yesterday", type: "expense", amountMinor: 3200, title: "Water bill", categoryName: "Utilities", categoryIcon: "💡", timeLabel: "10:40 AM" },
    { id: 2, day: "Yesterday", type: "expense", amountMinor: 1899, title: "Light bulbs", categoryName: "Shopping", categoryIcon: "🛍️", timeLabel: "4:20 PM" },
    { id: 3, type: "expense", amountMinor: 120000, title: "Rent", categoryName: "Housing", categoryIcon: "🏠", timeLabel: "8:00 AM" },
    { id: 4, type: "expense", amountMinor: 6800, title: "Electricity bill", categoryName: "Utilities", categoryIcon: "💡", timeLabel: "11:20 AM" },
    { id: 5, type: "expense", amountMinor: 7350, title: "Household supplies", categoryName: "Groceries", categoryIcon: "🛒", timeLabel: "5:45 PM" },
  ],
  Business: [
    { id: 1, day: "Yesterday", type: "expense", amountMinor: 2500, title: "Domain renewal", categoryName: "Other", categoryIcon: "📦", timeLabel: "9:30 AM" },
    { id: 2, day: "Yesterday", type: "income", amountMinor: 75000, title: "Consulting retainer", categoryName: "Freelance", categoryIcon: "🧾", timeLabel: "3:00 PM" },
    { id: 3, type: "income", amountMinor: 350000, title: "Client invoice", categoryName: "Freelance", categoryIcon: "🧾", timeLabel: "10:05 AM" },
    { id: 4, type: "expense", amountMinor: 4900, title: "Software subscriptions", categoryName: "Other", categoryIcon: "📦", timeLabel: "2:30 PM" },
    { id: 5, type: "expense", amountMinor: 12000, title: "Online ads", categoryName: "Shopping", categoryIcon: "🛍️", timeLabel: "4:10 PM" },
  ],
};

/* ── Files vault ────────────────────────────────────────────────────────── */

/**
 * The workspace storage quota, and how much of it the demos show used.
 *
 * 1 GB is the real per-workspace cap. Both numbers live here rather than in the
 * vault components because they are a claim about the product, not a layout
 * detail: `files-demo.tsx` makes it on the feature page and `files-preview.tsx`
 * makes it again on the homepage, and the failure mode is one of them being
 * raised and the other not.
 */
export const DEMO_STORAGE_LIMIT_BYTES = 1024 ** 3;
export const DEMO_STORAGE_USED_BYTES = 118_400_000;

export type DemoFileTag = { name: string; color: string };

/** Colours are drawn from the vault's own swatch list (`VAULT_COLORS`). */
export const DEMO_FILE_TAGS: DemoFileTag[] = [
  { name: "Receipts", color: "#22c55e" },
  { name: "Invoices", color: "#3b82f6" },
  { name: "Warranties", color: "#f59e0b" },
  { name: "Tax", color: "#a855f7" },
];

export type DemoFolder = {
  name: string;
  color: string;
  /** The vault's one built-in folder, which the app creates and won't delete. */
  system: boolean;
};

export const DEMO_FOLDERS: DemoFolder[] = [
  { name: "Transaction attachments", color: "#64748b", system: true },
  { name: "2026 tax", color: "#a855f7", system: false },
  { name: "Home", color: "#0ea5e9", system: false },
];

export type DemoFile = {
  id: number;
  contentType: string;
  name: string;
  bytes: number;
  /** Fixed English label, like the day dividers — see the note at the top. */
  modified: string;
  tags: string[];
  folder: string;
};

/**
 * The vault's contents: a receipt the app filed itself, a bill, an invoice, a
 * warranty and a spreadsheet — a spread of types so the glyphs, the tag dots
 * and the size column all have something to show.
 */
export const DEMO_FILES: DemoFile[] = [
  { id: 1, name: "Grocery receipt.jpg", contentType: "image/jpeg", bytes: 842_000, modified: "21 Aug", tags: ["Receipts"], folder: "Transaction attachments" },
  { id: 2, name: "Electricity bill July.pdf", contentType: "application/pdf", bytes: 214_000, modified: "18 Aug", tags: ["Invoices"], folder: "Home" },
  { id: 3, name: "Client invoice 0042.pdf", contentType: "application/pdf", bytes: 186_000, modified: "15 Aug", tags: ["Invoices", "Tax"], folder: "2026 tax" },
  { id: 4, name: "Laptop warranty.pdf", contentType: "application/pdf", bytes: 512_000, modified: "9 Aug", tags: ["Warranties"], folder: "Home" },
  { id: 5, name: "Rent receipt Aug.png", contentType: "image/png", bytes: 640_000, modified: "5 Aug", tags: ["Receipts", "Tax"], folder: "2026 tax" },
  { id: 6, name: "Expenses Q2.csv", contentType: "text/csv", bytes: 38_000, modified: "1 Aug", tags: ["Tax"], folder: "2026 tax" },
  { id: 7, name: "Pharmacy receipt.jpg", contentType: "image/jpeg", bytes: 402_000, modified: "12 Aug", tags: ["Receipts"], folder: "Transaction attachments" },
  { id: 8, name: "Insurance policy.pdf", contentType: "application/pdf", bytes: 928_000, modified: "28 Jul", tags: ["Warranties"], folder: "Home" },
];

/** Swatch for a tag name; slate for anything unrecognised. */
export function demoTagColor(name: string): string {
  return DEMO_FILE_TAGS.find((t) => t.name === name)?.color ?? "#64748b";
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** The real default categories, filtered by kind — same list a new account gets. */
export function demoCategories(type: DemoTxnType) {
  return DEFAULT_CATEGORIES.filter((c) => c.kind === type);
}

export function demoCategory(name: string) {
  return DEFAULT_CATEGORIES.find((c) => c.name === name);
}

/**
 * Clock label for a transaction the visitor just added. Reading the clock is
 * safe because this only ever runs inside an event handler, never during
 * render — see the note at the top of this file.
 *
 * **It formats in `DEMO_LOCALE`, and the `timeLabel` strings in `DEMO_SEEDS`
 * are hand-written to match it.** Those are one decision, not two: an added row
 * lands directly beneath the seeded ones in the same feed, so localizing either
 * side alone puts a "14:14" immediately under an "8:15 AM". If you localize
 * this, localize the seeds in the same change — and vice versa.
 *
 * Why the clock stays pinned while amounts and dates follow the visitor:
 *
 * - The feed's other time vocabulary is English no matter what. The divider a
 *   row sits under says "Today" or "Yesterday" (`DemoFeed`, and the `day` field
 *   above), the export demo's range chip says "Aug 1 – 21", and the site has no
 *   i18n. A localized clock under an English divider is half a translation,
 *   which reads worse than none.
 * - Time-of-day is also the one format here that is genuinely unsafe to compute
 *   during the server/hydration render, and the seeds *are* server-rendered.
 *   `en-US` short time changed in ICU 72: the space before "AM" became U+202F.
 *   Node and the visitor's browser can sit on either side of that, so the
 *   server HTML and the hydration render would disagree on a string that looks
 *   identical — a hydration mismatch that discards the subtree. `formatMoney`
 *   and `formatDateShort` ("Aug 21") have no such divergence, which is why
 *   those two are safe to drive from `useDemoMoney()` and this isn't.
 */
export function demoTimeLabel(): string {
  return new Date().toLocaleTimeString(DEMO_LOCALE, {
    hour: "numeric",
    minute: "2-digit",
  });
}
