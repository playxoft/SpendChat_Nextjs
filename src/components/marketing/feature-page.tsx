import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { FeatureIcon } from "@/components/marketing/feature-icon";
import { TryItCaption } from "@/components/marketing/demo/demo-caption";
import { featurePath, getFeature, relatedFeatures } from "@/lib/features";
import { breadcrumbJsonLd, faqJsonLd } from "@/lib/seo";
import { marketingCta } from "@/lib/marketing";

/**
 * The shared skeleton every `/features/*` page is built on.
 *
 * Consistency here is doing real work. Each of these pages targets a different
 * search term, but they're one topical cluster — a reader who arrives on the
 * voice page from Google and clicks through to profiles should feel like
 * they're moving around one site, not landing on a second one. It also makes
 * the SEO requirements structural rather than remembered: breadcrumbs, the
 * `BreadcrumbList` markup, the FAQ block with matching `FAQPage` markup, and at
 * least three outbound internal links all come for free with the shell, so a
 * new page can't quietly ship without them.
 */
export function FeaturePage({
  slug,
  intro,
  demo,
  demoAction,
  faqs,
  children,
}: {
  /** Must match an entry in `src/lib/features.ts`. */
  slug: string;
  /** The opening paragraph(s) — the first thing under the h1. */
  intro: ReactNode;
  /** The interactive demo. */
  demo: ReactNode;
  /** What to tell the visitor to try, e.g. "type an amount and hit send". */
  demoAction: string;
  /**
   * Page-specific Q&As. Rendered visibly *and* as `FAQPage` markup — the two
   * must stay in step, which is why they come from one array rather than being
   * written twice.
   */
  faqs: { q: string; a: string }[];
  /** The deep-dive sections, between the demo and the FAQ. */
  children: ReactNode;
}) {
  const feature = getFeature(slug);
  if (!feature) {
    throw new Error(
      `FeaturePage: "${slug}" is not a published feature. Add it to src/lib/features.ts and set published: true.`,
    );
  }

  const related = relatedFeatures(slug);
  const trail = [
    { name: "Home", path: "/" },
    { name: "Features", path: "/features" },
    { name: feature.label, path: featurePath(slug) },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-10 sm:pt-14">
      <JsonLd data={breadcrumbJsonLd(trail)} />
      {faqs.length > 0 && <JsonLd data={faqJsonLd(faqs)} />}

      <Breadcrumbs trail={trail} />

      {/* Hero */}
      <header className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <FeatureIcon name={feature.icon} className="size-3.5" />
          {feature.label}
        </span>
        <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          {feature.h1}
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
                location: `${slug}_hero`,
                label: "start_tracking_free",
              })}
            >
              Start tracking free <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" className={marketingCta}>
            <Link href="/features">All features</Link>
          </Button>
        </div>
      </header>

      {/* Demo */}
      <div className="mt-12">
        {demo}
        <TryItCaption action={demoAction} />
      </div>

      {/* Deep dives */}
      <div className="mt-16 space-y-14">{children}</div>

      {/* Related features — the cluster wiring. */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Related features</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <Link
                key={item.slug}
                href={featurePath(item.slug)}
                data-track-event="nav_link_click"
                data-track-params={JSON.stringify({
                  location: `${slug}_related`,
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

      {/* FAQ — the visible text and the structured data come from one array, so
          they can't drift. The answers stay mounted while collapsed (see
          `AccordionContent`), which is what keeps them in the server-rendered
          HTML that both crawlers and the `FAQPage` markup depend on. */}
      {faqs.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
          <Accordion type="multiple" className="mt-6 border-t">
            {faqs.map((faq) => (
              <AccordionItem key={faq.q} value={faq.q}>
                <AccordionTrigger>{faq.q}</AccordionTrigger>
                <AccordionContent className="leading-relaxed text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      )}

      {/* CTA */}
      <div className="mt-16 overflow-hidden rounded-3xl border bg-card px-6 py-14 text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          Start tracking in under a minute
        </h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Free, private, and no bank login. You can export everything and leave
          whenever you like.
        </p>
        <Button asChild className={`mt-8 ${marketingCta}`}>
          <Link
            href="/sign-up"
            data-track-event="cta_click"
            data-track-params={JSON.stringify({
              location: `${slug}_footer`,
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

/** A deep-dive section: one `<h2>` and its prose. */
export function FeatureSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/** The numbered "How it works" list, shared by every feature page. */
export function FeatureSteps({
  title = "How it works",
  steps,
}: {
  title?: string;
  steps: { title: string; body: string }[];
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="rounded-2xl border bg-card p-5">
            <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
              {i + 1}
            </span>
            <h3 className="mt-4 font-medium">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A "who it's for" grid — three concrete people, not personas. */
export function FeatureAudience({
  title = "Who it's for",
  items,
}: {
  title?: string;
  items: { title: string; body: string }[];
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="rounded-2xl border bg-card p-5">
            <h3 className="font-medium">{item.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
