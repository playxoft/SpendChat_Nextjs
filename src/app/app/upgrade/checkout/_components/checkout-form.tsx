"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Loader2, ShieldCheck, Timer, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanBadge } from "@/components/app/plan-badge";
import { AccountControls } from "@/components/app/account-controls";
import { usePlan } from "@/components/app/upgrade-dialog";
import { Segmented } from "@/components/pricing/segmented";
import { startCheckout } from "@/actions/billing";
import {
  checkoutPath,
  checkoutQuote,
  checkoutRefusal,
  topUpQuote,
  trialDaysFor,
  type CheckoutItem,
  type CheckoutRefusal,
} from "@/lib/checkout";
import {
  PLAN_PITCH,
  PURCHASE,
  chargeLine,
  checkoutRefusalMessage,
  count,
  planChanges,
  planCta,
} from "@/lib/plan-copy";
import { PLAN_NAMES, lowestPlanWith, type PersonalPlan } from "@/lib/plans";
import {
  PERIODS,
  PERIOD_LABEL,
  formatAmount,
  isPaidPersonalPlan,
  pct,
  periodDiscount,
  taxName,
  type Currency,
  type PaidPersonalPlan,
  type Period,
} from "@/lib/pricing";

type WorkspaceInfo = { id: string; name: string; icon: string };

/**
 * The checkout page's body: the order on the left (period, what changes), the
 * summary and the buy button on the right. Prices come from `lib/checkout.ts`,
 * the same quotes `startCheckout` charges from.
 */
export function CheckoutForm({
  workspace,
  currentPlan,
  item,
  currency,
  canBuy,
  ownerName,
}: {
  workspace: WorkspaceInfo;
  currentPlan: PersonalPlan;
  item: CheckoutItem;
  currency: Currency;
  canBuy: boolean;
  ownerName: string | null;
}) {
  const refusal = checkoutRefusal(currentPlan, item);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/app/upgrade"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Plans
        </Link>
        <AccountControls />
      </div>

      {refusal ? (
        <Refused
          workspace={workspace}
          currentPlan={currentPlan}
          reason={refusal}
          message={checkoutRefusalMessage(refusal, currentPlan, item.item === "plan" ? item.plan : undefined)}
        />
      ) : item.item === "plan" ? (
        <PlanCheckoutView
          workspace={workspace}
          currentPlan={currentPlan}
          plan={item.plan}
          initialPeriod={item.period}
          currency={currency}
          canBuy={canBuy}
          ownerName={ownerName}
        />
      ) : (
        <TopUpCheckoutView workspace={workspace} currency={currency} canBuy={canBuy} ownerName={ownerName} />
      )}
    </div>
  );
}

// ── Plan ───────────────────────────────────────────────────────────────────

function PlanCheckoutView({
  workspace,
  currentPlan,
  plan,
  initialPeriod,
  currency,
  canBuy,
  ownerName,
}: {
  workspace: WorkspaceInfo;
  currentPlan: PersonalPlan;
  plan: PaidPersonalPlan;
  initialPeriod: Period;
  currency: Currency;
  canBuy: boolean;
  ownerName: string | null;
}) {
  const [period, setPeriod] = React.useState<Period>(initialPeriod);
  const q = checkoutQuote(plan, period, currency);
  const trialDays = trialDaysFor(currentPlan);
  const changes = planChanges(currentPlan, plan);
  const pitch = PLAN_PITCH[plan];
  const price = formatAmount(q.price, currency);

  function choose(next: Period) {
    setPeriod(next);
    // Keep the URL on the period shown, so a reload or a shared link matches.
    try {
      window.history.replaceState(null, "", checkoutPath({ plan, period: next, currency }));
    } catch {
      // A sandboxed frame can refuse; the page still works on local state.
    }
  }

  const periodOptions = PERIODS.map((p) => {
    const saving = periodDiscount(plan, p, currency);
    return { value: p, label: PERIOD_LABEL[p].toggle, badge: saving >= 0.01 ? `−${pct(saving)}` : undefined };
  });

  return (
    <>
      <Header
        workspace={workspace}
        currentPlan={currentPlan}
        title={`Upgrade ${workspace.name} to ${PLAN_NAMES[plan]}`}
        body={pitch.headline}
      />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section aria-labelledby="period-heading" className="rounded-2xl border bg-card p-5 sm:p-6">
            <h2 id="period-heading" className="text-sm font-semibold">
              How often to pay
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The longer the period, the less each month costs.
            </p>
            <Segmented
              label="Billing period"
              value={period}
              onChange={choose}
              options={periodOptions}
              className="mt-4 w-full max-w-md"
            />
            <p className="mt-4 text-sm tabular-nums">
              <span className="text-2xl font-semibold tracking-tight">{formatAmount(q.perMonth, currency)}</span>
              <span className="text-muted-foreground"> a month</span>
              {q.months > 1 ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {price} {PERIOD_LABEL[period].billed}
                </span>
              ) : null}
            </p>
          </section>

          <section aria-labelledby="changes-heading" className="rounded-2xl border bg-card p-5 sm:p-6">
            <h2 id="changes-heading" className="text-sm font-semibold">
              What changes right away
            </h2>
            <ul className="mt-4 divide-y text-sm">
              {changes.map((c) => (
                <li key={c.label} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="flex items-center gap-2.5">
                    <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                    {c.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {c.from ? (
                      <>
                        <span className="line-through decoration-muted-foreground/50">{c.from}</span>
                        <span aria-hidden> → </span>
                        <span className="sr-only"> to </span>
                      </>
                    ) : null}
                    <span className="font-medium text-foreground">{c.to}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              {PURCHASE.keepsEverything}
            </p>
          </section>
        </div>

        <Summary
          workspace={workspace}
          rows={[
            { label: `${PLAN_NAMES[plan]} · ${PERIOD_LABEL[period].toggle}`, value: price },
            ...(trialDays > 0
              ? [
                  { label: "Free trial", value: `${trialDays} days` },
                  { label: "Due today", value: formatAmount(0, currency), strong: true },
                ]
              : [{ label: "Due today", value: price, strong: true }]),
          ]}
          note={chargeLine(price, period, trialDays)}
          noteIcon={trialDays > 0 ? <Timer className="size-4" /> : null}
          currency={currency}
          canBuy={canBuy}
          ownerName={ownerName}
          cta={planCta(plan, currentPlan)}
          input={{ item: "plan", plan, period, currency }}
        />
      </div>
    </>
  );
}

// ── Top-up ─────────────────────────────────────────────────────────────────

function TopUpCheckoutView({
  workspace,
  currency,
  canBuy,
  ownerName,
}: {
  workspace: WorkspaceInfo;
  currency: Currency;
  canBuy: boolean;
  ownerName: string | null;
}) {
  const q = topUpQuote(currency);
  const price = formatAmount(q.price, currency);
  return (
    <>
      <Header
        workspace={workspace}
        title={`Top up ${workspace.name}`}
        body={`${count(q.actions)} more AI actions for the whole workspace, used once this month's allowance runs out.`}
      />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="topup-heading" className="rounded-2xl border bg-card p-5 sm:p-6">
          <h2 id="topup-heading" className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="size-4" /> AI top-up
          </h2>
          <ul className="mt-4 space-y-3 text-sm">
            {[
              `${count(q.actions)} AI actions, shared by everyone in ${workspace.name}`,
              "Used only after the monthly allowance is spent, so nothing is wasted",
              `Valid for ${q.validityMonths} months from today`,
              "Typing or bulk-adding entries yourself never uses one",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                <span className="text-foreground/80">{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <Summary
          workspace={workspace}
          rows={[
            { label: `${count(q.actions)} AI actions`, value: price },
            { label: "Due today", value: price, strong: true },
          ]}
          note={`One payment, valid for ${q.validityMonths} months.`}
          currency={currency}
          canBuy={canBuy}
          ownerName={ownerName}
          cta={`Pay ${price}`}
          input={{ item: "topup", currency }}
        />
      </div>
    </>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Header({
  workspace,
  currentPlan,
  title,
  body,
}: {
  workspace: WorkspaceInfo;
  currentPlan?: PersonalPlan;
  title: string;
  body: string;
}) {
  return (
    <header className="mt-4 max-w-2xl">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden>{workspace.icon}</span>
        {workspace.name}
        {currentPlan ? (
          <>
            {" "}
            is on <PlanBadge plan={currentPlan} className="h-5 px-2 text-xs" />
          </>
        ) : null}
      </p>
      <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 text-pretty text-muted-foreground">{body}</p>
    </header>
  );
}

type SummaryRow = { label: string; value: string; strong?: boolean };

function Summary({
  workspace,
  rows,
  note,
  noteIcon,
  currency,
  canBuy,
  ownerName,
  cta,
  input,
}: {
  workspace: WorkspaceInfo;
  rows: SummaryRow[];
  note: string;
  noteIcon?: React.ReactNode;
  currency: Currency;
  canBuy: boolean;
  ownerName: string | null;
  cta: string;
  input: Parameters<typeof startCheckout>[1];
}) {
  const { reportFailure } = usePlan();
  const [pending, startTransition] = React.useTransition();

  function buy() {
    startTransition(async () => {
      const res = await startCheckout(workspace.id, input);
      if (res.ok) {
        window.location.assign(res.url);
        return;
      }
      reportFailure(res, "Couldn't open checkout. Please try again.");
    });
  }

  return (
    <aside
      aria-labelledby="summary-heading"
      className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6 lg:sticky lg:top-6"
    >
      <h2 id="summary-heading" className="text-sm font-semibold">
        Order summary
      </h2>
      <div className="mt-4 flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5">
        <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-muted text-base">
          {workspace.icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Workspace</p>
          <p className="truncate text-sm font-medium">{workspace.name}</p>
        </div>
      </div>

      <dl className="mt-4 space-y-2.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className={r.strong ? "font-medium" : "text-muted-foreground"}>{r.label}</dt>
            <dd className={r.strong ? "text-base font-semibold tabular-nums" : "tabular-nums"}>{r.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 flex items-start gap-2 border-t pt-4 text-sm">
        {noteIcon ? <span className="mt-0.5 shrink-0">{noteIcon}</span> : null}
        <span>{note}</span>
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Prices exclude {taxName(currency)}; it&apos;s added at checkout.
      </p>

      {canBuy ? (
        <Button type="button" className="mt-5 h-11 w-full gap-2 rounded-xl" disabled={pending} onClick={buy}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? "Opening checkout…" : cta}
          {pending ? null : <ArrowRight className="size-4" />}
        </Button>
      ) : (
        <p className="mt-5 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
          Only an admin can buy for this workspace. Ask {ownerName ?? "the workspace owner"} to upgrade{" "}
          {workspace.name}.
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{PURCHASE.billing(currency)}</p>
    </aside>
  );
}

function Refused({
  workspace,
  currentPlan,
  reason,
  message,
}: {
  workspace: WorkspaceInfo;
  currentPlan: PersonalPlan;
  reason: CheckoutRefusal;
  message: string;
}) {
  // A top-up on Free: offer the plan that brings top-ups, not a dead end.
  const needsPlan = reason === "topUpNeedsPlan" ? lowestPlanWith("topUps") : null;
  const paid = needsPlan && isPaidPersonalPlan(needsPlan) ? needsPlan : null;
  return (
    <div className="mt-6 max-w-xl rounded-2xl border bg-card p-6">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden>{workspace.icon}</span>
        {workspace.name} is on <PlanBadge plan={currentPlan} className="h-5 px-2 text-xs" />
      </p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">
        {paid ? `Top-ups come with ${PLAN_NAMES[paid]} and up` : "This workspace already has it"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {paid ? (
          <Button asChild>
            <Link href={checkoutPath({ plan: paid, period: "yearly" })}>
              {planCta(paid, currentPlan)} <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : null}
        <Button asChild variant={paid ? "outline" : "default"}>
          <Link href="/app/upgrade">Compare plans</Link>
        </Button>
      </div>
    </div>
  );
}
