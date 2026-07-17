import { createMetadata } from "@/lib/seo";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/icons/github";
import { siteConfig } from "@/lib/site";
import { marketingCta } from "@/lib/marketing";

export const metadata = createMetadata({
  title: "Docs",
  description:
    "Documentation for SpendChat — getting started, adding transactions, categories, bulk import, filtering, exporting, keyboard shortcuts, privacy, and self-hosting the open-source app.",
  path: "/docs",
});

type Section = {
  id: string;
  title: string;
  blocks: Array<
    | { kind: "p"; text: string }
    | { kind: "ul"; items: string[] }
    | { kind: "steps"; items: string[] }
  >;
};

const sections: Section[] = [
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

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:pt-16">
      {/* Header */}
      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <BookOpen className="size-3.5" /> Documentation
        </span>
        <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Everything you need to know
        </h1>
        <p className="mt-4 text-pretty text-lg text-muted-foreground">
          A practical guide to using {siteConfig.name} — from your first transaction
          to exporting, shortcuts, and self-hosting the open-source app.
        </p>
      </div>

      <div className="mt-12 gap-10 lg:grid lg:grid-cols-[220px_1fr]">
        {/* Table of contents */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1 border-l pl-4 text-sm">
            <p className="mb-3 -ml-4 pl-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              On this page
            </p>
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block py-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0 space-y-12">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-2xl font-semibold tracking-tight">{s.title}</h2>
              <div className="mt-4 space-y-4">
                {s.blocks.map((b, i) => {
                  if (b.kind === "p") {
                    return (
                      <p key={i} className="leading-relaxed text-muted-foreground">
                        {b.text}
                      </p>
                    );
                  }
                  if (b.kind === "ul") {
                    return (
                      <ul
                        key={i}
                        className="list-inside list-disc space-y-2 text-muted-foreground"
                      >
                        {b.items.map((it) => (
                          <li key={it}>{it}</li>
                        ))}
                      </ul>
                    );
                  }
                  return (
                    <ol key={i} className="space-y-3">
                      {b.items.map((it, idx) => (
                        <li key={it} className="flex gap-3 text-muted-foreground">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                            {idx + 1}
                          </span>
                          <span className="leading-relaxed">{it}</span>
                        </li>
                      ))}
                    </ol>
                  );
                })}
              </div>
            </section>
          ))}

          {/* CTA */}
          <div className="rounded-3xl border bg-card p-7 text-center">
            <h2 className="text-xl font-semibold tracking-tight">
              Ready to start tracking?
            </h2>
            <p className="mt-2 text-muted-foreground">
              Create a free account, or dive into the source on GitHub.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild className={marketingCta}>
                <Link href="/sign-up">
                  Get started <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" className={marketingCta}>
                <a href={siteConfig.links.github} target="_blank" rel="noreferrer">
                  <GithubIcon /> View source
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
