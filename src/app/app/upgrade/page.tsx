import type { Metadata } from "next";
import { getAppContext } from "@/lib/auth";
import { getUsage } from "@/lib/entitlements";
import { PLAN_PITCH, pricingCurrencyFor, pricingFaqs, upgradeHero } from "@/lib/plan-copy";
import { isPaidPlan } from "@/lib/plans";
import { FaqSection } from "@/components/marketing/faq-section";
import { ComparisonTable } from "@/components/pricing/comparison-table";
import { PlanCards, PricingExtras } from "@/components/pricing/plan-cards";
import { PricingStateProvider } from "@/components/pricing/pricing-state";
import { PlanBadge } from "@/components/app/plan-badge";
import { UsageStrip } from "./_components/usage-strip";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plans",
  robots: { index: false, follow: false },
};

/**
 * The in-app plans page: what the current workspace is on, how much of it is
 * used, and what Plus and Pro would change — the place every upgrade prompt
 * ("Upgrade") lands. Same cards, table and words as the public `/pricing`
 * (`components/pricing`, `lib/plan-copy`), priced in the workspace's currency
 * when we sell in it. Checkout isn't open yet, so nothing here takes money.
 */
export default async function UpgradePage() {
  const { workspace } = await getAppContext();
  const usage = await getUsage(workspace.id);
  const plan = usage.plan;
  const hero = upgradeHero(workspace.name);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6">
      <header className="max-w-3xl">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {workspace.name} is on <PlanBadge plan={plan} className="h-5 px-2 text-xs" />
        </p>
        <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{hero.title}</h1>
        <p className="mt-2 text-pretty text-muted-foreground">{hero.body}</p>
        {usage.readOnly ? (
          <p className="mt-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            This workspace is view-only: everyone gets one free workspace, and this one is extra.
            Nothing in it is deleted — it opens up again with its own Plus or Pro plan.
          </p>
        ) : null}
      </header>

      <div className="mt-6">
        <UsageStrip usage={usage} />
      </div>

      <PricingStateProvider initialCurrency={pricingCurrencyFor(workspace.currency)}>
        <section aria-labelledby="plans-heading" className="mt-10">
          <h2 id="plans-heading" className="text-lg font-semibold tracking-tight">
            {isPaidPlan(plan) ? "Your plan and the others" : "What an upgrade would change"}
          </h2>
          {!isPaidPlan(plan) ? (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{PLAN_PITCH.plus.story}</p>
          ) : null}
          <div className="mt-6">
            <PlanCards currentPlan={plan} />
            <PricingExtras />
          </div>
        </section>

        <section aria-labelledby="compare-heading" className="mt-16">
          <h2 id="compare-heading" className="text-lg font-semibold tracking-tight">
            Compare every plan
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every number, side by side. Transactions are unlimited on all of them.
          </p>
          <div className="mt-5">
            <ComparisonTable currentPlan={plan} controls={false} />
          </div>
        </section>
      </PricingStateProvider>

      <FaqSection faqs={pricingFaqs()} heading="Questions about plans" className="mx-auto max-w-3xl" />
    </div>
  );
}
