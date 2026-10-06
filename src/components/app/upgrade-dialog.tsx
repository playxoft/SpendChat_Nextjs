"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PersonalPlan } from "@/lib/plans";
import { planLimitOf, type PlanLimitInfo } from "@/lib/plan-limit";
import {
  BIGGEST_PLAN_LINE,
  NOTHING_DELETED_LINE,
  PAID_PLANS_STATUS,
  limitPitch,
  pricingCurrencyFor,
} from "@/lib/plan-copy";
import { TRIAL_DAYS, formatAmount, isPaidPersonalPlan, quote, type Currency } from "@/lib/pricing";
import { siteConfig } from "@/lib/site";
import type { AddLimitsData } from "@/lib/add-limits";
import { PlanBadge } from "./plan-badge";

/**
 * The workspace's plan, shared with deep client components (the composer's
 * voice gate, the viewer notice, the access pickers), plus the one upgrade
 * dialog every plan-limit failure opens. Resolved once on the server in the app
 * layout, like `PermissionsProvider` beside it — the server still enforces every
 * limit; this only decides what to show.
 */
export type PlanState = {
  plan: PersonalPlan;
  /** An extra free workspace (the owner has an older free one): everything is view-only. */
  readOnly: boolean;
  /** Voice entry works here (Pro). */
  voiceAllowed: boolean;
  /** Per-profile access can be changed (Plus/Pro). */
  profileLevelAccess: boolean;
  /**
   * `getAddLimits()` — what can still be added, so "new …" buttons and forms
   * can show a lock up front (`addLock` in `lib/add-limits.ts`). Absent outside
   * the app layout, which locks nothing.
   */
  addLimits?: AddLimitsData | null;
  /**
   * The workspace's currency (`workspaces.currency`), for the price the upgrade
   * dialog quotes. Shown in it when we sell in it, else in US dollars.
   */
  currency?: string | null;
};

type FailureLike = { ok: boolean; error?: string; code?: string; details?: unknown };

type PlanContextValue = PlanState & {
  /** Open the upgrade dialog for a limit. */
  showUpgrade: (info: PlanLimitInfo) => void;
  /**
   * Open the upgrade dialog if `res` failed on a plan limit. Returns whether it
   * did, so the caller can fall back to its usual error toast otherwise.
   */
  handlePlanLimit: (res: FailureLike) => boolean;
  /** `handlePlanLimit`, else a toast with the error — the usual failure path. */
  reportFailure: (res: FailureLike, fallback?: string) => void;
};

// Permissive defaults so a component rendered outside the app layout behaves
// as it did before plans: voice on, and failures fall back to a toast.
const DEFAULT_VALUE: PlanContextValue = {
  plan: "free",
  readOnly: false,
  voiceAllowed: true,
  profileLevelAccess: false,
  addLimits: null,
  showUpgrade: () => {},
  handlePlanLimit: () => false,
  reportFailure: (res, fallback) => {
    if (!res.ok) toast.error(res.error ?? fallback ?? "Something went wrong");
  },
};

const PlanContext = React.createContext<PlanContextValue>(DEFAULT_VALUE);

export function PlanProvider({
  children,
  ...state
}: PlanState & { children: React.ReactNode }) {
  const [info, setInfo] = React.useState<PlanLimitInfo | null>(null);
  const [open, setOpen] = React.useState(false);

  const showUpgrade = React.useCallback((next: PlanLimitInfo) => {
    setInfo(next);
    setOpen(true);
  }, []);

  const handlePlanLimit = React.useCallback(
    (res: FailureLike) => {
      const limit = planLimitOf(res);
      if (!limit) return false;
      showUpgrade(limit);
      return true;
    },
    [showUpgrade],
  );

  const reportFailure = React.useCallback(
    (res: FailureLike, fallback?: string) => {
      if (res.ok) return;
      if (!handlePlanLimit(res)) toast.error(res.error ?? fallback ?? "Something went wrong");
    },
    [handlePlanLimit],
  );

  const { plan, readOnly, voiceAllowed, profileLevelAccess } = state;
  const addLimits = state.addLimits ?? null;
  const value = React.useMemo<PlanContextValue>(
    () => ({
      plan,
      readOnly,
      voiceAllowed,
      profileLevelAccess,
      addLimits,
      showUpgrade,
      handlePlanLimit,
      reportFailure,
    }),
    [
      plan,
      readOnly,
      voiceAllowed,
      profileLevelAccess,
      addLimits,
      showUpgrade,
      handlePlanLimit,
      reportFailure,
    ],
  );

  return (
    <PlanContext.Provider value={value}>
      {children}
      <UpgradeDialog
        info={info}
        open={open}
        onOpenChange={setOpen}
        currency={pricingCurrencyFor(state.currency)}
      />
    </PlanContext.Provider>
  );
}

export function usePlan(): PlanContextValue {
  return React.useContext(PlanContext);
}

/**
 * Explains a plan limit in terms of what it's getting in the way of, names the
 * plan that lifts it with its price, and sends the reader to `/app/upgrade` to
 * compare. All the words come from `lib/plan-copy.ts`, so this says what the
 * pricing pages say. There's no checkout yet, so it never pretends to sell:
 * it says paid plans open soon, and that nothing already there is touched.
 */
export function UpgradeDialog({
  info,
  open,
  onOpenChange,
  currency = "USD",
}: {
  info: PlanLimitInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The currency to quote the plan in. */
  currency?: Currency;
}) {
  if (!info) return null;
  const copy = limitPitch(info);
  const target = copy.upgradeTo;
  const paid = target && isPaidPersonalPlan(target) ? target : null;
  const monthly = paid ? quote(paid, "monthly", currency) : null;
  const yearly = paid ? quote(paid, "yearly", currency) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" closeOnOutsideClick>
        <DialogHeader>
          <DialogTitle>{copy.headline}</DialogTitle>
          <DialogDescription>{copy.status}</DialogDescription>
        </DialogHeader>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          This workspace is on <PlanBadge plan={info.plan} />
        </p>

        {target ? (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <PlanBadge plan={target} className="h-5 px-2 text-xs" />
              {monthly ? (
                <p className="text-sm tabular-nums">
                  <span className="font-semibold">{formatAmount(monthly.price, currency)}</span>
                  <span className="text-muted-foreground"> a month</span>
                </p>
              ) : null}
            </div>
            {copy.pitch ? <p className="text-sm">{copy.pitch}</p> : null}
            {yearly ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                Or {formatAmount(yearly.perMonth, currency)} a month, paid yearly. The first{" "}
                {TRIAL_DAYS} days are free.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm">{BIGGEST_PLAN_LINE}</p>
        )}

        <p className="text-xs text-muted-foreground">
          {target ? `${PAID_PLANS_STATUS.short} ` : ""}
          {NOTHING_DELETED_LINE}
        </p>

        <DialogFooter>
          {target ? (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Not now
              </Button>
              <Button asChild>
                <Link href="/app/upgrade" onClick={() => onOpenChange(false)}>
                  See plans
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button asChild>
                <a href={`mailto:${siteConfig.supportEmail}`}>
                  <Mail className="size-4" />
                  Contact us
                </a>
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A small "Upgrade" hint for a feature the plan doesn't include — the composer's
 * voice note, the Free access matrix. Opens the upgrade dialog for `info`.
 */
export function UpgradeHint({
  info,
  children,
  className,
}: {
  info: PlanLimitInfo;
  children: React.ReactNode;
  className?: string;
}) {
  const { showUpgrade } = usePlan();
  return (
    <p className={className ?? "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"}>
      <span>{children}</span>
      <Button
        type="button"
        variant="link"
        size="xs"
        className="h-auto p-0 text-xs"
        onClick={() => showUpgrade(info)}
      >
        See what&apos;s included
      </Button>
    </p>
  );
}
