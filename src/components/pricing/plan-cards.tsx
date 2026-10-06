"use client";

import Link from "next/link";
import { ArrowRight, Check, Info, Mail, Server, Sparkles, Timer, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PERSONAL_PLANS, PLAN_NAMES, TOPUP, planAtLeast, type PersonalPlan } from "@/lib/plans";
import {
  FEATURED_BADGE,
  FEATURED_PLAN,
  PAID_PLANS_STATUS,
  PLAN_PITCH,
  count,
  notifyMeHref,
  plansWith,
} from "@/lib/plan-copy";
import {
  PERIOD_LABEL,
  TRIAL_DAYS,
  formatAmount,
  isPaidPersonalPlan,
  pct,
  periodDiscount,
  quote,
  taxName,
  topUpPrice,
  type Currency,
  type Period,
} from "@/lib/pricing";
import { PricingControls, usePricingState } from "./pricing-state";

/**
 * The three plans side by side, priced in the shared period + currency. Used
 * by the public `/pricing` page (`currentPlan` unset: the Free card signs you
 * up) and the in-app `/app/upgrade` page (`currentPlan` set: that card is
 * marked, and nothing offers a downgrade).
 *
 * Checkout isn't open yet, so a paid card never pretends to sell: its button
 * says the plan opens soon, and the one live action is asking to be told when.
 */
export function PlanCards({ currentPlan }: { currentPlan?: PersonalPlan }) {
  const { period, currency } = usePricingState();
  return (
    <div>
      <div className="flex flex-col items-center gap-4">
        <PricingControls />
        <p className="inline-flex items-center gap-1.5 text-center text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" />
          A plan covers a whole workspace and everyone in it. Prices exclude {taxName(currency)}.
        </p>
      </div>

      {/* Always one row. From lg up it's a grid; below that the row scrolls
          sideways with snap, rather than wrapping into a second row. The
          vertical padding leaves room for the featured card's lift and badge. */}
      <div className="-mx-4 mt-8 flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto px-4 py-6 [scrollbar-width:none] lg:mx-auto lg:grid lg:max-w-6xl lg:grid-cols-3 lg:overflow-visible lg:px-0">
        {PERSONAL_PLANS.map((id) => (
          <PlanCard key={id} id={id} period={period} currency={currency} currentPlan={currentPlan} />
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  id,
  period,
  currency,
  currentPlan,
}: {
  id: PersonalPlan;
  period: Period;
  currency: Currency;
  currentPlan?: PersonalPlan;
}) {
  const pitch = PLAN_PITCH[id];
  const q = isPaidPersonalPlan(id) ? quote(id, period, currency) : null;
  const saving = isPaidPersonalPlan(id) ? periodDiscount(id, period, currency) : 0;
  const isCurrent = currentPlan === id;
  // The featured plan keeps its lift unless the workspace already has it (or more).
  const featured = id === FEATURED_PLAN && !(currentPlan && planAtLeast(currentPlan, id));
  const badge = isCurrent ? "Your plan" : featured ? FEATURED_BADGE : null;
  const headline = formatAmount(q ? q.perMonth : 0, currency);

  return (
    <div
      className={cn(
        "relative flex w-[82%] shrink-0 snap-center flex-col rounded-3xl border bg-card p-5 transition-[box-shadow,opacity] sm:w-[46%] lg:w-auto xl:p-6",
        // Featured by weight, not by colour: a stronger edge and a lift.
        featured
          ? "border-foreground/50 shadow-xl ring-1 ring-foreground/15 lg:-my-3 lg:py-8 xl:py-9"
          : "shadow-sm hover:shadow-md",
      )}
    >
      {badge ? (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full border border-foreground/30 bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-wider shadow-sm">
          {isCurrent ? <Check className="size-3" /> : <Sparkles className="size-3" />} {badge}
        </span>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h3 className="text-lg font-semibold tracking-tight">{PLAN_NAMES[id]}</h3>
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          <Users className="size-3" />
          {pitch.people}
        </span>
      </div>
      <p className="mt-3 min-h-12 text-balance text-base font-medium leading-snug">{pitch.headline}</p>
      <p className="mt-1.5 min-h-10 text-sm text-muted-foreground">{pitch.audience}</p>

      {/* Price block — fixed height so every card's button lines up. */}
      <div className="mt-5 min-h-[8.5rem]">
        <div key={`${currency}-${period}-${headline}`} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight tabular-nums xl:text-5xl">{headline}</span>
            <span className="text-sm text-muted-foreground">/mo</span>
          </div>

          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            {q ? (
              <>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium tabular-nums text-foreground/90">
                  <span>
                    {period === "monthly"
                      ? "Billed monthly, cancel any time"
                      : `${formatAmount(q.price, currency)} ${PERIOD_LABEL[period].billed}`}
                  </span>
                  {saving >= 0.01 ? (
                    <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      Save {pct(saving)}
                    </span>
                  ) : null}
                </p>
                <p className="inline-flex items-center gap-1.5 pt-0.5 text-sm font-medium">
                  <Timer className="size-4" /> First {TRIAL_DAYS} days free
                </p>
              </>
            ) : (
              <p className="text-sm">No card. No trial clock. Every workspace starts here.</p>
            )}
          </div>
        </div>
      </div>

      <PlanAction id={id} currentPlan={currentPlan} featured={featured} />

      <div className="my-6 h-px bg-border" />

      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{pitch.lead}</p>
      <ul className="mt-4 space-y-3 text-sm">
        {pitch.outcomes.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            <span className="text-foreground/80">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ctaClass = "h-11 w-full gap-2 rounded-xl text-sm";

/** The card's button — the only place a plan card can be acted on. */
function PlanAction({
  id,
  currentPlan,
  featured,
}: {
  id: PersonalPlan;
  currentPlan?: PersonalPlan;
  featured: boolean;
}) {
  // In the app: the current plan and anything below it have nothing to do.
  if (currentPlan && planAtLeast(currentPlan, id)) {
    return (
      <div className="mt-2">
        <Button type="button" variant="outline" disabled className={ctaClass}>
          {currentPlan === id ? "Your current plan" : `Included in ${PLAN_NAMES[currentPlan]}`}
        </Button>
        <p className="mt-2 min-h-5" />
      </div>
    );
  }

  // Public Free card: the one real sign-up on the page.
  if (!isPaidPersonalPlan(id)) {
    return (
      <div className="mt-2">
        <Button asChild variant={featured ? "default" : "outline"} className={ctaClass}>
          <Link
            href="/sign-up"
            data-track-event="cta_click"
            data-track-params={JSON.stringify({ location: `pricing_${id}_plan`, label: "get_started" })}
          >
            Start free <ArrowRight className="size-4" />
          </Link>
        </Button>
        <p className="mt-2 min-h-5 text-center text-xs text-muted-foreground">Set up in under a minute.</p>
      </div>
    );
  }

  // A paid plan, before checkout exists: say so, and offer the one honest action.
  return (
    <div className="mt-2">
      <Button type="button" variant={featured ? "default" : "outline"} disabled className={ctaClass}>
        {PAID_PLANS_STATUS.button}
      </Button>
      <p className="mt-2 min-h-5 text-center text-xs">
        <a
          href={notifyMeHref(id)}
          className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          data-track-event="cta_click"
          data-track-params={JSON.stringify({ location: `pricing_${id}_plan`, label: "notify_me" })}
        >
          <Mail className="size-3" /> {PAID_PLANS_STATUS.notifyLabel}
        </a>
      </p>
    </div>
  );
}

/**
 * The extras under the cards: AI top-ups (paid plans) and, on the public page,
 * self-hosting.
 */
export function PricingExtras({ selfHost = false }: { selfHost?: boolean }) {
  const { currency } = usePricingState();
  return (
    <div className={cn("mx-auto mt-4 grid max-w-6xl gap-5", selfHost && "md:grid-cols-2")}>
      <Extra
        icon={<Zap className="size-4" />}
        title="AI top-up"
        price={`${formatAmount(topUpPrice(currency), currency)} for ${count(TOPUP.actions)} more AI actions`}
        body={`Ran out on the 12th? On ${plansWith("topUps")}, a top-up carries you to the end of the month and stays valid for ${TOPUP.validityMonths} months. Typing entries yourself is never counted.`}
      />
      {selfHost ? (
        <Extra
          icon={<Server className="size-4" />}
          title="Self-host"
          price="Free · open source (AGPL)"
          body="Every feature on your own server, with your own AI keys. Your data never leaves home."
          href="/docs#self-hosting"
        />
      ) : null}
    </div>
  );
}

function Extra({
  icon,
  title,
  price,
  body,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  price: string;
  body: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg border bg-background">{icon}</span>
          {title}
        </span>
        {href ? (
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        ) : null}
      </div>
      <p className="mt-3 text-sm font-medium tabular-nums">{price}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </>
  );
  const cls = "group rounded-2xl border bg-card p-5 transition-colors";
  return href ? (
    <Link href={href} className={cn(cls, "hover:bg-muted/40")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
