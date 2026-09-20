import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ChartColumn,
  Coins,
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
import { FeatureIcon } from "@/components/marketing/feature-icon";
import {
  AnalyticsMock,
  BentoShowcase,
  BentoStack,
  BulkMock,
  CategoriesMock,
  ExportMock,
  ChatMock,
  DraftMock,
  FilesMock,
  FilterMock,
  GlyphMock,
  KeysMock,
  MembersMock,
  PrivacyMock,
  ProfilesMock,
  VoiceMock,
  type BentoItem,
} from "@/components/marketing/bento";
import {
  FEATURE_GROUPS,
  featurePath,
  featuresInGroup,
  publishedFeatures,
} from "@/lib/features";
import { bento } from "@/lib/grid-fill";
import { createMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";
import { marketingCta } from "@/lib/marketing";
import { cn } from "@/lib/utils";

export const metadata = createMetadata({
  title: "Features",
  description:
    "Chat, AI and voice entry, bulk import, receipts, analytics, profiles and shared workspaces — everything SpendChat does, and why each part exists.",
  path: "/features",
});

/**
 * The panel for each feature page, by slug — used by the directory groups under
 * "Every feature, explained".
 *
 * Keyed on slug rather than held in `src/lib/features.ts`, which is
 * deliberately free of React and `lucide-react` so `sitemap.ts` can read it
 * inside a Worker route. Same split the icons already use.
 */
const FEATURE_PANELS: Record<string, React.ReactNode> = {
  "chat-expense-tracker": <ChatMock />,
  "ai-expense-tracker": <DraftMock />,
  "voice-expense-tracker": <VoiceMock />,
  "bulk-add": <BulkMock />,
  transactions: <FilterMock />,
  analytics: <AnalyticsMock />,
  "receipts-and-files": <FilesMock />,
  "export-and-print": <ExportMock />,
  "multiple-profiles": <ProfilesMock />,
  workspaces: <MembersMock />,
  categories: <CategoriesMock />,
  "keyboard-shortcuts": <KeysMock />,
  "privacy-and-security": <PrivacyMock />,
};

/**
 * A second line for the directory cells whose blurb is too short to sit under
 * a panel without looking unfinished.
 *
 * Kept separate from `blurb` in `src/lib/features.ts` on purpose: that string
 * is also the hub card, the "Related features" block and the home index, where
 * one tight line is exactly right. Only the bento has the room, so only the
 * bento pays for the extra sentence. A slug with no entry simply renders none.
 */
const FEATURE_EXTRAS: Record<string, string> = {
  "ai-expense-tracker":
    "Nothing saves until you confirm the rows, so a misread merchant never quietly becomes a number you trust six months later.",
  "voice-expense-tracker":
    "The languages you speak are a list rather than one setting — which is what stops a code-mixed sentence coming back transliterated into nonsense.",
  analytics:
    "No dashboard to build and nothing to configure: open it and the answer is there, usually with something mildly embarrassing at the top.",
  "keyboard-shortcuts":
    "Everything the mouse can do, without reaching for it. Logging a coffee shouldn't cost more attention than drinking it.",
};

/** Design B: why it works this way — the claims that decide the choice. */
const principlesBento: BentoItem[] = [
  {
    label: "No bank login, ever",
    body:
      "Handing a third party read access to your account is a permanent risk taken for a convenience you may not need.",
    extra: (
      <ul className="space-y-1.5">
        <li>· Nothing here asks for banking credentials</li>
        <li>· Cash, transfers and IOUs are recorded the same way</li>
        <li>· Nothing to revoke later, because nothing was granted</li>
      </ul>
    ),
    visual: <GlyphMock icon={Lock} />,
  },
  {
    label: "Open source",
    body:
      "AGPL-3.0, and the whole application — so \"we don't sell your data\" is checkable against the source rather than taken on trust.",
    visual: <GlyphMock icon={GithubIcon} />,
  },
  {
    label: "Free, with no locked tier",
    body:
      "No ads, and no feature held back behind a plan. What you see on this page is what you get.",
    visual: <GlyphMock icon={Wallet} />,
  },
  {
    label: "Yours to take",
    body:
      "Export everything as CSV whenever you like, filtered however you like, and print the same view.",
    extra: (
      <ul className="space-y-1.5">
        <li>· Filter first, so the file needs no trimming afterwards</li>
        <li>· Attachments stay on the transactions they belong to</li>
        <li>· Leaving is a download, not a support ticket</li>
      </ul>
    ),
    visual: <GlyphMock icon={Gauge} />,
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
      {
        icon: Coins,
        title: "One currency, everyone's screen",
        body: "A workspace has a single currency and number format, set once by an admin and picked for you from where you sign up. Every member reads the same figures the same way, so a shared total never has to be mentally converted before it means anything.",
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
      {itemListJsonLd && <JsonLd data={itemListJsonLd} />}

      {/* No breadcrumb trail here, unlike the feature spokes and blog posts. On
          a first-level page it reads "Home > Features" — one link, to where the
          nav's logo already goes. Its `BreadcrumbList` went with it rather than
          staying behind, since markup for navigation the reader can't see is the
          mismatch the spam policies target; the hierarchy signal survives in the
          spokes' trails, which name this page as their parent. */}

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

      {/* Why it works this way — Design B: two mirrored columns, text-led,
          replacing the three-stat strip that used to sit here. The claims are
          the reason someone picks this over a bank app, and three short stats
          in equal boxes gave them no room to be convincing. */}
      <section className="mt-6">
        <h2 className="sr-only">Why SpendChat works this way</h2>
        <BentoStack items={principlesBento} />
      </section>

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
                  {/* The directory group as a bento: a panel of the surface
                      each feature actually is, with the name and blurb beneath
                      it. Still links — a bento must not cost the crawlable
                      href or the "Learn more" affordance the grid had. */}
                  <BentoShowcase
                    items={items.map((f) => ({
                      label: f.label,
                      body: f.blurb,
                      extra: FEATURE_EXTRAS[f.slug],
                      href: featurePath(f.slug),
                      trackLocation: "features_hub",
                      trackLabel: f.slug,
                      visual: FEATURE_PANELS[f.slug] ?? (
                        <span className="flex size-24 items-center justify-center rounded-2xl border bg-muted/40 text-muted-foreground">
                          <FeatureIcon name={f.icon} className="size-10" />
                        </span>
                      ),
                    }))}
                    className="mt-5"
                  />
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* Grouped feature sections */}
      <div className="mt-20 space-y-16">
        {groups.map((group) => {
          // Prose cards, not a bento — deliberately. The directory above uses
          // the same three headings (Capture / Understand / Organise) and now
          // carries the mock panels; running a second bento here would show the
          // reader the same chat bubbles and the same member list twice on one
          // page. These sections are the long-form explanation underneath, and
          // a quiet two-column grid is what lets the bento above stay the thing
          // you look at.
          //
          // The groups hold an even number of cards today, which is the only
          // reason the grid squares off — not a property a literal array keeps,
          // so the remainder is computed. See `src/lib/grid-fill.ts`.
          const cells = bento(group.items.length, { md: 2 });
          return (
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
                {group.items.map((item, i) => (
                  <div
                    key={item.title}
                    className={cn(
                      "group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md",
                      cells[i]!.span,
                    )}
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
          );
        })}
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
