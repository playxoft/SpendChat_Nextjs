import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  Filter,
  Gauge,
  ListPlus,
  Lock,
  MessageSquare,
  Moon,
  Printer,
  Search,
  Smartphone,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/icons/github";
import { siteConfig } from "@/lib/site";
import { marketingCta } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Chat-style transaction entry, bulk import, powerful filters, CSV export, printing, and a private, secure, mobile-friendly design. See what SpendChat can do.",
  alternates: { canonical: "/features" },
};

const highlights = [
  {
    icon: Gauge,
    stat: "Seconds",
    label: "to log a transaction — no forms, no friction.",
  },
  {
    icon: Wallet,
    stat: "Always free",
    label: "open source and free to use, with no ads.",
  },
  {
    icon: Lock,
    stat: "Private",
    label: "your data is scoped to your account, only.",
  },
];

const groups = [
  {
    eyebrow: "Capture",
    title: "Log money as fast as you think it",
    items: [
      {
        icon: MessageSquare,
        title: "Chat-style tracking",
        body: "Logging money should be as quick as sending a message. Enter an amount, choose a category, add an optional note, and it lands in your feed instantly. Day dividers and a running balance keep everything readable at a glance.",
      },
      {
        icon: ListPlus,
        title: "Bulk add",
        body: "Already keep a list in a spreadsheet or notes app? Paste it into Bulk add using a simple amount, note, category, type, date format. You'll see a parsed preview — including any rows that need fixing — before a single record is saved.",
      },
    ],
  },
  {
    eyebrow: "Understand",
    title: "Find anything in an instant",
    items: [
      {
        icon: Filter,
        title: "Filter & search",
        body: "Find anything fast. Filter by custom date range, income or expense, and category, or search across your notes. Every view is shareable as an export — what you see is exactly what you get.",
      },
      {
        icon: Search,
        title: "A clear, running picture",
        body: "Your balance updates live as you add transactions, grouped by day so the story of your month reads top to bottom. No dashboards to configure — the important numbers are always in view.",
      },
    ],
  },
  {
    eyebrow: "Own your data",
    title: "It's yours — take it anywhere",
    items: [
      {
        icon: Download,
        title: "CSV download",
        body: "Export the current, filtered view to a clean CSV in one click. Perfect for backups, spreadsheets, or sharing with an accountant.",
      },
      {
        icon: Printer,
        title: "Print & PDF",
        body: "A dedicated print layout strips away the interface and prints just your transactions — or use your browser's Save as PDF to keep a tidy record.",
      },
    ],
  },
  {
    eyebrow: "Crafted",
    title: "Built to feel effortless",
    items: [
      {
        icon: Lock,
        title: "Security first",
        body: "Authentication is handled by Neon Auth with email and password. Every query is scoped to your account, all input is validated, and the app ships with strict security headers.",
      },
      {
        icon: Smartphone,
        title: "Mobile, tablet & desktop",
        body: "A responsive layout adapts to any screen — a bottom navigation bar on phones, a sidebar on larger screens — so the experience always feels native.",
      },
      {
        icon: Moon,
        title: "Light & dark, minimal by design",
        body: "A calm, neutral interface with no noisy gradients. Switch between light, dark, or system themes whenever you like.",
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:pt-16">
      {/* Header */}
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" /> Features
        </span>
        <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Built to make tracking effortless
        </h1>
        <p className="mt-4 text-pretty text-lg text-muted-foreground">
          A focused toolkit for personal finance — quick to use, easy to trust, and
          open source.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild className={marketingCta}>
            <Link href="/sign-up">
              Start tracking free <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" className={marketingCta}>
            <Link href="/">Try the live demo</Link>
          </Button>
        </div>
      </div>

      {/* Highlights */}
      <div className="mt-16 grid gap-4 sm:grid-cols-3">
        {highlights.map((h) => (
          <div key={h.stat} className="rounded-2xl border bg-card p-6">
            <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
              <h.icon className="size-5" />
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight">{h.stat}</p>
            <p className="mt-1 text-sm text-muted-foreground">{h.label}</p>
          </div>
        ))}
      </div>

      {/* Grouped feature sections */}
      <div className="mt-20 space-y-16">
        {groups.map((group) => (
          <section key={group.eyebrow}>
            <div className="flex flex-col gap-1 border-b pb-5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {group.eyebrow}
              </span>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {group.title}
              </h2>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {group.items.map((item) => (
                <div
                  key={item.title}
                  className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex size-11 items-center justify-center rounded-xl border bg-background transition-colors group-hover:bg-muted">
                    <item.icon className="size-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-medium">{item.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-20 overflow-hidden rounded-3xl border bg-card px-6 py-14 text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          Try it free — no credit card, no installs
        </h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Sign up and start tracking in under a minute. Prefer to read the code first?
          It&apos;s all open source.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
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
  );
}
