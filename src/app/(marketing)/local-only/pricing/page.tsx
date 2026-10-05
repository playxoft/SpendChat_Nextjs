import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowRight, Download, GraduationCap, Lock, Tag, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FaqSection } from "@/components/marketing/faq-section";
import { parseAcceptLanguage, regionFromLocale } from "@/lib/geo";
import { marketingCta } from "@/lib/marketing";
import { INVOICE_LIMITS, PLAN_GRACE_DAYS, TOPUP, VOICE } from "@/lib/plans";
import { STUDENT_DISCOUNT, TRIAL_DAYS, currencyForCountry, pct } from "@/lib/pricing";
import { createMetadata, type Faq } from "@/lib/seo";
import { siteConfig } from "@/lib/site";
import { ComparisonChart } from "./_components/comparison-chart";
import { PricingExplorer } from "./_components/pricing-explorer";
import { PricingStateProvider } from "./_components/pricing-state";
import { count, plansWith } from "./_data/plan-copy";

/**
 * Draft of the paid pricing page — personal plans (Free, Plus, Pro), priced
 * per workspace, as agreed 2026-10-05. Limits come from `@/lib/plans` and
 * prices from `@/lib/pricing`, the same files the app will enforce and charge
 * from. Local only: 404s in production, noindexed, and not in the sitemap,
 * because the live `/pricing` still promises plans will be announced first.
 */
export const metadata = createMetadata({
  title: "Pricing — Free Expense Tracker with AI Plans",
  description:
    `SpendChat is a free expense tracker, forever. Upgrade a workspace for more AI, voice entry and storage — every paid plan starts with a ${TRIAL_DAYS}-day free trial.`,
  path: "/local-only/pricing",
  noIndex: true,
});

async function detectCountry(): Promise<string> {
  const h = await headers();
  const cf = h.get("cf-ipcountry");
  if (cf && cf !== "XX" && cf !== "T1") return cf;
  for (const tag of parseAcceptLanguage(h.get("accept-language"))) {
    const region = regionFromLocale(tag);
    if (region) return region;
  }
  return "US";
}

const promises = [
  {
    icon: Timer,
    title: `${TRIAL_DAYS} days free on every paid plan`,
    body: "Use the whole plan for three weeks before you pay a thing. Cancel inside the trial and you're never charged.",
  },
  {
    icon: Lock,
    title: "Early users keep their price",
    body: "Whatever you first pay is yours for as long as your subscription stays active.",
  },
  {
    icon: Download,
    title: "Export is never a paid feature",
    body: "CSV and PDF on every plan. Leaving should be as easy as arriving.",
  },
  {
    icon: GraduationCap,
    title: `${Math.round(STUDENT_DISCOUNT * 100)}% off for students`,
    body: "On Plus and Pro, with a valid student email or ID at checkout.",
  },
];

const freeInvoices = INVOICE_LIMITS.free;

const faqs: Faq[] = [
  {
    q: "How does the free trial work?",
    a: `Every paid plan starts with ${TRIAL_DAYS} days free, with every feature of that plan. We remind you before the trial ends; cancel before then and you're never charged. If you don't cancel, the plan starts on the billing period you chose.`,
  },
  {
    q: "Can I get a refund?",
    a: `Because every plan starts with a ${TRIAL_DAYS}-day free trial, payments are non-refundable once the trial has converted. Any refund is at ${siteConfig.name}'s sole discretion. You can cancel any time and keep the plan until the end of the period you've paid for.`,
  },
  {
    q: "Which billing periods can I choose?",
    a: "Plus and Pro can be paid monthly, every 3 months or yearly. Longer periods cost much less per month — each card shows its exact saving against paying monthly for the period you pick. The invoice add-on is monthly or yearly.",
  },
  {
    q: "Is there a student discount?",
    a: `Yes — ${pct(STUDENT_DISCOUNT)} off Plus and Pro for students, verified with a student email or ID at checkout. It lasts as long as you're studying.`,
  },
  {
    q: "What counts as an AI action?",
    a: `One note or receipt that the AI turns into transactions. A voice clip costs one per started minute, up to ${VOICE.maxClipMs / 60_000} minutes a clip. The monthly allowance is shared by everyone in the workspace. Typing or bulk-adding entries yourself is never counted, on any plan. If you run out on ${plansWith("topUps")}, a top-up adds ${count(TOPUP.actions)} more, valid for ${TOPUP.validityMonths} months — and nothing is ever locked.`,
  },
  {
    q: "Do I need a paid plan to send invoices?",
    a: `No. Every workspace can create ${count(freeInvoices.perMonth)} invoices and quotes a month, for ${freeInvoices.clients === null ? "any number of" : `up to ${count(freeInvoices.clients)}`} clients, with ${freeInvoices.templates} templates. The invoice add-on, on any plan, lifts those limits and adds email, reminders, recurring invoices and GST fields.`,
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Nothing is deleted. The workspace drops back to Free, keeps every transaction, and you can export everything at any time. Anything over a Free limit — members, spaces, files — stays readable but turns view-only until you upgrade again or tidy up.",
  },
  {
    q: "Is self-hosting really free?",
    a: `Yes. ${siteConfig.name} is ${siteConfig.license} — every feature, on your own infrastructure, forever. Paid plans pay for the hosted version's AI, storage and support.`,
  },
  {
    q: "I'm already using SpendChat for free. What changes?",
    a: `Nothing, at first: every existing workspace keeps everything it has for ${PLAN_GRACE_DAYS} days after paid plans launch. Nothing is ever deleted — after that, anything over a Free limit turns view-only until the workspace upgrades or tidies up. Anyone who upgrades early keeps that price for as long as they stay subscribed.`,
  },
];

export default async function DraftPricingPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const currency = currencyForCountry(await detectCountry());

  return (
    <div className="relative">
      <PricingStateProvider initialCurrency={currency}>
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:pt-16">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
            <Tag className="size-3.5" /> Pricing
          </span>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Free expense tracker, AI when you want it
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
            Track every expense, income and receipt for free, for as long as you like.
            Upgrade for more AI, voice entry, and room for everyone you track with.
          </p>
        </div>

        <div className="mt-12">
          <PricingExplorer />
        </div>

        {/* Promises */}
        <section className="mt-24">
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
              The core tracker is the same on every plan. What changes is AI, storage and
              how many people share it.
            </p>
          </div>
          <div className="mt-10">
            <ComparisonChart />
          </div>
        </section>

        <FaqSection
          faqs={faqs}
          heading="Pricing questions"
          className="mx-auto mt-24 max-w-3xl"
          answerClassName="text-base"
        />
        <p className="mx-auto mt-6 max-w-3xl text-sm text-muted-foreground">
          Trials, renewals, cancellation and refunds are covered in full in the{" "}
          <Link href="/local-only/billing-policy" className="underline underline-offset-4 hover:text-foreground">
            billing &amp; refund policy
          </Link>
          .
        </p>

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
                Start for free <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className={marketingCta}
            >
              <Link href="/docs#self-hosting">Self-host it</Link>
            </Button>
          </div>
        </div>
      </div>
      </PricingStateProvider>
    </div>
  );
}
