import { DEFAULT_CATEGORIES } from "@/lib/categories";

/**
 * Shared seed data for every marketing demo.
 *
 * One set of numbers across every feature page, so a visitor who reads three of
 * them sees one coherent product rather than three unrelated mock-ups. The
 * amounts are deliberately unremarkable — a demo full of $4,000 dinners reads
 * as a mock-up; groceries and a phone bill read as software someone uses.
 *
 * Every timestamp here is a **fixed string**, never `new Date()`. These seeds
 * are server-rendered (crawlers need the content in the HTML), and a clock read
 * during render produces a different value on the client — React reports that
 * as a hydration mismatch and throws the subtree away. Only user-triggered
 * additions read the real clock, in `demoTimeLabel()` below.
 */

export const DEMO_CURRENCY = "USD";
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

/** The real default categories, filtered by kind — same list a new account gets. */
export function demoCategories(type: DemoTxnType) {
  return DEFAULT_CATEGORIES.filter((c) => c.kind === type);
}

export function demoCategory(name: string) {
  return DEFAULT_CATEGORIES.find((c) => c.name === name);
}

/**
 * Clock label for a transaction the visitor just added. Safe because it only
 * ever runs inside an event handler, never during render — see the note above.
 */
export function demoTimeLabel(): string {
  return new Date().toLocaleTimeString(DEMO_LOCALE, {
    hour: "numeric",
    minute: "2-digit",
  });
}
