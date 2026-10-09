import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, Download, GraduationCap, ShieldCheck, Tag, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FaqSection } from "@/components/marketing/faq-section";
import { JsonLd } from "@/components/json-ld";
import { ComparisonTable } from "@/components/pricing/comparison-table";
import { PlanCards, PricingExtras } from "@/components/pricing/plan-cards";
import { PricingStateProvider } from "@/components/pricing/pricing-state";
import { parseAcceptLanguage, regionFromLocale } from "@/lib/geo";
import { requestCountry } from "@/lib/geo.server";
import { marketingCta } from "@/lib/marketing";
import { PLAN_PITCH, PRICING_HERO, pricingFaqs } from "@/lib/plan-copy";
import { PERSONAL_PLANS, PLAN_NAMES, lowestPlanWith } from "@/lib/plans";
import { checkoutCurrencies, checkoutCurrency, currencyChoiceAllowed } from "@/lib/checkout";
import { STUDENT_DISCOUNT, TRIAL_DAYS, pct } from "@/lib/pricing";
import { createMetadata, faqJsonLd } from "@/lib/seo";

/**
 * The pricing page — Free, Plus and Pro, priced per workspace. Limits come
 * from `@/lib/plans`, prices from `@/lib/pricing` and every sentence from
 * `@/lib/plan-copy`, the same files the app enforces, charges from, and
 * uses in its own upgrade page — so the three can't disagree.
 *
 * Each paid card's button starts that plan's trial: it goes through sign-up
 * to checkout in the app, where the price is charged from the same list.
 */
export const metadata = createMetadata({
  title: "Pricing — Free Expense Tracker, Plus and Pro Plans",
  description: `Start free with unlimited transactions. Plus and Pro add more AI, storage and people, and ${PLAN_NAMES[lowestPlanWith("voice")]} adds voice — priced per workspace, with a ${TRIAL_DAYS}-day trial.`,
  path: "/pricing",
});

/**
 * The visitor's country — Cloudflare's, the one checkout charges by. Only in
 * local development, where there's no edge, the browser's language region
 * stands in for it.
 */
async function detectCountry(): Promise<string | null> {
  const cf = await requestCountry();
  if (cf || !currencyChoiceAllowed()) return cf;
  for (const tag of parseAcceptLanguage((await headers()).get("accept-language"))) {
    const region = regionFromLocale(tag);
    if (region) return region;
  }
  return "US";
}

const promises = [
  {
    icon: Timer,
    title: `${TRIAL_DAYS} days free on your first paid plan`,
    body: "Use the whole plan for three weeks before you pay anything — one trial per workspace. Cancel inside the trial and you're never charged.",
  },
  {
    icon: ShieldCheck,
    title: "A limit never deletes anything",
    body: "Reach a limit and you just can't add more of that one thing. Everything you already have stays.",
  },
  {
    icon: Download,
    title: "Export is never a paid feature",
    body: "CSV and PDF on every plan. Leaving should be as easy as arriving.",
  },
  {
    icon: GraduationCap,
    title: `${pct(STUDENT_DISCOUNT)} off for students`,
    body: "On Plus and Pro. Email us with your student ID and we'll set it up by hand.",
  },
];

const faqs = pricingFaqs({ selfHost: true });

export default async function PricingPage() {
  const country = await detectCountry();
  const currency = checkoutCurrency(undefined, country);

  return (
    <div className="relative">
      <JsonLd data={faqJsonLd(faqs)} />
      <PricingStateProvider
        initialCurrency={currency}
        currencies={checkoutCurrencies(country)}
        upi={country?.toUpperCase() === "IN"}
      >
        <div className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:pt-16">
          {/* Header */}
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
              <Tag className="size-3.5" /> {PRICING_HERO.eyebrow}
            </span>
            <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
              {PRICING_HERO.title}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
              {PRICING_HERO.body}
            </p>
          </div>

          <section aria-labelledby="plans-heading" className="mt-12">
            <h2 id="plans-heading" className="sr-only">
              Plans
            </h2>
            <PlanCards />
            <PricingExtras selfHost />
          </section>

          {/* The problem each plan removes */}
          <section className="mt-24">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Pick the problem you want gone
              </h2>
              <p className="mt-3 text-muted-foreground">
                The tracker is the same on every plan. What changes is how many people share it,
                how much typing the AI does for you, and how much you can keep.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {PERSONAL_PLANS.map((id) => (
                <div key={id} className="rounded-3xl border bg-card p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {PLAN_NAMES[id]}
                  </p>
                  <h3 className="mt-3 text-lg font-semibold leading-snug tracking-tight">
                    {PLAN_PITCH[id].headline}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {PLAN_PITCH[id].story}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Promises */}
          <section className="mt-24" aria-labelledby="promises-heading">
            <h2 id="promises-heading" className="sr-only">
              What every plan promises
            </h2>
            <div className="grid gap-px overflow-hidden rounded-3xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {promises.map(({ icon: Icon, title, body }) => (
                <div key={title} className="bg-card p-6">
                  <Icon className="size-5 text-muted-foreground" />
                  <h3 className="mt-4 text-sm font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Comparison */}
          <section className="mt-24">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Compare every plan
              </h2>
              <p className="mt-3 text-muted-foreground">
                Every number, side by side. Transactions are unlimited on all of them.
              </p>
            </div>
            <div className="mt-10">
              <ComparisonTable selfHost />
            </div>
          </section>

          <FaqSection
            faqs={faqs}
            heading="Pricing questions"
            className="mx-auto mt-24 max-w-3xl"
            answerClassName="text-base"
          />

          {/* CTA */}
          <div className="mt-24 rounded-3xl border bg-muted/50 px-6 py-16 text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Your first transaction takes ten seconds
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Start on Free. Upgrade when the AI saves you more time than it costs — not
              before.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild className={marketingCta}>
                <Link
                  href="/sign-up"
                  data-track-event="cta_click"
                  data-track-params={JSON.stringify({ location: "pricing_bottom_cta", label: "get_started" })}
                >
                  Start free <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" className={marketingCta}>
                <Link
                  href="/docs#self-hosting"
                  data-track-event="cta_click"
                  data-track-params={JSON.stringify({ location: "pricing_bottom_cta", label: "self_host" })}
                >
                  Self-host it
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </PricingStateProvider>
    </div>
  );
}
