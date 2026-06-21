import Link from "next/link";
import {
  ArrowRight,
  Download,
  Filter,
  ListPlus,
  MessageSquare,
  ShieldCheck,
  Smartphone,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/icons/github";
import { TrackerDemo } from "@/components/marketing/tracker-demo";
import { JsonLd } from "@/components/json-ld";
import { faqs } from "@/lib/faq";
import { siteConfig } from "@/lib/site";
import { marketingCta } from "@/lib/marketing";

const features = [
  {
    icon: MessageSquare,
    title: "Add it like a chat",
    body: "Type an amount, pick a category, send. Logging money feels like texting — no forms to wrestle with.",
  },
  {
    icon: ListPlus,
    title: "Bulk add in seconds",
    body: "Paste a whole list from a spreadsheet and import dozens of transactions at once, with a preview first.",
  },
  {
    icon: Filter,
    title: "Filter & search",
    body: "Slice by date range, type, and category, or search your notes to find exactly what you need.",
  },
  {
    icon: Download,
    title: "Download & print",
    body: "Export any view to CSV, or print a clean report and save it as a PDF — your data is always yours.",
  },
  {
    icon: ShieldCheck,
    title: "Private & secure",
    body: "Your records are tied to your account and shown only to you, with strict security baked in.",
  },
  {
    icon: Smartphone,
    title: "Works everywhere",
    body: "A fast, responsive experience on mobile, tablet, and desktop, with light and dark themes.",
  },
];

const steps = [
  {
    title: "Create your free account",
    body: "Sign up with your email in seconds. No credit card, ever.",
  },
  {
    title: "Send your transactions",
    body: "Add income and expenses in a chat-style feed, or bulk import a list.",
  },
  {
    title: "Track, filter & export",
    body: "Watch your balance update live, then filter, download, or print anytime.",
  },
];

export default function LandingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: siteConfig.name,
    url: siteConfig.url,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description: siteConfig.description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* Hero — fills the viewport (minus the fixed top nav). */}
      <section className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-6xl flex-col justify-center px-4 py-10">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="animate-rise">
            <a
              href={siteConfig.links.github}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Star className="size-3.5" /> Open source • Free • Private
            </a>
            <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Track your money like a conversation.
            </h1>
            <p className="mt-5 max-w-lg text-pretty text-lg text-muted-foreground">
              MoneyTracker is a minimal, fast, open-source expense and income
              tracker. Add a transaction in seconds, then filter, download, and
              print whenever you need. Free to use.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild className={marketingCta}>
                <Link href="/sign-up">
                  Start tracking free <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" className={marketingCta}>
                <Link href="/features">See features</Link>
              </Button>
              <Button asChild variant="ghost" className={marketingCta}>
                <a href={siteConfig.links.github} target="_blank" rel="noreferrer">
                  <GithubIcon /> Source
                </a>
              </Button>
            </div>
          </div>

          <div className="animate-rise lg:pl-4">
            <TrackerDemo />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Live demo — type an amount, pick a category, and hit send.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              Everything you need, nothing you don&apos;t
            </h2>
            <p className="mt-3 text-muted-foreground">
              A focused set of tools to keep your spending clear — without the clutter
              of a full accounting suite.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-sm"
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <f.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-medium">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Up and running in three steps
          </h2>
        </div>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-xl border bg-card p-6">
              <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                {i + 1}
              </span>
              <h3 className="mt-4 font-medium">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ teaser */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            Frequently asked questions
          </h2>
          <dl className="mt-10 divide-y">
            {faqs.slice(0, 4).map((f) => (
              <div key={f.q} className="py-5">
                <dt className="font-medium">{f.q}</dt>
                <dd className="mt-1.5 text-sm text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 text-center">
            <Button asChild variant="outline" className={marketingCta}>
              <Link href="/faq">Read all FAQs</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 py-24">
        <div className="rounded-2xl border bg-card px-6 py-16 text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Start tracking your money today
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            It&apos;s free, private, and takes less than a minute to set up.
          </p>
          <Button asChild className={`mt-8 ${marketingCta}`}>
            <Link href="/sign-up">
              Create your free account <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
