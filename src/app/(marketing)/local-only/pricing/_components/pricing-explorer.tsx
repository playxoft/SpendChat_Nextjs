"use client";

import Link from "next/link";
import { ArrowRight, Check, Info, Server, Sparkles, Timer, User, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/site";
import {
  MIN_BUSINESS_SEATS,
  PERIOD_LABEL,
  PERIOD_MONTHS,
  PLANS_FOR,
  PLAN_COPY,
  TRIAL_DAYS,
  BUSINESS_PAID,
  divide,
  formatAmount,
  isPaid,
  pct,
  periodDiscount,
  quote,
  taxName,
  topUpPrice,
  type Currency,
  type Period,
  type PlanId,
} from "../_data/pricing";
import { PricingControls, usePricingState } from "./pricing-state";

function track(location: string, label: string) {
  return {
    "data-track-event": "cta_click",
    "data-track-params": JSON.stringify({ location, label }),
  };
}

export function PricingExplorer() {
  const { audience, period, currency } = usePricingState();
  const plans = PLANS_FOR[audience];
  return (
    <div>
      {/* ── Controls ───────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-4">
        <PricingControls />
        <p className="inline-flex items-center gap-1.5 text-center text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" />
          All prices exclude {taxName(currency)}, added at checkout.
        </p>
      </div>

      {/* ── Plan cards ─────────────────────────────────────────────── */}
      {/* Always one row. From lg up it's a grid; below that the row scrolls
          sideways with snap, rather than wrapping into a second row. The
          vertical padding leaves room for the featured card's lift and badge. */}
      <div
        className={cn(
          "-mx-4 mt-8 flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto px-4 py-6 [scrollbar-width:none] lg:mx-auto lg:grid lg:overflow-visible lg:px-0",
          plans.length === 4 ? "lg:grid-cols-4" : "lg:max-w-6xl lg:grid-cols-3",
        )}
      >
        {plans.map((id) => (
          <PlanCard key={id} id={id} period={period} currency={currency} />
        ))}
      </div>

      {/* ── Add-ons: the three ways never to hit a wall ────────────── */}
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <AddOn
          icon={<Zap className="size-4" />}
          title="AI top-up"
          price={`${formatAmount(topUpPrice(currency), currency)} / 500 actions`}
          body="On any paid plan. Running out never locks you out — manual entry is never metered."
        />
        <AddOn
          icon={<Server className="size-4" />}
          title="Self-host"
          price="Free forever · AGPL"
          body="Every feature on your own infrastructure, with your own AI provider keys. Clone it, run it, keep your data at home."
          href="/docs#self-hosting"
        />
      </div>
    </div>
  );
}

function PlanCard({ id, period, currency }: { id: PlanId; period: Period; currency: Currency }) {
  const copy = PLAN_COPY[id];
  const q = isPaid(id) ? quote(id, period, currency) : null;
  const saving = isPaid(id) ? periodDiscount(id, period, currency) : 0;
  const inactive = q?.available === false;
  const featured = !!copy.highlight && !inactive;
  const perSeat = BUSINESS_PAID.includes(id);
  let headline = "—";
  if (id === "free") headline = formatAmount(0, currency);
  else if (id === "enterprise") headline = "Custom";
  else if (q?.available) headline = formatAmount(q.perMonth, currency);

  return (
    <div
      aria-disabled={inactive || undefined}
      className={cn(
        "relative flex w-[82%] shrink-0 snap-center flex-col rounded-3xl border bg-card p-5 transition-[box-shadow,opacity] sm:w-[46%] lg:w-auto xl:p-6",
        // Featured by weight, not by colour: a stronger edge and a lift.
        featured
          ? "border-foreground/50 shadow-xl ring-1 ring-foreground/15 lg:-my-3 lg:py-8 xl:py-9"
          : "shadow-sm hover:shadow-md",
        inactive && "opacity-55 saturate-0",
      )}
    >
      {featured ? (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full border border-foreground/30 bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-wider shadow-sm">
          <Sparkles className="size-3" /> {copy.highlight}
        </span>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h3 className="text-lg font-semibold tracking-tight">{copy.name}</h3>
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {copy.members === "Just you" ? <User className="size-3" /> : <Users className="size-3" />}
          {copy.members}
        </span>
      </div>
      <p className="mt-1.5 min-h-10 text-sm text-muted-foreground">{copy.tagline}</p>

      {/* Price block — fixed height so every card's button lines up. */}
      <div className="mt-6 min-h-[9rem]">
        <div key={`${currency}-${period}-${headline}`} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight tabular-nums xl:text-5xl">{headline}</span>
            {id === "enterprise" ? null : (
              <span className="text-sm text-muted-foreground">
                {id === "free" ? "forever" : perSeat ? "/seat/mo" : "/mo"}
              </span>
            )}
          </div>

          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            {id === "free" ? <p className="text-sm">No card, no trial clock.</p> : null}
            {id === "enterprise" ? <p className="text-sm">Priced for your seats, limits and contract.</p> : null}
            {q?.available ? (
              <>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium tabular-nums text-foreground/90">
                  <span>
                    {period === "monthly"
                      ? "Billed monthly, cancel anytime"
                      : `${formatAmount(q.price, currency)}${perSeat ? " per seat" : ""} ${PERIOD_LABEL[period].billed}`}
                  </span>
                  {saving >= 0.01 ? (
                    <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      Save {pct(saving)}
                    </span>
                  ) : null}
                </p>
                {id === "family" ? (
                  <p className="tabular-nums">
                    {formatAmount(divide(q.perMonth, 6, currency), currency)} per person a month, shared by six
                  </p>
                ) : null}
                {perSeat ? (
                  <p className="tabular-nums">
                    {formatAmount(divide(q.price * MIN_BUSINESS_SEATS, PERIOD_MONTHS[period], currency), currency)}/mo
                    for a team of {MIN_BUSINESS_SEATS}, the minimum
                  </p>
                ) : null}
                <p className="inline-flex items-center gap-1.5 pt-0.5 text-sm font-medium">
                  <Timer className="size-4" /> First {TRIAL_DAYS} days free
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {inactive ? (
        <Button disabled variant="outline" className="mt-2 h-11 w-full rounded-xl text-sm">
          Unavailable for this plan
        </Button>
      ) : (
        <Button
          asChild
          variant={featured ? "default" : "outline"}
          className="mt-2 h-11 w-full gap-2 rounded-xl text-sm"
        >
          {id === "enterprise" ? (
            <a
              href={`mailto:${siteConfig.supportEmail}?subject=Enterprise`}
              {...track("pricing_enterprise_plan", "contact_sales")}
            >
              Contact sales <ArrowRight className="size-4" />
            </a>
          ) : (
            <Link
              href="/sign-up"
              {...track(`pricing_${id}_plan`, id === "free" ? "get_started" : `trial_${id}`)}
            >
              {id === "free" ? "Start for free" : `Start ${TRIAL_DAYS}-day free trial`}
              <ArrowRight className="size-4" />
            </Link>
          )}
        </Button>
      )}

      <div className="my-6 h-px bg-border" />

      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{copy.lead}</p>
      <ul className="mt-4 space-y-3 text-sm">
        {copy.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            <span className="text-foreground/80">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddOn({
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
