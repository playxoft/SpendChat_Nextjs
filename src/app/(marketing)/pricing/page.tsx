import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, Heart, Server, Tag, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";
import { marketingCta } from "@/lib/marketing";

/** Pricing cards use a slightly shorter, full-width CTA than the hero-sized
 *  `marketingCta`, so each card's button sits comfortably at its foot. */
const pricingCta =
  "h-11 w-full gap-2 rounded-xl px-6 text-base [&_svg:not([class*='size-'])]:size-5";

export const metadata: Metadata = {
  title: "Pricing",
  description: `${siteConfig.name} is free and open source. There are no paid plans today — host it yourself or use the hosted app at no cost. Paid plans may be announced later.`,
  alternates: { canonical: "/pricing" },
};

const included = [
  "Unlimited income & expense tracking",
  "Chat-style entry and bulk add",
  "Filters, search, and a running balance",
  "CSV export and print / PDF",
  "Multiple tracker profiles",
  "Light & dark themes, mobile to desktop",
  "Private by design — no ads, never sold",
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:pt-16">
      {/* Header */}
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <Tag className="size-3.5" /> Pricing
        </span>
        <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Free while we figure pricing out
        </h1>
        <p className="mt-4 text-pretty text-lg text-muted-foreground">
          {siteConfig.name} is open source and free to use. We haven&apos;t decided on
          pricing yet — and if paid plans ever arrive, we&apos;ll announce them here in
          advance.
        </p>
      </div>

      {/* Plans — both cards share the same structure so titles align at the top
          and the button rows align at the bottom (mt-auto + equal-height grid). */}
      <div className="mx-auto mt-14 grid max-w-3xl items-stretch gap-5 md:grid-cols-2">
        {/* Free / hosted */}
        <div className="flex flex-col rounded-2xl border bg-card p-7 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex size-11 items-center justify-center rounded-xl border bg-background">
              <Wallet className="size-5" />
            </div>
            <span className="inline-flex items-center rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Available now
            </span>
          </div>
          <h2 className="mt-4 text-lg font-medium">Free</h2>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight">$0</span>
            <span className="text-muted-foreground">/ forever, for now</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            The full app, hosted and ready. Sign up and start tracking in under a
            minute — no credit card, no installs.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-7">
            <Button asChild className={pricingCta}>
              <Link href="/sign-up">
                Get started <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>

        {/* Self-host */}
        <div className="flex flex-col rounded-2xl border bg-card p-7 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex size-11 items-center justify-center rounded-xl border bg-background">
              <Server className="size-5" />
            </div>
            <span className="inline-flex items-center rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Open source
            </span>
          </div>
          <h2 className="mt-4 text-lg font-medium">Self-host</h2>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight">$0</span>
            <span className="text-muted-foreground">+ your infra</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Prefer to own your stack? {siteConfig.name} is {siteConfig.license} and
            deploys to Cloudflare Workers via OpenNext with Neon Postgres. Clone the
            repo, set your environment, and run it yourself.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              "Everything in Free, on your own infrastructure",
              "Full source — read it, fork it, modify it",
              "Your database, your data, your control",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-7">
            <Button asChild className={pricingCta}>
              <Link href="/docs#self-hosting">
                <BookOpen /> Read the docs
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Pricing note */}
      <div className="mx-auto mt-10 max-w-3xl rounded-2xl border bg-muted/40 p-6">
        <div className="flex items-start gap-3">
          <Heart className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-medium">Will it stay free?</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              For now, yes — the hosted app is free and the project is open source. We
              haven&apos;t settled on a pricing model, and any paid plans would be
              announced here ahead of time. Whatever happens, you&apos;ll always be able
              to self-host {siteConfig.name} for free.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-14 overflow-hidden rounded-3xl border bg-card px-6 py-14 text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          Start free today
        </h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          No credit card, no installs. Create an account and log your first
          transaction in under a minute.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild className={marketingCta}>
            <Link href="/sign-up">
              Get started <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" className={marketingCta}>
            <Link href="/docs">Read the docs</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
