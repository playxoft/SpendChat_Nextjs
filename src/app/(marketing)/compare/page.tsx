import Link from "next/link";
import { ArrowRight, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { comparePath, publishedComparisons } from "@/lib/compare";
import { marketingCta } from "@/lib/marketing";
import { breadcrumbJsonLd, createMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

export const metadata = createMetadata({
  title: "Compare SpendChat With Other Expense Trackers",
  description:
    "Honest, dated comparisons of SpendChat with Splitwise, Walnut, Monefy, Mint and YNAB: what each does better, what it costs, and who should pick which.",
  path: "/compare",
});

const trail = [
  { name: "Home", path: "/" },
  { name: "Compare", path: "/compare" },
];

export default function ComparePage() {
  const comparisons = publishedComparisons();
  const itemListJsonLd =
    comparisons.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: comparisons.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `${siteConfig.name} vs ${c.competitor}`,
            url: `${siteConfig.url}${comparePath(c.slug)}`,
          })),
        }
      : null;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:pt-16">
      <JsonLd data={breadcrumbJsonLd(trail)} />
      {itemListJsonLd && <JsonLd data={itemListJsonLd} />}

      <Breadcrumbs trail={trail} />

      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <Scale className="size-3.5" /> Compare
        </span>
        <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          How {siteConfig.name} compares
        </h1>
        <p className="mt-4 text-pretty text-lg text-muted-foreground">
          The apps people ask about most, side by side with this one. Each page says what the
          other product does better as plainly as what we do, and shows the date its facts
          were last checked.
        </p>
        <div className="mt-8 flex justify-center">
          <Button asChild className={marketingCta}>
            <Link
              href="/sign-up"
              data-track-event="cta_click"
              data-track-params={JSON.stringify({
                location: "compare_hub_header",
                label: "start_tracking_free",
              })}
            >
              Start tracking free <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>

      {comparisons.length > 0 && (
        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {comparisons.map((c) => (
            <Link
              key={c.slug}
              href={comparePath(c.slug)}
              data-track-event="nav_link_click"
              data-track-params={JSON.stringify({ location: "compare_hub", label: c.slug })}
              className="group flex flex-col rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <h2 className="font-medium">
                {siteConfig.name} vs {c.competitor}
              </h2>
              <p className="mt-1.5 flex-1 text-sm text-muted-foreground">{c.blurb}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
                Read the comparison{" "}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}

          {/* The request card. It earns its place twice over: the app someone
              wanted to read about and didn't find is the most useful thing this
              page can learn, and it squares off a row that five comparisons
              leave open. Dashed, so it reads as an invitation rather than as a
              sixth comparison that exists. */}
          <a
            href={siteConfig.links.githubIssues}
            target="_blank"
            rel="noreferrer"
            data-track-event="outbound_click"
            data-track-params={JSON.stringify({
              destination: "github_issues",
              location: "compare_hub",
            })}
            className="group flex flex-col rounded-2xl border border-dashed bg-muted/20 p-5 transition-all hover:-translate-y-0.5 hover:bg-muted/40 hover:shadow-md"
          >
            {/* Deliberately not an `h2` like the comparison cards beside it:
                this is a call to action, not a section of the page, and a
                heading here would put it in the outline as though it were. */}
            <p className="font-medium">Not the app you use?</p>
            <p className="mt-1.5 flex-1 text-sm text-muted-foreground">
              Tell us which tracker to write up next and we&apos;ll put it through
              the same treatment — including the parts it does better.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
              Request a comparison{" "}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </a>
        </div>
      )}

      <section className="mx-auto mt-20 max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight">How these pages are written</h2>
        <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
          <p>
            We use the other product before writing about it, check every price and feature
            against its own website or store listing, and print the date we did. If a
            competitor is the better choice for you, the page says so. When something changes,
            open an issue on GitHub and we&apos;ll correct the row.
          </p>
          <p>
            What stays the same on every page: {siteConfig.name} is free, open source under the
            AGPL, never connects to your bank, and exports everything so you can leave.
          </p>
        </div>
      </section>
    </div>
  );
}
