import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { FaqSection } from "@/components/marketing/faq-section";
import { FeatureIcon } from "@/components/marketing/feature-icon";
import { comparePath, getComparison } from "@/lib/compare";
import { featurePath, getFeature } from "@/lib/features";
import { breadcrumbJsonLd, faqJsonLd, type Faq } from "@/lib/seo";
import { marketingCta } from "@/lib/marketing";
import { siteConfig } from "@/lib/site";

/** One row of the at-a-glance table. Cells are short: a phrase, not a paragraph. */
export type CompareRow = { label: string; spendchat: ReactNode; competitor: ReactNode };

/**
 * The shared skeleton every `/compare/*` page is built on — the comparison
 * cousin of `FeaturePage`, and structural for the same reason: breadcrumbs,
 * `BreadcrumbList` and `FAQPage` markup, the verified-on date, and the links
 * back into the feature cluster all come with the shell, so a page can't
 * quietly ship without them.
 *
 * Tone is set here too. These pages exist to be the honest answer to "should I
 * use this or that?", which means the competitor's strengths are stated in the
 * same voice as ours. A page that only lists wins reads as an ad, ranks like
 * one, and gets picked apart in the first comment thread that links it.
 */
export function ComparePage({
  slug,
  intro,
  rows,
  faqs,
  relatedFeatures,
  children,
}: {
  /** Must match a published entry in `src/lib/compare.ts`. */
  slug: string;
  /** The opening paragraph(s) under the h1 — say what each product is for. */
  intro: ReactNode;
  /** The at-a-glance table. */
  rows: CompareRow[];
  /** Rendered visibly and as `FAQPage` markup from the same array. */
  faqs: Faq[];
  /** Feature slugs this comparison keeps mentioning — the cluster wiring. */
  relatedFeatures: string[];
  /** The prose sections between the table and the FAQ. */
  children: ReactNode;
}) {
  const comparison = getComparison(slug);
  if (!comparison) {
    throw new Error(
      `ComparePage: "${slug}" is not a published comparison. Add it to src/lib/compare.ts and set published: true.`,
    );
  }

  const related = relatedFeatures
    .map((s) => getFeature(s))
    .filter((f): f is NonNullable<typeof f> => Boolean(f));
  const trail = [
    { name: "Home", path: "/" },
    { name: "Compare", path: "/compare" },
    { name: `vs ${comparison.competitor}`, path: comparePath(slug) },
  ];
  const verified = new Date(`${comparison.verifiedOn}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-10 sm:pt-14">
      <JsonLd data={breadcrumbJsonLd(trail)} />
      {faqs.length > 0 && <JsonLd data={faqJsonLd(faqs)} />}

      <Breadcrumbs trail={trail} />

      {/* Hero */}
      <header className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <Scale className="size-3.5" />
          Compare
        </span>
        <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          {comparison.h1}
        </h1>
        <div className="mt-5 space-y-4 text-pretty text-lg leading-relaxed text-muted-foreground">
          {intro}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild className={marketingCta}>
            <Link
              href="/sign-up"
              data-track-event="cta_click"
              data-track-params={JSON.stringify({
                location: `compare_${slug}_hero`,
                label: "start_tracking_free",
              })}
            >
              Start tracking free <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" className={marketingCta}>
            <Link href="/compare">All comparisons</Link>
          </Button>
        </div>
      </header>

      {/* At a glance */}
      <section className="mt-14">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">At a glance</h2>
        <div className="mt-6 overflow-x-auto rounded-2xl border bg-card">
          <Table className="min-w-[36rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40 pl-5" scope="col">
                  <span className="sr-only">What</span>
                </TableHead>
                <TableHead scope="col" className="font-semibold text-foreground">
                  {siteConfig.name}
                </TableHead>
                <TableHead scope="col" className="font-semibold text-foreground">
                  {comparison.competitor}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableHead scope="row" className="whitespace-normal pl-5 font-medium">
                    {row.label}
                  </TableHead>
                  <TableCell className="whitespace-normal align-top text-muted-foreground">
                    {row.spendchat}
                  </TableCell>
                  <TableCell className="whitespace-normal align-top text-muted-foreground">
                    {row.competitor}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {comparison.competitor} facts checked against its own site and store listings on{" "}
          {verified}. Spotted a change?{" "}
          <a
            href={`${siteConfig.links.github}/issues`}
            className="underline underline-offset-4 hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
          >
            Tell us
          </a>{" "}
          and we&apos;ll fix the row.
        </p>
      </section>

      {/* Prose */}
      <div className="mt-16 space-y-14">{children}</div>

      {/* Related features — the cluster wiring. */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Mentioned above</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <Link
                key={item.slug}
                href={featurePath(item.slug)}
                data-track-event="nav_link_click"
                data-track-params={JSON.stringify({
                  location: `compare_${slug}_related`,
                  label: item.slug,
                })}
                className="group rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex size-10 items-center justify-center rounded-xl border bg-background transition-colors group-hover:bg-muted">
                  <FeatureIcon name={item.icon} className="size-5" />
                </div>
                <h3 className="mt-4 font-medium">{item.label}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{item.blurb}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <FaqSection faqs={faqs} heading="FAQ" />

      {/* CTA */}
      <div className="mt-16 overflow-hidden rounded-3xl border bg-card px-6 py-14 text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          Try it next to what you use now
        </h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Free, no bank login, nothing to install. Log this week&apos;s spending in both and
          keep whichever one you still open on Friday.
        </p>
        <Button asChild className={`mt-8 ${marketingCta}`}>
          <Link
            href="/sign-up"
            data-track-event="cta_click"
            data-track-params={JSON.stringify({
              location: `compare_${slug}_footer`,
              label: "create_free_account",
            })}
          >
            Create your free account <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** A prose section: one `<h2>` and its paragraphs. */
export function CompareSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/**
 * The two honest lists, side by side: what the other product does better, and
 * what SpendChat does better. Both are required — a comparison with one column
 * empty is an advert, and this component won't render one.
 */
export function CompareVerdict({
  competitor,
  theirs,
  ours,
}: {
  competitor: string;
  theirs: string[];
  ours: string[];
}) {
  if (theirs.length === 0 || ours.length === 0) {
    throw new Error("CompareVerdict: both columns need at least one point.");
  }
  return (
    <section>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Where each one wins</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="font-medium">Pick {competitor} if you want</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            {theirs.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="font-medium">Pick {siteConfig.name} if you want</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            {ours.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
