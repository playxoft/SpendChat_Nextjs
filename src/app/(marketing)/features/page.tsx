import type { Metadata } from "next";
import Link from "next/link";
import {
  Download,
  Filter,
  ListPlus,
  Lock,
  MessageSquare,
  Moon,
  Printer,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Chat-style transaction entry, bulk import, powerful filters, CSV export, printing, and a private, secure, mobile-friendly design. See what MoneyTracker can do.",
  alternates: { canonical: "/features" },
};

const sections = [
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
  {
    icon: Filter,
    title: "Filter & search",
    body: "Find anything fast. Filter by custom date range, income or expense, and category, or search across your notes. Every view is shareable as an export — what you see is exactly what you get.",
  },
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
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          Built to make tracking effortless
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          A focused toolkit for personal finance — quick to use, easy to trust.
        </p>
      </div>

      <div className="mt-14 space-y-10">
        {sections.map((s) => (
          <div key={s.title} className="flex gap-5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-card">
              <s.icon className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-medium">{s.title}</h2>
              <p className="mt-1.5 text-muted-foreground">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16 rounded-2xl border bg-card px-6 py-12 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Try it free</h2>
        <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
          No credit card. No installs. Just sign up and start tracking.
        </p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/sign-up">Get started</Link>
        </Button>
      </div>
    </div>
  );
}
