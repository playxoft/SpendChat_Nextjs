"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PLAN_NAMES, type PersonalPlan } from "@/lib/plans";
import { planLimitOf, upgradeCopy, type PlanLimitInfo } from "@/lib/plan-limit";
import { siteConfig } from "@/lib/site";
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
  grandfathered: boolean;
  /** Grandfathered and still inside the grace period. */
  inGrace: boolean;
  /** An extra free workspace past its grace period: everything is view-only. */
  readOnly: boolean;
  /** Voice entry works here (Pro, or grandfathered during grace). */
  voiceAllowed: boolean;
  /** Per-profile access can be changed (Plus/Pro). */
  profileLevelAccess: boolean;
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
  grandfathered: false,
  inGrace: false,
  readOnly: false,
  voiceAllowed: true,
  profileLevelAccess: false,
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

  const { plan, grandfathered, inGrace, readOnly, voiceAllowed, profileLevelAccess } = state;
  const value = React.useMemo<PlanContextValue>(
    () => ({
      plan,
      grandfathered,
      inGrace,
      readOnly,
      voiceAllowed,
      profileLevelAccess,
      showUpgrade,
      handlePlanLimit,
      reportFailure,
    }),
    [
      plan,
      grandfathered,
      inGrace,
      readOnly,
      voiceAllowed,
      profileLevelAccess,
      showUpgrade,
      handlePlanLimit,
      reportFailure,
    ],
  );

  return (
    <PlanContext.Provider value={value}>
      {children}
      <UpgradeDialog info={info} open={open} onOpenChange={setOpen} />
    </PlanContext.Provider>
  );
}

export function usePlan(): PlanContextValue {
  return React.useContext(PlanContext);
}

/**
 * Explains a plan limit and the plan that lifts it. There's no checkout yet, so
 * it never pretends to sell anything: it says what the limit is, what the next
 * plan includes, and that paid plans are coming soon. Prices aren't shown here
 * — they belong on the pricing page once it's live.
 */
export function UpgradeDialog({
  info,
  open,
  onOpenChange,
}: {
  info: PlanLimitInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!info) return null;
  const copy = upgradeCopy(info);
  const target = copy.upgradeTo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" closeOnOutsideClick>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.reason}</DialogDescription>
        </DialogHeader>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          This workspace is on <PlanBadge plan={info.plan} />
        </p>

        {target ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <PlanBadge plan={target} />
              {copy.upgradeLine && <p className="text-sm font-medium">{copy.upgradeLine}</p>}
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Everything in {PLAN_NAMES[target]}, for the whole workspace:
              </p>
              <ul className="space-y-1">
                {copy.includes.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm">
            This is already our biggest plan. If you need more, write to us and we&apos;ll
            help.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          {target ? "Paid plans are coming soon. " : ""}
          Nothing you already have is affected — limits only stop adding new things.
        </p>

        <DialogFooter>
          {target ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Got it
            </Button>
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
