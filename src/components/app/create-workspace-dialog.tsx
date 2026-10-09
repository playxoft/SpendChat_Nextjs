"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { useLoadingOverlay } from "./loading-overlay";
import { usePlan } from "./upgrade-dialog";
import { LimitPanel, LockedButton, useAddLimits, useAddLock } from "./limit-lock";
import { Segmented } from "@/components/pricing/segmented";
import { createWorkspace, createWorkspaceForPurchase } from "@/actions/workspaces";
import { DEFAULT_WORKSPACE_ICON, WORKSPACE_NAME_MAX } from "@/lib/validation";
import { newWorkspaceLock } from "@/lib/add-limits";
import { planLimitOf } from "@/lib/plan-limit";
import { PLAN_NAMES } from "@/lib/plans";
import {
  PAID_PERSONAL_PLANS,
  PERIODS,
  PERIOD_LABEL,
  formatAmount,
  quote,
  type PaidPersonalPlan,
  type Period,
} from "@/lib/pricing";

/**
 * Modal for creating a new workspace. Reused by the sidebar workspace switcher,
 * the workspace settings page and the organisation page. An outside click never
 * dismisses it (the dialog's app-wide default), so a stray click can't lose a
 * half-typed name.
 *
 * Someone who already owns a free workspace (one per person, C5) picks a plan
 * for the new one here instead: it's created view-only and they go straight
 * to checkout for it (`createWorkspaceForPurchase`). Paying opens it up; not
 * paying leaves an empty view-only workspace, which the next "New workspace"
 * reuses rather than making another.
 */
export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after a successful create (e.g. to close a parent menu). */
  onCreated?: () => void;
}) {
  const router = useRouter();
  const { run, pending } = useLoadingOverlay();
  const { handlePlanLimit, showUpgrade, plan, reportFailure, currency } = usePlan();
  const limits = useAddLimits();
  const lock = useAddLock("workspaces");
  // Already has their free workspace: the new one comes with a plan of its own.
  const buying = Boolean(lock);
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState(DEFAULT_WORKSPACE_ICON);
  const [buyPlan, setBuyPlan] = React.useState<PaidPersonalPlan>("plus");
  const [buyPeriod, setBuyPeriod] = React.useState<Period>("yearly");

  // Reset fields each time the dialog opens.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setIcon(DEFAULT_WORKSPACE_ICON);
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a workspace name");
      return;
    }
    if (buying) {
      run(async () => {
        const res = await createWorkspaceForPurchase({ name: trimmed, icon, plan: buyPlan, period: buyPeriod });
        if (!res.ok) {
          reportFailure(res, "Couldn't create the workspace. Please try again.");
          return;
        }
        if (res.reused) toast.message("You already have a workspace waiting for its plan — continuing with that one.");
        onOpenChange(false);
        onCreated?.();
        router.push(res.checkoutPath);
        router.refresh();
      }, "Creating workspace…");
      return;
    }
    // Full-screen loader covers the create + switch into the new workspace.
    run(async () => {
      const res = await createWorkspace(trimmed, icon);
      if (res.ok) {
        toast.success("Workspace created");
        onOpenChange(false);
        setName("");
        setIcon(DEFAULT_WORKSPACE_ICON);
        onCreated?.();
        router.push("/app");
        router.refresh();
      } else if (res.code === "plan_limit") {
        // One free workspace per person: explain it in the upgrade dialog
        // rather than leaving this form up with an error toast. The server
        // calls it `freeWorkspaces` (as it does a view-only workspace); here
        // it's about creating one, so it gets the "New workspace" words.
        onOpenChange(false);
        const refused = planLimitOf(res);
        if (refused?.limit === "freeWorkspaces") {
          showUpgrade(
            limits
              ? newWorkspaceLock(limits).info
              : { ...refused, limit: "newWorkspace", plan },
          );
        } else if (!handlePlanLimit(res)) {
          toast.error(res.error);
        }
      } else {
        toast.error(res.error);
      }
    }, "Creating workspace…");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>
            A workspace has its own profiles and members — handy for a company,
            a family, or a side project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          {buying ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">
                You already have your free workspace, so this one comes with its own plan. Pick one —
                you&apos;ll pay on the next page, and the workspace stays view-only until you do.
              </p>
              <Segmented
                label="Plan"
                value={buyPlan}
                onChange={setBuyPlan}
                options={PAID_PERSONAL_PLANS.map((p) => ({ value: p, label: PLAN_NAMES[p] }))}
                className="w-full"
              />
              <Segmented
                label="Billing period"
                value={buyPeriod}
                onChange={setBuyPeriod}
                options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p].toggle }))}
                className="w-full"
              />
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatAmount(quote(buyPlan, buyPeriod, currency ?? "USD").price, currency ?? "USD")}{" "}
                {PERIOD_LABEL[buyPeriod].billed}, plus tax.
              </p>
            </div>
          ) : (
            <LimitPanel lock={lock} />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">Name & icon</Label>
            <div className="flex items-center gap-2">
              <EmojiPicker
                onSelect={setIcon}
                trigger={
                  <Button type="button" variant="outline" size="icon" aria-label="Pick an icon">
                    <span className="text-base">{icon}</span>
                  </Button>
                }
              />
              <Input
                id="workspace-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Inc."
                maxLength={WORKSPACE_NAME_MAX}
                autoFocus
                className="flex-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {buying ? (
              <Button type="submit" disabled={pending}>
                Create and continue to payment
              </Button>
            ) : (
              <LockedButton type="submit" lock={lock} disabled={pending}>
                Create
              </LockedButton>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
