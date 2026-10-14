"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CalendarClock, Check, Info, Loader2, ShieldCheck, Timer, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanBadge } from "@/components/app/plan-badge";
import { AccountControls } from "@/components/app/account-controls";
import { usePlan } from "@/components/app/upgrade-dialog";
import { Segmented } from "@/components/pricing/segmented";
import { changePlan, startCheckout } from "@/actions/billing";
import { nextRenewal, nonBuyerMayChange, planChangeKind, type PlanChangeKind } from "@/lib/billing-rules";
import {
  checkoutPath,
  checkoutQuote,
  checkoutRefusal,
  topUpQuote,
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

/** The plan a workspace already pays for, when it has one running. */
export type LivePlan = {
  plan: PaidPersonalPlan;
  period: Period;
  /** The provider's status: only `active` can change plan. */
  status: string;
  inTrial: boolean;
  nextBillingDate: string | null;
  /** What buying `item` would be against it; null for a top-up. */
  change: PlanChangeKind | null;
  /** The currency the plan is locked to — a change is priced in it. */
  currency: Currency | null;
  /** This person pays for it — only they can move it up (it charges their card). */
  isBuyer: boolean;
  /** A change already waiting for the renewal. */
  scheduled: { plan: PaidPersonalPlan; period: Period } | null;
};

/** The buyer is in India — UPI is offered (with rupees). Read by the summary's payment line. */
const UpiContext = React.createContext(false);

/** Shown in place of the buy button on a server without payment keys. */
const PAYMENTS_UNAVAILABLE = "Payments aren't available on this server yet.";

/**
 * The checkout page's body: the order on the left (period, what changes), the
 * summary and the buy button on the right. Prices come from `lib/checkout.ts`,
 * the same quotes `startCheckout` charges from. A workspace with a plan
 * running gets a plan change instead of a second subscription.
 */
export function CheckoutForm({
  workspace,
  currentPlan,
  item,
  currency,
  canBuy,
  ownerName,
  trialDays,
  live,
  billingReady,
  upi,
}: {
  workspace: WorkspaceInfo;
  currentPlan: PersonalPlan;
  item: CheckoutItem;
  currency: Currency;
  canBuy: boolean;
  ownerName: string | null;
  /** The buyer is in India, where UPI is offered (with rupees). */
  upi: boolean;
  /** The trial this purchase would start with (B1), decided on the server. */
  trialDays: number;
  live: LivePlan | null;
  billingReady: boolean;
}) {
  if (item.item === "plan" && live) {
    return (
      <Shell upi={upi}>
        <PlanChangeView
          workspace={workspace}
          currentPlan={currentPlan}
          live={live}
          plan={item.plan}
          initialPeriod={item.period}
          currency={live.currency ?? currency}
          canBuy={canBuy}
          ownerName={ownerName}
          billingReady={billingReady}
        />
      </Shell>
    );
  }
  const refusal = checkoutRefusal(currentPlan, item);

  return (
    <Shell upi={upi}>
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
          trialDays={trialDays}
          billingReady={billingReady}
        />
      ) : (
        <TopUpCheckoutView
          workspace={workspace}
          currency={currency}
          canBuy={canBuy}
          ownerName={ownerName}
          billingReady={billingReady}
        />
      )}
    </Shell>
  );
}

function Shell({ children, upi }: { children: React.ReactNode; upi: boolean }) {
  return (
    <UpiContext.Provider value={upi}>
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
      {children}
    </div>
    </UpiContext.Provider>
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
  trialDays,
  billingReady,
}: {
  workspace: WorkspaceInfo;
  currentPlan: PersonalPlan;
  plan: PaidPersonalPlan;
  initialPeriod: Period;
  currency: Currency;
  canBuy: boolean;
  ownerName: string | null;
  trialDays: number;
  billingReady: boolean;
}) {
  const [period, setPeriod] = React.useState<Period>(initialPeriod);
  const q = checkoutQuote(plan, period, currency);
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
          cta={trialDays > 0 ? planCta(plan, currentPlan) : `Upgrade to ${PLAN_NAMES[plan]}`}
          input={{ item: "plan", plan, period, currency }}
          billingReady={billingReady}
          extraNote={
            trialDays === 0 && currentPlan === "free"
              ? "This workspace (or you) has already had a free trial, so the plan starts today."
              : null
          }
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
  billingReady,
}: {
  workspace: WorkspaceInfo;
  currency: Currency;
  canBuy: boolean;
  ownerName: string | null;
  billingReady: boolean;
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
          billingReady={billingReady}
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
  billingReady,
  extraNote,
  onBuy,
}: {
  workspace: WorkspaceInfo;
  rows: SummaryRow[];
  note: string;
  noteIcon?: React.ReactNode;
  currency: Currency;
  canBuy: boolean;
  ownerName: string | null;
  cta: string;
  input?: Parameters<typeof startCheckout>[1];
  billingReady: boolean;
  extraNote?: string | null;
  /** A plan change instead of a checkout; resolves once the request is sent. */
  onBuy?: () => Promise<void>;
}) {
  const { reportFailure } = usePlan();
  const upi = React.useContext(UpiContext);
  const [pending, startTransition] = React.useTransition();

  function buy() {
    startTransition(async () => {
      if (onBuy) {
        await onBuy();
        return;
      }
      if (!input) return;
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
      {extraNote ? (
        <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          {extraNote}
        </p>
      ) : null}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Prices exclude {taxName(currency)}; it&apos;s added at checkout.
      </p>

      {!billingReady ? (
        <p className="mt-5 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          {PAYMENTS_UNAVAILABLE}
        </p>
      ) : canBuy ? (
        <Button type="button" className="mt-5 h-11 w-full gap-2 rounded-xl" disabled={pending} onClick={buy}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? (onBuy ? "Working…" : "Opening checkout…") : cta}
          {pending ? null : <ArrowRight className="size-4" />}
        </Button>
      ) : (
        <p className="mt-5 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
          Only an admin can buy for this workspace. Ask {ownerName ?? "the workspace owner"} to upgrade{" "}
          {workspace.name}.
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {input?.item === "topup" ? PURCHASE.topUpBilling(currency, upi) : PURCHASE.billing(currency, upi)}
      </p>
    </aside>
  );
}

// ── Plan change (a workspace that already pays) ────────────────────────────

function PlanChangeView({
  workspace,
  currentPlan,
  live,
  plan,
  initialPeriod,
  currency,
  canBuy,
  ownerName,
  billingReady,
}: {
  workspace: WorkspaceInfo;
  currentPlan: PersonalPlan;
  live: LivePlan;
  plan: PaidPersonalPlan;
  initialPeriod: Period;
  currency: Currency;
  canBuy: boolean;
  ownerName: string | null;
  billingReady: boolean;
}) {
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [today] = React.useState(() => new Date());
  const [period, setPeriod] = React.useState<Period>(initialPeriod);
  const kind = planChangeKind({ plan: live.plan, period: live.period }, { plan, period });
  const q = checkoutQuote(plan, period, currency);
  const price = formatAmount(q.price, currency);
  const from = `${PLAN_NAMES[live.plan]} · ${PERIOD_LABEL[live.period].toggle}`;
  const to = `${PLAN_NAMES[plan]} · ${PERIOD_LABEL[period].toggle}`;
  const renewal = live.nextBillingDate ? formatDay(live.nextBillingDate) : "the next billing date";

  function choose(next: Period) {
    setPeriod(next);
    try {
      window.history.replaceState(null, "", checkoutPath({ plan, period: next, currency }));
    } catch {
      // A sandboxed frame can refuse; the page still works on local state.
    }
  }

  async function confirm() {
    const res = await changePlan(workspace.id, { plan, period });
    if (!res.ok) {
      reportFailure(res, "Couldn't change the plan. Please try again.");
      return;
    }
    if (res.change.kind === "upgrade") {
      router.push(`/app/upgrade/return?${new URLSearchParams({ workspace: workspace.id, plan, period })}`);
      return;
    }
    toast.success(
      res.change.kind === "downgrade" ? `${to} starts on ${renewal}` : "The scheduled change is cancelled",
    );
    router.push("/app/settings/billing");
  }

  if (live.status !== "active") {
    const notRunning = live.status === "paused" || live.status === "pending";
    return (
      <Notice
        workspace={workspace}
        currentPlan={currentPlan}
        title={notRunning ? "This plan isn't running" : "Sort out the payment first"}
        body={
          notRunning
            ? live.status === "paused"
              ? "This workspace's plan is paused, so it can't change. Cancel it in Billing, then buy the plan you want."
              : "A payment for this workspace's plan is still being confirmed. Try again in a few minutes — or cancel it in Billing to start over."
            : "This workspace's last payment didn't go through, so its plan can't change yet. Update the payment method in Billing — the plan carries on once it's paid."
        }
        href="/app/settings/billing"
        cta="Open Billing"
      />
    );
  }
  const raisesBill =
    kind === "downgrade" &&
    !live.isBuyer &&
    !nonBuyerMayChange({ plan: live.plan, period: live.period }, live.scheduled, { plan, period }, currency);
  if ((kind === "upgrade" || raisesBill) && !live.isBuyer) {
    return (
      <Notice
        workspace={workspace}
        currentPlan={currentPlan}
        title="Ask the person who pays for it"
        body={
          raisesBill
            ? `${to} would renew at ${price} ${PERIOD_LABEL[period].billed} — more than this plan costs now — on the card it's paid with, so only the person who bought it can choose it. A plan that renews for less, or cancelling, is up to any admin in Billing.`
            : "Moving this plan up charges the card it's paid with, so only the person who bought it can do it. You can still move it down, or cancel it, in Billing."
        }
        href="/app/settings/billing"
        cta="Open Billing"
      />
    );
  }
  if (kind === "same") {
    return (
      <Notice
        workspace={workspace}
        currentPlan={currentPlan}
        title="This workspace already has it"
        body={`${workspace.name} is on ${from} already.`}
        href="/app/settings/billing"
        cta="Open Billing"
      />
    );
  }

  const periodOptions = PERIODS.map((p) => {
    const saving = periodDiscount(plan, p, currency);
    return { value: p, label: PERIOD_LABEL[p].toggle, badge: saving >= 0.01 ? `−${pct(saving)}` : undefined };
  });
  const upgrade = kind === "upgrade";

  return (
    <>
      <Header
        workspace={workspace}
        currentPlan={currentPlan}
        title={upgrade ? `Move ${workspace.name} up to ${to}` : `Switch ${workspace.name} to ${to} at renewal`}
        body={PLAN_PITCH[plan].headline}
      />
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section aria-labelledby="period-heading" className="rounded-2xl border bg-card p-5 sm:p-6">
            <h2 id="period-heading" className="text-sm font-semibold">
              How often to pay
            </h2>
            <Segmented
              label="Billing period"
              value={period}
              onChange={choose}
              options={periodOptions}
              className="mt-4 w-full max-w-md"
            />
          </section>
          <section aria-labelledby="when-heading" className="rounded-2xl border bg-card p-5 sm:p-6">
            <h2 id="when-heading" className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="size-4" /> {upgrade ? "What happens now" : "What happens at renewal"}
            </h2>
            <ul className="mt-3 space-y-2.5 text-sm text-foreground/80">
              {(upgrade
                ? [
                    `${to} starts as soon as the payment goes through.`,
                    `You're charged ${price} today, less a credit for the unused part of ${from}.`,
                    `Your billing date moves to today: it then renews at ${price} ${PERIOD_LABEL[period].billed}, next on ${formatDay(nextRenewal(today, period).toISOString())}.`,
                    ...(live.inTrial ? ["This ends your free trial now — the new plan is charged today."] : []),
                  ]
                : [
                    `You keep ${from} — and everything in it — until ${renewal}.`,
                    `From ${renewal}, ${to} renews at ${price} ${PERIOD_LABEL[period].billed}. Nothing is charged today.`,
                    "AI actions already used this month carry over; nothing is refunded.",
                    "Anything over the smaller plan's limits stays — you just can't add more of it.",
                  ]
              ).map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <Summary
          workspace={workspace}
          rows={[
            { label: "Now", value: from },
            { label: upgrade ? "Moving to" : `From ${renewal}`, value: to },
            upgrade
              ? { label: "Due today", value: `${price} less credit`, strong: true }
              : { label: "Due today", value: formatAmount(0, currency), strong: true },
          ]}
          note={upgrade ? `${price} ${PERIOD_LABEL[period].billed} from today.` : `${price} ${PERIOD_LABEL[period].billed} from ${renewal}.`}
          noteIcon={upgrade ? null : <Timer className="size-4" />}
          currency={currency}
          canBuy={canBuy}
          ownerName={ownerName}
          cta={upgrade ? "Upgrade now" : "Switch at renewal"}
          billingReady={billingReady}
          onBuy={confirm}
        />
      </div>
    </>
  );
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function Notice({
  workspace,
  currentPlan,
  title,
  body,
  href,
  cta,
}: {
  workspace: WorkspaceInfo;
  currentPlan: PersonalPlan;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="mt-6 max-w-xl rounded-2xl border bg-card p-6">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden>{workspace.icon}</span>
        {workspace.name} is on <PlanBadge plan={currentPlan} className="h-5 px-2 text-xs" />
      </p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <div className="mt-5">
        <Button asChild>
          <Link href={href}>
            {cta} <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
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
