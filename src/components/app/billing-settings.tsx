"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, CreditCard, ExternalLink, FileText, Loader2, UserRound, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Segmented } from "@/components/pricing/segmented";
import {
  cancelPlan,
  changePlan,
  openBillingPortal,
  resumePlan,
  undoScheduledPlanChange,
} from "@/actions/billing";
import { switchWorkspace } from "@/actions/workspaces";
import { planChangeKind } from "@/lib/billing-rules";
import { topUpCheckoutPath } from "@/lib/checkout";
import { formatMoney } from "@/lib/money";
import { PLAN_NAMES, type PersonalPlan } from "@/lib/plans";
import {
  PERIODS,
  PERIOD_LABEL,
  PAID_PERSONAL_PLANS,
  formatAmount,
  isCurrency,
  quote,
  type PaidPersonalPlan,
  type Period,
} from "@/lib/pricing";
import { PlanBadge } from "./plan-badge";
import { usePlan } from "./upgrade-dialog";
import { useLoadingOverlay } from "./loading-overlay";

/**
 * Settings → Billing: every workspace this person administers — its plan and
 * period, where its billing stands (trial, renews on, cancels on, a payment
 * problem), a change waiting for the renewal, top-ups left and its invoices —
 * with the actions an admin needs; and any plan this person pays for in a
 * workspace they no longer administer, so it's never paid for unseen.
 *
 * A plan is paid by its buyer. Only the buyer gets the payment page, invoice
 * PDFs and the changes that could charge their card (moving up, keeping a
 * cancelled plan); everyone else sees who manages it, and can still lower the
 * bill (move down at renewal, cancel). Every action goes to the server, which
 * asks the payment provider; the plan itself changes when the provider's
 * webhook confirms it, so an upgrade lands on the "Activating…" page.
 */

type SubscriptionView = {
  plan: PersonalPlan;
  period: Period;
  status: string;
  currency: string;
  trialEndsAt: string | null;
  inTrial: boolean;
  nextBillingDate: string | null;
  cancelAtPeriodEnd: boolean;
  cancelling: boolean;
  scheduled: { plan: PersonalPlan; period: Period; at: string | null } | null;
  nextCharge: { amountMinor: number; beforeDiscounts: boolean } | null;
  buyer: { isMe: boolean; name: string | null; inWorkspace: boolean };
};

/** The shape `getBillingOverview` returns (kept structural — services are server-only). */
export type BillingData = {
  purchasesBlocked: boolean;
  paidElsewhere: { workspaceId: string; workspaceName: string; subscription: SubscriptionView }[];
  workspaces: {
    id: string;
    name: string;
    icon: string | null;
    plan: PersonalPlan;
    readOnly: boolean;
    /** `active`: in force now; false = a payment hold still in its grace. */
    hold: { reason: "payment_failed" | "dispute"; from: string; active: boolean } | null;
    subscription: SubscriptionView | null;
    topUps: { remaining: number; expiresAt: string }[];
    invoices: {
      paymentId: string;
      kind: "plan" | "topup";
      status: string;
      totalAmountMinor: number;
      currency: string;
      paidAt: string;
      invoiceUrl: string | null;
      refundedMinor: number;
      disputed: boolean;
    }[];
  }[];
};

type BillingWorkspace = BillingData["workspaces"][number];
type Result = { ok: boolean; error?: string; code?: string; details?: unknown };

function day(iso: string | null): string {
  if (!iso) return "the next billing date";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function planLabel(plan: PersonalPlan, period: Period): string {
  return `${PLAN_NAMES[plan]} · ${PERIOD_LABEL[period].toggle}`;
}

/** Live but not running: payment failed, paused, or still pending. Cancelling ends these now. */
const isRunning = (s: SubscriptionView) => s.status === "active";
const isEntitled = (s: SubscriptionView) => ["active", "past_due", "on_hold"].includes(s.status);

function chargeText(s: SubscriptionView): string | null {
  if (!s.nextCharge) return null;
  return `${formatMoney(s.nextCharge.amountMinor, s.currency)} + tax${s.nextCharge.beforeDiscounts ? " (before any discount)" : ""}`;
}

function managedBy(s: SubscriptionView): string {
  if (!s.buyer.name) return "The person who paid for this plan no longer has an account; it ends at the end of its period.";
  return `Billing is managed by ${s.buyer.name}${s.buyer.inWorkspace ? "" : " (no longer in this workspace)"} — it's their payment method.`;
}

export function BillingSettings({
  data,
  currentWorkspaceId,
  billingReady,
}: {
  data: BillingData;
  currentWorkspaceId: string;
  billingReady: boolean;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>
            Each workspace has its own plan, its own billing date and its own invoices. You see the
            workspaces you&apos;re an admin of.{" "}
            <Link href="/billing-policy" className="underline underline-offset-2 hover:text-foreground">
              Billing &amp; refund policy
            </Link>
          </CardDescription>
        </CardHeader>
        {data.purchasesBlocked || !billingReady ? (
          <CardContent>
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {data.purchasesBlocked
                ? "Purchases are turned off for your account after a disputed payment. Contact support to sort it out — your workspaces and everything in them are untouched."
                : "Payments aren't available on this server yet."}
            </p>
          </CardContent>
        ) : null}
      </Card>
      {data.paidElsewhere.length > 0 ? <PaidElsewhere items={data.paidElsewhere} /> : null}
      {data.workspaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">You aren&apos;t an admin of any workspace.</p>
      ) : (
        data.workspaces.map((w) => (
          <WorkspaceBilling
            key={w.id}
            w={w}
            current={w.id === currentWorkspaceId}
            canBuy={billingReady && !data.purchasesBlocked}
          />
        ))
      )}
    </>
  );
}

/** Plans this person pays for in workspaces they're no longer an admin of. */
function PaidElsewhere({ items }: { items: BillingData["paidElsewhere"] }) {
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [pending, startTransition] = React.useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plans you pay for elsewhere</CardTitle>
        <CardDescription>
          You&apos;re paying for these workspaces&apos; plans but aren&apos;t one of their admins any more.
          They keep their plan until you cancel it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {items.map((it) => {
            const s = it.subscription;
            return (
              <li key={it.workspaceId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="font-medium">{it.workspaceName}</span>{" "}
                  <span className="text-muted-foreground">
                    · {planLabel(s.plan, s.period)} ·{" "}
                    {s.cancelAtPeriodEnd || s.cancelling ? `ends ${day(s.nextBillingDate)}` : `renews ${day(s.nextBillingDate)}`}
                  </span>
                </span>
                {s.cancelAtPeriodEnd || s.cancelling ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await cancelPlan(it.workspaceId);
                        if (!res.ok) return reportFailure(res);
                        toast.success(`You'll stop paying for ${it.workspaceName}'s plan`);
                        router.refresh();
                      })
                    }
                  >
                    {isRunning(s) ? "Cancel at period end" : "Cancel now"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function statusOf(w: BillingWorkspace): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  const s = w.subscription;
  if (w.hold?.reason === "dispute") return { label: "Disputed payment", tone: "bad" };
  if (s?.cancelling) return { label: "Cancelling", tone: "warn" };
  if (s?.status === "on_hold") return { label: "Payment problem", tone: w.hold?.active ? "bad" : "warn" };
  if (s?.status === "past_due") return { label: "Payment retrying", tone: "warn" };
  if (s?.status === "paused") return { label: "Paused", tone: "muted" };
  if (s?.status === "pending") return { label: "Payment pending", tone: "muted" };
  if (!s) return w.readOnly ? { label: "View-only", tone: "muted" } : { label: "Free", tone: "muted" };
  if (s.cancelAtPeriodEnd) return { label: `Cancels on ${day(s.nextBillingDate)}`, tone: "warn" };
  if (s.inTrial) return { label: "Free trial", tone: "ok" };
  return { label: `Renews on ${day(s.nextBillingDate)}`, tone: "ok" };
}

const TONE = {
  ok: "border-emerald-600/30 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  bad: "border-destructive/40 text-destructive",
  muted: "",
} as const;

function WorkspaceBilling({ w, current, canBuy }: { w: BillingWorkspace; current: boolean; canBuy: boolean }) {
  const router = useRouter();
  const { run } = useLoadingOverlay();
  const { reportFailure } = usePlan();
  const [pending, startTransition] = React.useTransition();
  const [changeOpen, setChangeOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const s = w.subscription;
  const status = statusOf(w);
  const isBuyer = Boolean(s?.buyer.isMe);

  /** Go to an app page *in this workspace* — switching to it first if it isn't the open one. */
  function openIn(path: string) {
    if (current) {
      router.push(path);
      return;
    }
    run(
      async () => {
        const res = await switchWorkspace(w.id);
        if (!res.ok) return reportFailure(res);
        router.push(path);
        router.refresh();
      },
      "Switching workspace…",
      { variant: "spinner" },
    );
  }

  function act(fn: () => Promise<Result>, done: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return reportFailure(res);
      toast.success(done);
      router.refresh();
    });
  }

  function portal() {
    startTransition(async () => {
      const res = await openBillingPortal(w.id);
      if (!res.ok) return reportFailure(res, "Couldn't open the payment page. Please try again.");
      window.location.assign(res.url);
    });
  }

  const topUpLeft = w.topUps.reduce((n, t) => n + t.remaining, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent">
            {w.icon ? <span aria-hidden>{w.icon}</span> : <Building2 aria-hidden className="size-4" />}
          </span>
          <span className="truncate">{w.name}</span>
          <PlanBadge plan={w.plan} />
          {current && <span className="text-xs font-normal text-muted-foreground">Current</span>}
        </CardTitle>
        <CardDescription>{s ? planLabel(s.plan, s.period) : "No paid plan"}</CardDescription>
        <CardAction>
          <Badge variant="outline" className={TONE[status.tone]}>
            {status.label}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <StatusLines w={w} />
        {s && !isBuyer ? (
          <p className="flex items-start gap-2 text-muted-foreground">
            <UserRound className="mt-0.5 size-4 shrink-0" />
            {managedBy(s)}
          </p>
        ) : null}

        {s?.scheduled && isRunning(s) ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <span>
              Switches to <span className="font-medium">{planLabel(s.scheduled.plan, s.scheduled.period)}</span> on{" "}
              {day(s.scheduled.at ?? s.nextBillingDate)}.
            </span>
            {isBuyer ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending || !canBuy}
                onClick={() => act(() => undoScheduledPlanChange(w.id), "The scheduled change is cancelled")}
              >
                Keep {planLabel(s.plan, s.period)}
              </Button>
            ) : null}
          </div>
        ) : null}

        {topUpLeft > 0 ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Zap className="size-4 shrink-0" />
            {topUpLeft.toLocaleString("en-US")} top-up AI actions left · the first {w.topUps[0]!.remaining.toLocaleString("en-US")} expire{" "}
            {day(w.topUps[0]!.expiresAt)}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!s ? (
            <Button size="sm" disabled={!canBuy} onClick={() => openIn("/app/upgrade")}>
              Upgrade
            </Button>
          ) : (
            <>
              {isRunning(s) && !s.cancelling ? (
                <Button size="sm" variant="secondary" disabled={pending || !canBuy} onClick={() => setChangeOpen(true)}>
                  Change plan
                </Button>
              ) : null}
              {isEntitled(s) ? (
                <Button size="sm" variant="secondary" disabled={!canBuy} onClick={() => openIn(topUpCheckoutPath())}>
                  <Zap className="size-4" /> Buy AI top-up
                </Button>
              ) : null}
              {s.cancelling ? null : s.cancelAtPeriodEnd ? (
                isBuyer ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => act(() => resumePlan(w.id), `${w.name} keeps its plan`)}
                  >
                    Keep plan
                  </Button>
                ) : null
              ) : (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setCancelOpen(true)}>
                  {isRunning(s) ? "Cancel plan" : "Cancel plan now"}
                </Button>
              )}
              {isBuyer ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={portal}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                  Manage payment method
                </Button>
              ) : null}
            </>
          )}
        </div>

        <Invoices invoices={w.invoices} />
      </CardContent>

      {s ? (
        <>
          {isRunning(s) ? (
            <ChangePlanDialog
              open={changeOpen}
              onOpenChange={setChangeOpen}
              workspace={w}
              current={{ plan: s.plan as PaidPersonalPlan, period: s.period }}
              subscription={s}
            />
          ) : null}
          <CancelDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            name={w.name}
            subscription={s}
            onConfirm={() => {
              setCancelOpen(false);
              act(
                () => cancelPlan(w.id),
                isRunning(s) ? `${w.name} will go back to Free on ${day(s.nextBillingDate)}` : `${w.name}'s plan is cancelled`,
              );
            }}
          />
        </>
      ) : null}
    </Card>
  );
}

function StatusLines({ w }: { w: BillingWorkspace }) {
  const s = w.subscription;
  const charge = s ? chargeText(s) : null;
  const lines: string[] = [];
  if (w.hold?.reason === "dispute") {
    lines.push(
      "A payment for this workspace was disputed with the bank, so it's view-only for now. Everything in it is kept — contact support to sort it out.",
    );
  } else if (s?.cancelling) {
    lines.push("This plan is being cancelled. The workspace goes back to Free when it ends; nothing in it is deleted.");
  } else if (s?.status === "on_hold") {
    lines.push(
      w.hold && !w.hold.active
        ? `The renewal payment didn't go through. Update the payment method by ${day(w.hold!.from)}, or the workspace turns view-only then (nothing is deleted).`
        : "The renewal payment didn't go through, so the workspace is view-only. Update the payment method and it opens up again as soon as the payment clears.",
    );
  } else if (s?.status === "past_due") {
    lines.push("A renewal payment failed and is being retried. Everything keeps working — check the payment method to be safe.");
  } else if (s?.status === "paused") {
    lines.push("This plan is paused, so the workspace is on Free for now. Cancel it to buy a new plan.");
  } else if (s?.status === "pending") {
    lines.push("A payment for this plan is still being confirmed. If it doesn't go through, cancel it to start again.");
  } else if (s && s.status === "active") {
    if (s.inTrial) {
      lines.push(
        s.cancelAtPeriodEnd
          ? `Free trial until ${day(s.trialEndsAt)}. It's set to cancel, so nothing will be charged.`
          : `Free trial until ${day(s.trialEndsAt)}${charge ? `, then ${charge} ${PERIOD_LABEL[s.scheduled?.period ?? s.period].billed}` : ""}.`,
      );
    } else if (s.cancelAtPeriodEnd) {
      lines.push(`Paid until ${day(s.nextBillingDate)}, then back to Free. Nothing in the workspace is deleted.`);
    } else {
      lines.push(`Next charge${charge ? ` ${charge}` : ""} on ${day(s.nextBillingDate)}.`);
    }
  } else if (w.readOnly) {
    lines.push("An extra free workspace — view-only until it has its own Plus or Pro plan. Nothing in it is deleted.");
  }
  if (lines.length === 0) return null;
  return (
    <div className="space-y-1 text-muted-foreground">
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  );
}

/** What an invoice row says about its payment. */
function paymentState(p: BillingWorkspace["invoices"][number]): string {
  if (p.disputed) return "Disputed";
  if (p.refundedMinor >= p.totalAmountMinor && p.refundedMinor > 0) return "Refunded";
  if (p.refundedMinor > 0) return "Partly refunded";
  if (p.status === "succeeded") return "Paid";
  if (p.status === "failed") return "Failed";
  if (p.status === "cancelled") return "Cancelled";
  return "Processing";
}

function Invoices({ invoices }: { invoices: BillingWorkspace["invoices"] }) {
  if (invoices.length === 0) return null;
  return (
    <details className="group rounded-lg border">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-medium">
        <FileText className="size-4" /> Payments ({invoices.length})
      </summary>
      <ul className="divide-y border-t">
        {invoices.map((p) => (
          <li key={p.paymentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <span className="w-28 shrink-0 tabular-nums text-muted-foreground">{day(p.paidAt)}</span>
            <span className="min-w-0 flex-1">{p.kind === "topup" ? "AI top-up" : "Plan"}</span>
            <span className="tabular-nums">{formatMoney(p.totalAmountMinor, p.currency)}</span>
            <span className="w-24 text-xs text-muted-foreground">{paymentState(p)}</span>
            {p.invoiceUrl ? (
              <a
                href={p.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:text-foreground"
              >
                Invoice <ExternalLink className="size-3" />
              </a>
            ) : (
              <span className="w-14" />
            )}
          </li>
        ))}
      </ul>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        Invoice PDFs carry the payer&apos;s name and address, so only the person who paid can open them.
      </p>
    </details>
  );
}

function ChangePlanDialog({
  open,
  onOpenChange,
  workspace,
  current,
  subscription: s,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: BillingWorkspace;
  current: { plan: PaidPersonalPlan; period: Period };
  subscription: SubscriptionView;
}) {
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [pending, startTransition] = React.useTransition();
  const [plan, setPlan] = React.useState<PaidPersonalPlan>(current.plan);
  const [period, setPeriod] = React.useState<Period>(current.period);
  const kind = planChangeKind(current, { plan, period });
  const target = planLabel(plan, period);
  // The subscription's own currency — it's locked for the plan's life.
  const price = isCurrency(s.currency)
    ? `${formatAmount(quote(plan, period, s.currency).price, s.currency)} ${PERIOD_LABEL[period].billed}, plus tax`
    : null;
  const upgradeBlocked = kind === "upgrade" && !s.buyer.isMe;

  function confirm() {
    startTransition(async () => {
      const res = await changePlan(workspace.id, { plan, period });
      if (!res.ok) return reportFailure(res, "Couldn't change the plan. Please try again.");
      onOpenChange(false);
      if (res.change.kind === "upgrade") {
        router.push(`/app/upgrade/return?${new URLSearchParams({ workspace: workspace.id, plan, period })}`);
        return;
      }
      toast.success(`${target} starts on ${day(s.nextBillingDate)}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change {workspace.name}&apos;s plan</DialogTitle>
          <DialogDescription>Now on {planLabel(current.plan, current.period)}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Segmented
            label="Plan"
            value={plan}
            onChange={setPlan}
            options={PAID_PERSONAL_PLANS.map((p) => ({ value: p, label: PLAN_NAMES[p] }))}
            className="w-full"
          />
          <Segmented
            label="Billing period"
            value={period}
            onChange={setPeriod}
            options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p].toggle }))}
            className="w-full"
          />
          {price && kind !== "same" ? <p className="text-sm font-medium tabular-nums">{target}: {price}</p> : null}
          <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
            {kind === "same"
              ? "That's the plan it's on."
              : upgradeBlocked
                ? `Moving up charges the card it's paid with, so only ${s.buyer.name ?? "the person who pays for it"} can do it.`
                : kind === "upgrade"
                  ? `${target} starts as soon as it's paid: you're charged today, less a credit for the unused part of the current plan, and the billing date moves to today.${s.inTrial ? " This ends the free trial now." : ""}`
                  : `${target} starts on ${day(s.nextBillingDate)}. Nothing is charged today, the current plan runs until then, and AI actions already used this month carry over.`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={pending || kind === "same" || upgradeBlocked} onClick={confirm}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {kind === "upgrade" ? "Upgrade now" : "Switch at renewal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  name,
  subscription: s,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  subscription: SubscriptionView;
  onConfirm: () => void;
}) {
  const running = isRunning(s);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{running ? `Cancel ${name}'s plan?` : `Cancel ${name}'s plan now?`}</DialogTitle>
          <DialogDescription>
            {running
              ? s.inTrial
                ? `The trial runs until ${day(s.trialEndsAt)} and nothing will be charged.`
                : `It stays on its plan until ${day(s.nextBillingDate)} — what's been paid for — then goes back to Free.`
              : "Its payment didn't go through (or it isn't running), so there's no paid time left: cancelling ends the plan now and the workspace goes back to Free."}{" "}
            Nothing in the workspace is deleted; over Free&apos;s limits, you just can&apos;t add more.
            {running && s.buyer.isMe ? " You can keep the plan again any time before then." : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep plan
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {running ? "Cancel at period end" : "Cancel now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
