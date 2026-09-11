/**
 * The documentation content — one array read by two surfaces: the `/docs`
 * page renders it, and `/llms.txt` lists its sections so a model answering a
 * "how do I…" question can point at the right anchor. Keeping it here rather
 * than inside the page file is what lets the second reader exist: Next only
 * permits a fixed set of exports from a `page.tsx`.
 */
import { siteConfig } from "@/lib/site";

export type DocsSection = {
  id: string;
  title: string;
  blocks: Array<
    | { kind: "p"; text: string }
    | { kind: "ul"; items: string[] }
    | { kind: "steps"; items: string[] }
  >;
};

export const docsSections: DocsSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    blocks: [
      {
        kind: "p",
        text: "SpendChat is a chat-style tracker for your income and expenses. Create a free account and you can start logging transactions in seconds — no setup, no connected bank accounts, no credit card.",
      },
      {
        kind: "steps",
        items: [
          "Sign up with your email and a password.",
          "Pick your currency (you can change it later in Settings).",
          "Open the tracker and send your first transaction.",
        ],
      },
    ],
  },
  {
    id: "adding-transactions",
    title: "Adding a transaction",
    blocks: [
      {
        kind: "p",
        text: "The tracker works like a chat. Choose whether it's an expense or income, type an amount, add a short title, optionally pick a category, and send. The bubble lands in your feed and your balance updates instantly.",
      },
      {
        kind: "ul",
        items: [
          "Income appears on the left with an emerald amount; expenses appear on the right.",
          "Transactions are grouped under day dividers so your month reads top to bottom.",
          "Tap any transaction to edit or delete it.",
        ],
      },
    ],
  },
  {
    id: "categories",
    title: "Categories",
    blocks: [
      {
        kind: "p",
        text: "Every account starts with a sensible set of default categories — Food & Dining, Groceries, Transport, Housing, Salary, Freelance, and more — each with an emoji so the feed is easy to scan. Categories are scoped to income or expense.",
      },
      {
        kind: "p",
        text: "In the tracker you can type \"/\" in the title field to quickly tag a category without leaving the keyboard.",
      },
    ],
  },
  {
    id: "bulk-add",
    title: "Bulk add",
    blocks: [
      {
        kind: "p",
        text: "Already have a list somewhere? Bulk add lets you paste many transactions at once using a simple amount, note, category, type, date format. You'll see a parsed preview — including any rows that need fixing — before anything is saved.",
      },
    ],
  },
  {
    id: "filter-search",
    title: "Filtering & searching",
    blocks: [
      {
        kind: "p",
        text: "Find anything fast. Filter by a custom date range, by income or expense, and by category — or search across your notes. Whatever you've filtered to is exactly what gets exported or printed.",
      },
    ],
  },
  {
    id: "export-print",
    title: "Exporting & printing",
    blocks: [
      {
        kind: "ul",
        items: [
          "CSV — export the current, filtered view to a clean CSV in one click.",
          "Print / PDF — a dedicated print layout shows just your transactions; use your browser's Save as PDF for a tidy record.",
        ],
      },
    ],
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    blocks: [
      {
        kind: "p",
        text: "Modifier keys adapt to your platform — ⌘ on macOS, Ctrl on Windows and Linux. Single-key shortcuts work whenever you're not typing in a field. You can browse the full list any time in Settings → Keyboard shortcuts.",
      },
      {
        kind: "ul",
        items: [
          "T / R / A / S — jump to Tracker, Transactions, Analytics or Settings",
          "E — add a transaction; B — bulk add",
          "/ — focus search, or tag a category from the title field",
          "⌘/Ctrl + ↵ — send the transaction",
          "⇧ + ↵ — jump to the description field",
          "⌘/Ctrl + E — switch between expense and income",
          "⇧ + ` — show all profiles; ⇧ + 1…9, 0 — switch profile",
          "⌘/Ctrl + P — print the current page",
        ],
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy & security",
    blocks: [
      {
        kind: "p",
        text: "Your data is tied to your account and shown only to you. Every database query is scoped to the authenticated user, all input is validated on the server, and the app ships with strict security headers. There are no ads and your information is never sold.",
      },
    ],
  },
  {
    id: "self-hosting",
    title: "Self-hosting & open source",
    blocks: [
      {
        kind: "p",
        text: `SpendChat is open source under the ${siteConfig.license} license. You can read the full source, file issues, and self-host your own instance. The app is built on Next.js (App Router), Tailwind CSS with shadcn/ui, Neon Postgres with Drizzle, Firebase Authentication, and deploys to Cloudflare Workers via OpenNext.`,
      },
      {
        kind: "steps",
        items: [
          "Clone the repository from GitHub.",
          "Set up a Neon Postgres database and configure your environment.",
          "Run the database migrations, then start the dev server.",
        ],
      },
    ],
  },
];
