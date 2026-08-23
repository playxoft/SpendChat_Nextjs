import Link from "next/link";
import {
  ArrowRight,
  Check,
  Download,
  Keyboard,
  Minus,
  Paperclip,
  ShieldCheck,
  Smartphone,
  Star,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { GithubIcon } from "@/components/icons/github";
import { ChatDemo } from "@/components/marketing/demo/chat-demo";
import { EntryMethods } from "@/components/marketing/entry-methods";
import { FeatureIcon } from "@/components/marketing/feature-icon";
import { SpendBreakdown, SpendChart } from "@/components/marketing/spend-breakdown";
import { FilesPreview } from "@/components/marketing/demo/files-preview";
import { ShortcutsPreview } from "@/components/marketing/demo/shortcuts-preview";
import { JsonLd } from "@/components/json-ld";
import { AppHandoff } from "@/components/marketing/app-handoff";
import { faqs } from "@/lib/faq";
import { featureLink, featurePath, publishedFeatures } from "@/lib/features";
import { faqJsonLd } from "@/lib/seo";
import { comboFor } from "@/lib/shortcuts";
import { siteConfig } from "@/lib/site";
import { marketingCta } from "@/lib/marketing";

/** How many FAQs the homepage shows before sending people to `/faq`. */
const HOME_FAQ_COUNT = 6;

const trustPoints = [
  {
    icon: ShieldCheck,
    label: "No bank login",
    body: "We never ask for banking credentials.",
    href: featureLink("privacy-and-security"),
  },
  {
    icon: GithubIcon,
    label: "Open source",
    body: "AGPL-3.0. Read the code yourself.",
    href: siteConfig.links.github,
    external: true,
  },
  {
    icon: Wallet,
    label: "Free to use",
    body: "No ads, no paid tier holding features back.",
    href: "/pricing",
  },
  {
    icon: Download,
    label: "Yours to take",
    body: "Export everything as CSV, any time.",
    href: featureLink("export-and-print"),
  },
];

/** A month's spending, for the analytics preview. Minor units, like the app. */
const spendByCategory = [
  { name: "Housing", icon: "🏠", value: 120000 },
  { name: "Groceries", icon: "🛒", value: 51350 },
  { name: "Food & Dining", icon: "🍽️", value: 18400 },
  { name: "Transport", icon: "🚆", value: 12600 },
  { name: "Utilities", icon: "💡", value: 6800 },
];

/** The vault's specifics, server-rendered beside the live panel. */
const fileFacts = [
  "Folders you can colour, tags you define",
  "Grid, list or column view",
  "Drag files in from your desktop",
  "A revocable share link per file",
  "1 GB per workspace, 5 MB per file",
  "Attachments live on the transaction too",
];

type Cell = string | boolean;

const comparison: {
  label: string;
  spendchat: Cell;
  bankApps: Cell;
  spreadsheet: Cell;
}[] = [
  { label: "Set up in under a minute", spendchat: true, bankApps: false, spreadsheet: false },
  { label: "Works without your bank login", spendchat: true, bankApps: false, spreadsheet: true },
  { label: "Handles cash", spendchat: true, bankApps: false, spreadsheet: true },
  { label: "Quick to add on a phone", spendchat: "Chat, AI or voice", bankApps: "Card spend only", spreadsheet: false },
  { label: "Categories you define", spendchat: true, bankApps: "Sometimes", spreadsheet: true },
  { label: "Separate books in one account", spendchat: "Profiles", bankApps: false, spreadsheet: "Extra sheets" },
  { label: "Share with roles", spendchat: "Viewer / editor / admin", bankApps: "Sometimes", spreadsheet: "File sharing" },
  { label: "Unlimited export", spendchat: "CSV + print", bankApps: "Often paid", spreadsheet: true },
  { label: "Source code you can read", spendchat: "AGPL-3.0", bankApps: false, spreadsheet: false },
];

const useCases = [
  {
    title: "Freelancers",
    body: "Keep business books separate from personal all year, then export just those at filing time.",
  },
  {
    title: "Families & couples",
    body: "A shared workspace for the household, private profiles for everything else.",
  },
  {
    title: "Students",
    body: "Free, no bank connection, and fast enough to log a ₹40 chai without thinking about it.",
  },
  {
    title: "Small businesses",
    body: "Invoices in, costs out, receipts attached — and an accountant who sees only what you grant.",
  },
  {
    title: "Cash-heavy days",
    body: "Market stalls, autos, tips. The spending no bank-linked app can see at all.",
  },
  {
    title: "Travel",
    body: "A profile per trip, so the total is clean when you get home instead of smeared across two months.",
  },
];

const steps = [
  {
    title: "Create your free account",
    body: "Sign up with your email or Google in seconds. No credit card, ever.",
  },
  {
    title: "Add however suits you",
    body: "Type it, say it, or paste a whole spreadsheet. Categories are one keystroke away.",
  },
  {
    title: "Track, filter & export",
    body: "Watch your balance update live, then filter, download, or print anytime.",
  },
];

function ComparisonCell({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <>
        <Check className="mx-auto size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <span className="sr-only">Yes</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus className="mx-auto size-4 text-muted-foreground/60" aria-hidden />
        <span className="sr-only">No</span>
      </>
    );
  }
  return <span className="text-xs">{value}</span>;
}

export default function LandingPage() {
  const features = publishedFeatures();
  const homeFaqs = faqs.slice(0, HOME_FAQ_COUNT);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: siteConfig.name,
    url: siteConfig.url,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description: siteConfig.description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    // Everything listed here is on the page below and shipped in the product.
    // `aggregateRating` is deliberately absent: we have no real ratings, and
    // inventing them is what manual actions are for.
    featureList: [
      "Chat-style expense entry",
      "AI entry from plain-English sentences",
      "Voice entry with multi-language transcription",
      "Bulk import from a spreadsheet",
      "Receipts and file attachments",
      "Spending analytics by category",
      "Multiple profiles for separate books",
      "Shared workspaces with roles",
      "CSV export and print",
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={faqJsonLd(homeFaqs)} />

      {/* Signed-in visitors only, and entirely client-side — this page stays
          statically rendered, so crawlers and signed-out visitors see the
          landing page exactly as before. Only mounted here: the other
          marketing pages (blog, docs, pricing) stay reachable while signed in. */}
      <AppHandoff />

      {/* Hero — fills the viewport (minus the fixed top nav). */}
      <section className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-6xl flex-col justify-center px-4 py-10">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="animate-rise min-w-0 text-center lg:text-left">
            <a
              href={siteConfig.links.github}
              target="_blank"
              rel="noreferrer"
              data-track-event="outbound_click"
              data-track-params={JSON.stringify({ destination: "github", location: "hero_badge" })}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Star className="size-3.5" /> Open source • Free • Private
            </a>
            <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Track your money like a conversation.
            </h1>
            <p className="mt-5 max-w-lg text-pretty text-lg text-muted-foreground mx-auto lg:mx-0">
              A minimal, fast, open-source expense and income tracker. Type it,
              say it, or paste a whole spreadsheet — then filter, download, and
              print whenever you need. No bank login. Free to use.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start">
              <Button asChild className={`${marketingCta} w-full lg:w-auto`}>
                <Link
                  href="/sign-up"
                  data-track-event="cta_click"
                  data-track-params={JSON.stringify({
                    location: "hero",
                    label: "start_tracking_free",
                  })}
                >
                  Start tracking free <ArrowRight />
                </Link>
              </Button>
              {/* On mobile these two share one row and together span the same
                  width as the button above; on desktop they sit inline. */}
              <div className="grid w-full grid-cols-[1fr_auto] items-center gap-2.5 lg:flex lg:w-auto">
                <Button
                  asChild
                  variant="outline"
                  className={`${marketingCta} w-full lg:w-auto`}
                >
                  <Link
                    href="/features"
                    data-track-event="nav_link_click"
                    data-track-params={JSON.stringify({
                      location: "hero",
                      label: "see_features",
                    })}
                  >
                    See features
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  aria-label="View SpendChat on GitHub"
                  className="size-12 shrink-0 rounded-xl"
                >
                  <a
                    href={siteConfig.links.github}
                    target="_blank"
                    rel="noreferrer"
                    data-track-event="outbound_click"
                    data-track-params={JSON.stringify({ destination: "github", location: "hero" })}
                  >
                    <GithubIcon className="size-5" />
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <div className="animate-rise min-w-0 lg:pl-4">
            {/* The same composer the app ships, at the density the app uses,
                with the input where the app puts it — at the bottom, under the
                feed. The rail is dropped: the hero has no room for it beside
                the copy, and the composer is what this section is about.

                Height takes as much of the fold as the hero can spare rather
                than a fixed figure: the demo is the thing worth showing, but a
                hero that outgrows the viewport hides its own buttons. The
                subtraction covers the nav, the section padding and the caption
                underneath, so it grows on a desktop and gives way on a laptop. */}
            <ChatDemo
              sidebar={false}
              className="h-[32rem] lg:h-[min(38rem,calc(100svh-13rem))]"
            />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Live demo — type an amount, pick a category, and hit send.
            </p>
          </div>
        </div>
      </section>

      {/* Trust strip — the four claims that decide whether someone reads on. */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {trustPoints.map((point) => {
            const inner = (
              <>
                <point.icon className="size-5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{point.label}</span>
                  <span className="text-sm text-muted-foreground">{point.body}</span>
                </span>
              </>
            );
            const className =
              "flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-background/60";
            return point.external ? (
              <a
                key={point.label}
                href={point.href}
                target="_blank"
                rel="noreferrer"
                className={className}
              >
                {inner}
              </a>
            ) : (
              <Link key={point.label} href={point.href} className={className}>
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Four ways to add a transaction */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        {/* The heading is passed in rather than rendered here: it pins with
            the demo, so it has to live inside that block. */}
        <EntryMethods
          header={
            <>
              <h2 className="text-3xl font-semibold tracking-tight">
                Four ways to add a transaction
              </h2>
              <p className="mt-3 hidden text-muted-foreground sm:block">
                The reason people stop tracking is friction, not intent — so
                what matters is the moment of entry. Keep scrolling and the
                composer works through all four: the fields you&apos;d type
                into, the sentence you&apos;d write, the key you&apos;d hold,
                the rows you&apos;d paste. Each one ends the same way, in the
                feed above it.
              </p>
            </>
          }
        />
      </section>

      {/* Analytics */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="min-w-0">
              <h2 className="text-3xl font-semibold tracking-tight">
                See where the money actually went
              </h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                A category breakdown, month-by-month totals, and income against
                expenses — for any date range you pick. There are no dashboards
                to build and nothing to configure: open it and the answer is
                already there.
              </p>
              {/* The numbers in plain text beside the chart — which is what
                  lets the chart itself be lazy. See `SpendBreakdown`. */}
              <SpendBreakdown data={spendByCategory} />
              <Link
                href={featureLink("analytics")}
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
              >
                More on analytics <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="min-w-0 rounded-2xl border bg-card p-4">
              <SpendChart data={spendByCategory} />
            </div>
          </div>
        </div>
      </section>

      {/* Profiles, workspaces */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex size-11 items-center justify-center rounded-xl border bg-background">
              <Users className="size-5" />
            </div>
            <h2 className="mt-4 text-xl font-medium">Separate books, one account</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Personal, Home and Business each get their own feed, balance and
              reports. Switch with a click, a swipe, or Shift and a number — and
              combine them whenever you want one number.
            </p>
            <Link
              href={featureLink("multiple-profiles")}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
            >
              Profiles <ArrowRight className="size-3.5" />
            </Link>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <div className="flex size-11 items-center justify-center rounded-xl border bg-background">
              <ShieldCheck className="size-5" />
            </div>
            <h2 className="mt-4 text-xl font-medium">Shared on your terms</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Invite your partner, family or accountant to a workspace and pick
              what each of them can do — view, edit, or administer. Access can be
              granted for one profile rather than everything.
            </p>
            <Link
              href={featureLink("workspaces")}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
            >
              Workspaces <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Receipts & files */}
      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
                <Paperclip className="size-3.5" /> Receipts &amp; files
              </span>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight">
                The receipt stays with the expense
              </h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Attach a bill, invoice or photo to any transaction and it lands
                in the vault beside it. Everything else lives in folders you
                colour and tags you define — and when someone needs one document
                rather than your account, they get a link to that one document.
              </p>
              {/* Rendered on the server, so the specifics are readable — and
                  indexable — whether or not the panel beside them ever loads. */}
              <ul className="mt-6 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                {fileFacts.map((fact) => (
                  <li key={fact} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden
                    />
                    {fact}
                  </li>
                ))}
              </ul>
              <Link
                href={featureLink("receipts-and-files")}
                data-track-event="nav_link_click"
                data-track-params={JSON.stringify({
                  location: "home_files",
                  label: "receipts-and-files",
                })}
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
              >
                More on receipts &amp; files <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="min-w-0">
              <FilesPreview />
            </div>
          </div>
        </div>
      </section>

      {/* Speed */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
                <Keyboard className="size-3.5" /> Built for speed
              </span>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight">
                Fast enough that you&apos;ll actually keep doing it
              </h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Single keys move between views and start an entry, ⌘/Ctrl combos
                send it, and every chip in the interface tells you its shortcut —
                so you learn them by using the app rather than by reading a
                manual. Press <Kbd combo={comboFor("global.shortcuts")} className="align-middle" /> for
                the full cheat sheet.
              </p>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Click the panel and try one. The keys come from the app&apos;s own
                registry, and nothing outside the panel hears them.
              </p>
              <Link
                href={featureLink("keyboard-shortcuts")}
                data-track-event="nav_link_click"
                data-track-params={JSON.stringify({
                  location: "home_shortcuts",
                  label: "keyboard-shortcuts",
                })}
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
              >
                Every shortcut <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="min-w-0">
              <ShortcutsPreview />
            </div>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            How it compares
          </h2>
          <p className="mt-3 text-muted-foreground">
            Honestly, including where it doesn&apos;t win.
          </p>
        </div>
        {/* Wide table, scrollable inside its own container so the page body
            never scrolls sideways on a phone. */}
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className="py-3 pr-4 text-left font-medium">
                  <span className="sr-only">Capability</span>
                </th>
                <th scope="col" className="px-3 py-3 text-center font-semibold">
                  {siteConfig.name}
                </th>
                <th scope="col" className="px-3 py-3 text-center font-medium text-muted-foreground">
                  Bank-linking apps
                </th>
                <th scope="col" className="px-3 py-3 text-center font-medium text-muted-foreground">
                  A spreadsheet
                </th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <th scope="row" className="py-3 pr-4 text-left font-normal">
                    {row.label}
                  </th>
                  <td className="px-3 py-3 text-center">
                    <ComparisonCell value={row.spendchat} />
                  </td>
                  <td className="px-3 py-3 text-center text-muted-foreground">
                    <ComparisonCell value={row.bankApps} />
                  </td>
                  <td className="px-3 py-3 text-center text-muted-foreground">
                    <ComparisonCell value={row.spreadsheet} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">
          Where a spreadsheet still wins: total control of the model, arbitrary
          formulas, and no dependency on anyone else&apos;s software. Where a
          bank-linked app still wins: it catches card spending you forgot to log.
          SpendChat is for people who&apos;d rather do the entry themselves and
          keep the bank out of it.
        </p>
      </section>

      {/* Use cases */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Who it&apos;s for</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map((useCase) => (
              <div key={useCase.title} className="rounded-xl border bg-card p-5">
                <h3 className="font-medium">{useCase.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {useCase.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature index — a plain, crawlable path to every feature page. */}
      {features.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              Explore every feature
            </h2>
            <p className="mt-3 text-muted-foreground">
              Each one has its own page, with a live demo you can try without
              signing up.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Link
                key={feature.slug}
                href={featurePath(feature.slug)}
                data-track-event="nav_link_click"
                data-track-params={JSON.stringify({
                  location: "home_feature_index",
                  label: feature.slug,
                })}
                className="group rounded-xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <FeatureIcon name={feature.icon} className="size-5" />
                </div>
                <h3 className="mt-4 font-medium">{feature.label}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{feature.blurb}</p>
              </Link>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button asChild variant="outline" className={marketingCta}>
              <Link href="/features">All features</Link>
            </Button>
          </div>
        </section>
      )}

      {/* Mobile */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl border bg-background">
            <Smartphone className="size-5" />
          </div>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight">
            Nothing to install
          </h2>
          <p className="mx-auto mt-3 max-w-xl leading-relaxed text-muted-foreground">
            SpendChat runs in any modern browser and adapts at every width — a
            bottom navigation bar and a full-width send button on phones, a
            sidebar on larger screens. Add it to your home screen and it behaves
            like an app, without an app store account or an update to install.
          </p>
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
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-xl border bg-card p-6">
              <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                {i + 1}
              </span>
              <h3 className="mt-4 font-medium">{step.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ teaser — the same entries the FAQPage markup above describes. */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            Frequently asked questions
          </h2>
          <dl className="mt-10 divide-y">
            {homeFaqs.map((faq) => (
              <div key={faq.q} className="py-5">
                <dt className="font-medium">{faq.q}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 text-center">
            <Button asChild variant="outline" className={marketingCta}>
              <Link
                href="/faq"
                data-track-event="nav_link_click"
                data-track-params={JSON.stringify({
                  location: "faq_teaser",
                  label: "read_all_faqs",
                })}
              >
                Read all FAQs
              </Link>
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
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild className={marketingCta}>
              <Link
                href="/sign-up"
                data-track-event="cta_click"
                data-track-params={JSON.stringify({
                  location: "final_cta",
                  label: "create_free_account",
                })}
              >
                Create your free account <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" className={marketingCta}>
              <a
                href={siteConfig.links.github}
                target="_blank"
                rel="noreferrer"
                data-track-event="outbound_click"
                data-track-params={JSON.stringify({
                  destination: "github",
                  location: "final_cta",
                })}
              >
                <GithubIcon /> View source
              </a>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
