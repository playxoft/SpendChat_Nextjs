"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, CreditCard, ExternalLink, FileText, Loader2, Zap } from "lucide-react";
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
  type PaidPersonalPlan,
  type Period,
} from "@/lib/pricing";
import { PlanBadge } from "./plan-badge";
import { usePlan } from "./upgrade-dialog";
import { useLoadingOverlay } from "./loading-overlay";

/**
 * Settings → Billing: every workspace this person administers — its plan and
 * period, where its billing stands (trial, renews on, cancels on, a payment
 * problem), a change waiting for the renewal, top-ups left, and its invoices —
 * with the actions an admin needs. Every action goes to the server, which asks
 * the payment provider; the plan itself changes when the provider's webhook
 * confirms it, so an upgrade lands on the "Activating…" page.
 */

/** The shape `getBillingOverview` returns (kept structural — services are server-only). */
export type BillingData = {
  purchasesBlocked: boolean;
  workspaces: {
    id: string;
    name: string;
    icon: string | null;
    plan: PersonalPlan;
    readOnly: boolean;
    /** `active`: in force now; false = a payment hold still in its grace. */
    hold: { reason: "payment_failed" | "dispute"; from: string; active: boolean } | null;
    subscription: {
      plan: PersonalPlan;
      period: Period;
      status: string;
      currency: string;
      trialEndsAt: string | null;
      inTrial: boolean;
      nextBillingDate: string | null;
      cancelAtPeriodEnd: boolean;
      scheduled: { plan: PersonalPlan; period: Period; at: string | null } | null;
      nextChargeMinor: number | null;
    } | null;
    hasBillingAccount: boolean;
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

function day(iso: string | null): string {
  if (!iso) return "the next billing date";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function planLabel(plan: PersonalPlan, period: Period): string {
  return `${PLAN_NAMES[plan]} · ${PERIOD_LABEL[period].toggle}`;
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

function statusOf(w: BillingWorkspace): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  const s = w.subscription;
  if (w.hold?.reason === "dispute") return { label: "Disputed payment", tone: "bad" };
  if (s?.status === "on_hold") return { label: "Payment problem", tone: w.hold?.active ? "bad" : "warn" };
  if (s?.status === "past_due") return { label: "Payment retrying", tone: "warn" };
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
  const paid = s && ["active", "past_due", "on_hold"].includes(s.status);

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

  function act(fn: () => Promise<{ ok: boolean; error?: string; code?: string; details?: unknown }>, done: string) {
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
        <CardDescription>{s && paid ? planLabel(s.plan, s.period) : "No paid plan"}</CardDescription>
        <CardAction>
          <Badge variant="outline" className={TONE[status.tone]}>
            {status.label}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <StatusLines w={w} />

        {s?.scheduled && paid ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <span>
              Switches to <span className="font-medium">{planLabel(s.scheduled.plan, s.scheduled.period)}</span> on{" "}
              {day(s.scheduled.at ?? s.nextBillingDate)}.
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending || !canBuy}
              onClick={() => act(() => undoScheduledPlanChange(w.id), "The scheduled change is cancelled")}
            >
              Keep {planLabel(s.plan, s.period)}
            </Button>
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
          {!s || !paid ? (
            <Button size="sm" disabled={!canBuy} onClick={() => openIn("/app/upgrade")}>
              Upgrade
            </Button>
          ) : (
            <>
              {s.status === "active" ? (
                <Button size="sm" variant="secondary" disabled={pending || !canBuy} onClick={() => setChangeOpen(true)}>
                  Change plan
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" disabled={!canBuy} onClick={() => openIn(topUpCheckoutPath())}>
                <Zap className="size-4" /> Buy AI top-up
              </Button>
              {s.cancelAtPeriodEnd ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => act(() => resumePlan(w.id), `${w.name} keeps its plan`)}
                >
                  Keep plan
                </Button>
              ) : (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setCancelOpen(true)}>
                  Cancel plan
                </Button>
              )}
            </>
          )}
          {w.hasBillingAccount ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={portal}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
              Manage payment method
            </Button>
          ) : null}
        </div>

        <Invoices invoices={w.invoices} />
      </CardContent>

      {s && paid ? (
        <>
          <ChangePlanDialog
            open={changeOpen}
            onOpenChange={setChangeOpen}
            workspace={w}
            current={{ plan: s.plan as PaidPersonalPlan, period: s.period }}
            inTrial={s.inTrial}
            renewal={s.nextBillingDate}
          />
          <CancelDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            name={w.name}
            endsAt={s.nextBillingDate}
            inTrial={s.inTrial}
            onConfirm={() => {
              setCancelOpen(false);
              act(() => cancelPlan(w.id), `${w.name} will go back to Free on ${day(s.nextBillingDate)}`);
            }}
          />
        </>
      ) : null}
    </Card>
  );
}

function StatusLines({ w }: { w: BillingWorkspace }) {
  const s = w.subscription;
  const charge =
    s?.nextChargeMinor != null ? `${formatMoney(s.nextChargeMinor, s.currency)} + tax` : null;
  const lines: string[] = [];
  if (w.hold?.reason === "dispute") {
    lines.push(
      "A payment for this workspace was disputed with the bank, so it's view-only for now. Everything in it is kept — contact support to sort it out.",
    );
  } else if (s?.status === "on_hold") {
    lines.push(
      w.hold && !w.hold.active
        ? `The renewal payment didn't go through. Update the payment method by ${day(w.hold!.from)}, or the workspace turns view-only then (nothing is deleted).`
        : "The renewal payment didn't go through, so the workspace is view-only. Update the payment method and it opens up again as soon as the payment clears.",
    );
  } else if (s?.status === "past_due") {
    lines.push("A renewal payment failed and is being retried. Everything keeps working — check the payment method to be safe.");
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

function Invoices({ invoices }: { invoices: BillingWorkspace["invoices"] }) {
  if (invoices.length === 0) return null;
  return (
    <details className="group rounded-lg border">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-medium">
        <FileText className="size-4" /> Invoices ({invoices.length})
      </summary>
      <ul className="divide-y border-t">
        {invoices.map((p) => {
          const state = p.disputed
            ? "Disputed"
            : p.refundedMinor >= p.totalAmountMinor
              ? "Refunded"
              : p.refundedMinor > 0
                ? "Partly refunded"
                : p.status === "succeeded"
                  ? "Paid"
                  : p.status === "failed"
                    ? "Failed"
                    : "Processing";
          return (
            <li key={p.paymentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="w-28 shrink-0 tabular-nums text-muted-foreground">{day(p.paidAt)}</span>
              <span className="min-w-0 flex-1">{p.kind === "topup" ? "AI top-up" : "Plan"}</span>
              <span className="tabular-nums">{formatMoney(p.totalAmountMinor, p.currency)}</span>
              <span className="w-24 text-xs text-muted-foreground">{state}</span>
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
          );
        })}
      </ul>
    </details>
  );
}

function ChangePlanDialog({
  open,
  onOpenChange,
  workspace,
  current,
  inTrial,
  renewal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: BillingWorkspace;
  current: { plan: PaidPersonalPlan; period: Period };
  inTrial: boolean;
  renewal: string | null;
}) {
  const router = useRouter();
  const { reportFailure } = usePlan();
  const [pending, startTransition] = React.useTransition();
  const [plan, setPlan] = React.useState<PaidPersonalPlan>(current.plan);
  const [period, setPeriod] = React.useState<Period>(current.period);
  const kind = planChangeKind(current, { plan, period });
  const target = planLabel(plan, period);

  function confirm() {
    startTransition(async () => {
      const res = await changePlan(workspace.id, { plan, period });
      if (!res.ok) return reportFailure(res, "Couldn't change the plan. Please try again.");
      onOpenChange(false);
      if (res.change.kind === "upgrade") {
        router.push(`/app/upgrade/return?${new URLSearchParams({ workspace: workspace.id, plan, period })}`);
        return;
      }
      toast.success(`${target} starts on ${day(renewal)}`);
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
          <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
            {kind === "same"
              ? "That's the plan it's on."
              : kind === "upgrade"
                ? `${target} starts as soon as it's paid: you're charged today, less a credit for the unused part of the current plan, and the billing date moves to today.${inTrial ? " This ends the free trial now." : ""}`
                : `${target} starts on ${day(renewal)}. Nothing is charged today, the current plan runs until then, and AI actions already used this month carry over.`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={pending || kind === "same"} onClick={confirm}>
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
  endsAt,
  inTrial,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  endsAt: string | null;
  inTrial: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel {name}&apos;s plan?</DialogTitle>
          <DialogDescription>
            {inTrial
              ? `The trial runs until ${day(endsAt)} and nothing will be charged.`
              : `It stays on its plan until ${day(endsAt)} — what you've paid for — then goes back to Free.`}{" "}
            Nothing in the workspace is deleted; over Free&apos;s limits, you just can&apos;t add more. You can
            keep the plan again any time before then.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep plan
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Cancel at period end
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
