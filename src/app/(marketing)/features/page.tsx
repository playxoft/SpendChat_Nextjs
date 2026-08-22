import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ChartColumn,
  Download,
  Gauge,
  Keyboard,
  ListPlus,
  Lock,
  MessageSquare,
  Mic,
  Moon,
  Paperclip,
  Printer,
  Search,
  Smartphone,
  Sparkles,
  Table2,
  Tags,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/icons/github";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { FeatureIcon } from "@/components/marketing/feature-icon";
import {
  FEATURE_GROUPS,
  featurePath,
  featuresInGroup,
  publishedFeatures,
} from "@/lib/features";
import { breadcrumbJsonLd, createMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";
import { marketingCta } from "@/lib/marketing";

export const metadata = createMetadata({
  title: "Features",
  description:
    "Chat, AI and voice entry, bulk import, receipts, analytics, profiles and shared workspaces — everything SpendChat does, and why each part exists.",
  path: "/features",
});

const highlights = [
  {
    icon: Gauge,
    stat: "Seconds",
    label: "to log a transaction — type it, say it, or paste a list.",
  },
  {
    icon: Wallet,
    stat: "Always free",
    label: "open source and free to use, with no ads.",
  },
  {
    icon: Lock,
    stat: "No bank login",
    label: "we never ask for your banking credentials.",
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
        icon: Sparkles,
        title: "AI entry, in plain English",
        body: "Type “coffee 4.50 and 62 on groceries” and the AI turns it into categorised drafts — amount, category, date, income or expense. Nothing is saved until you look it over and confirm, so a misread merchant never becomes a wrong record.",
      },
      {
        icon: Mic,
        title: "Voice entry",
        body: "Hold M and say what you spent. The recording is transcribed and dropped into the AI note for you to check. You name the languages you speak in Settings, and because the model is told all of them at once, sentences that switch mid-way still come out right.",
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
        icon: Table2,
        title: "Filter & search",
        body: "Find anything fast. Filter by custom date range, income or expense, and category, or search across your notes. Choose which columns the table shows, in what order, at what width — and export exactly the view you're looking at.",
      },
      {
        icon: ChartColumn,
        title: "Analytics",
        body: "See where the money actually went: a category breakdown, month-by-month totals, and income against expenses across any date range you pick. No dashboards to build — open it and the answer is there.",
      },
      {
        icon: Paperclip,
        title: "Receipts & files",
        body: "Attach a receipt, bill or invoice to any transaction, and keep everything else in a Drive-style vault with folders, colour tags, drag-and-drop and share links. Every workspace gets 1 GB.",
      },
      {
        icon: Search,
        title: "A clear, running picture",
        body: "Your balance updates live as you add transactions, grouped by day and month so the story of your year reads top to bottom. The important numbers are always in view.",
      },
    ],
  },
  {
    eyebrow: "Organise",
    title: "Separate books, shared on your terms",
    items: [
      {
        icon: Users,
        title: "Multiple profiles",
        body: "Give Personal, Home and Business each their own feed, balance and reports, then switch between them with a click, a swipe, or Shift and a number. One account, genuinely separate books.",
      },
      {
        icon: Building2,
        title: "Workspaces & sharing",
        body: "Invite your partner, family or accountant into a workspace and pick what each of them can do — view, edit, or administer. Categories and currency are shared, so everyone's numbers line up.",
      },
      {
        icon: Tags,
        title: "Your categories",
        body: "Start from a sensible default set, then rename them, change their icons, or add your own. Categories belong to the workspace, so a shared household is always reporting on the same buckets.",
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
        body: "Export the current, filtered view to a clean CSV in one click. Perfect for backups, spreadsheets, or sharing with an accountant. No paid tier gating it, and no watermark.",
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
        body: "Authentication is handled by Firebase Authentication, with Google and email/password sign-in. We never ask for banking credentials. Every query is scoped to your account, all input is validated, and the app ships with strict security headers.",
      },
      {
        icon: Smartphone,
        title: "Mobile, tablet & desktop",
        body: "A responsive layout adapts to any screen — a bottom navigation bar on phones, a sidebar on larger screens — so the experience always feels native.",
      },
      {
        icon: Moon,
        title: "Light & dark, minimal by design",
        body: "A calm, neutral interface with no noisy gradients. Switch between light, dark, or system themes, and turn on compact density when you want more rows on screen.",
      },
      {
        icon: Keyboard,
        title: "Keyboard-friendly",
        body: "Fly without reaching for the mouse. Single-key shortcuts jump between views and add transactions, with ⌘/Ctrl combos that adapt to macOS, Windows, and Linux. Press / for the full cheat sheet.",
      },
    ],
  },
];

export default function FeaturesPage() {
  const spokes = publishedFeatures();

  const trail = [
    { name: "Home", path: "/" },
    { name: "Features", path: "/features" },
  ];

  // Only describe the directory to search engines when there's a directory to
  // describe — an `ItemList` of zero items is noise, not structured data.
  const itemListJsonLd =
    spokes.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${siteConfig.name} features`,
          itemListElement: spokes.map((feature, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: feature.label,
            url: `${siteConfig.url}${featurePath(feature.slug)}`,
          })),
        }
      : null;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:pt-16">
      <JsonLd data={breadcrumbJsonLd(trail)} />
      {itemListJsonLd && <JsonLd data={itemListJsonLd} />}

      <Breadcrumbs trail={trail} />

      {/* Header */}
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" /> Features
        </span>
        <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Built to make tracking effortless
        </h1>
        <p className="mt-4 text-pretty text-lg text-muted-foreground">
          Type it, say it, or paste a whole spreadsheet. A focused toolkit for
          personal finance — quick to use, easy to trust, and open source.
        </p>
        <div className="mt-8 flex justify-center">
          <Button asChild className={marketingCta}>
            <Link
              href="/sign-up"
              data-track-event="cta_click"
              data-track-params={JSON.stringify({
                location: "features_header",
                label: "start_tracking_free",
              })}
            >
              Start tracking free <ArrowRight />
            </Link>
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

      {/* Feature directory — the hub half of the hub-and-spoke. Renders only
          once there are pages to point at, so this section never ships empty. */}
      {spokes.length > 0 && (
        <div className="mt-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Every feature, explained
            </h2>
            <p className="mt-3 text-muted-foreground">
              Each one has its own page — what it does, why it works that way,
              and a live demo you can try without signing up.
            </p>
          </div>

          <div className="mt-10 space-y-10">
            {FEATURE_GROUPS.map((group) => {
              const items = featuresInGroup(group.id);
              if (items.length === 0) return null;
              return (
                <section key={group.id}>
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-medium">{group.label}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {group.blurb}
                    </p>
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((feature) => (
                      <Link
                        key={feature.slug}
                        href={featurePath(feature.slug)}
                        data-track-event="nav_link_click"
                        data-track-params={JSON.stringify({
                          location: "features_hub",
                          label: feature.slug,
                        })}
                        className="group flex flex-col rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="flex size-10 items-center justify-center rounded-xl border bg-background transition-colors group-hover:bg-muted">
                          <FeatureIcon name={feature.icon} className="size-5" />
                        </div>
                        <h4 className="mt-4 font-medium">{feature.label}</h4>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                          {feature.blurb}
                        </p>
                        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
                          Learn more
                          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

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
            <Link
              href="/sign-up"
              data-track-event="cta_click"
              data-track-params={JSON.stringify({
                location: "features_footer",
                label: "get_started",
              })}
            >
              Get started <ArrowRight />
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
                location: "features_footer",
              })}
            >
              <GithubIcon /> View source
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
