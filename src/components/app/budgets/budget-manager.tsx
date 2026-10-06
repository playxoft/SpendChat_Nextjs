"use client";

import { useState } from "react";
import { BellOff, Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countAlerts } from "@/lib/budgets";
import { budgetsLimitLabel } from "@/lib/plan-limit";
import { cn } from "@/lib/utils";
import { LimitTooltip, LockGlyph, useAddLimits, useAddLock } from "../limit-lock";
import { BudgetDeleteConfirm } from "./budget-delete-confirm";
import { BudgetDialog, type BudgetChoices } from "./budget-dialog";
import { BudgetRow, type BudgetItem } from "./budget-parts";

/**
 * The budgets page body: an alert banner when anything is at 80% or more, the
 * list, and the add / edit dialog. Alerts here are live — worked out from this
 * month's spending on every render, never stored.
 */
export function BudgetManager({
  budgets,
  choices,
  canAdd,
  currency,
  locale,
  monthLabel,
}: {
  budgets: BudgetItem[];
  /** Scopes this person may still add a budget for. */
  choices: BudgetChoices;
  /** They can manage at least one scope (even if all of theirs are taken). */
  canAdd: boolean;
  currency: string;
  locale: string;
  /** "October 2026". */
  monthLabel: string;
}) {
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; budget: BudgetItem } | null>(null);
  // Delete straight from the row, for someone who may delete but not change
  // a budget (an admin of a view-only workspace).
  const [deleting, setDeleting] = useState<BudgetItem | null>(null);
  const lock = useAddLock("budgets");
  const limits = useAddLimits();
  const anyLeft = choices.workspace || choices.profiles.length > 0 || choices.categories.length > 0;
  const alerts = countAlerts(budgets.map((b) => b.status));

  return (
    <div className="space-y-4">
      <AlertBanner over={alerts.over} warn={alerts.warn} monthLabel={monthLabel} />

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {budgets.length === 0
            ? monthLabel
            : `${monthLabel} · ${budgets.length} budget${budgets.length === 1 ? "" : "s"}`}
          {limits?.budgets ? ` · ${limits.budgets.unlimited ? "Unlimited" : `${limits.budgets.used} of ${budgetsLimitLabel(limits.plan)} used`}` : ""}
        </p>
        {canAdd && (
          <LimitTooltip lock={anyLeft ? lock : null}>
            <Button
              type="button"
              onClick={() => setDialog({ mode: "create" })}
              disabled={!anyLeft}
              title={anyLeft ? undefined : "Everything you can budget for already has one"}
            >
              <Plus className="size-4" /> New budget
              {lock && anyLeft && <LockGlyph />}
            </Button>
          </LimitTooltip>
        )}
      </div>

      {budgets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <PiggyBank className="size-5 text-muted-foreground" />
          </span>
          <div className="space-y-1">
            <p className="font-medium">Know before the month runs out</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Set a monthly limit for the whole workspace, one profile or one category.
              You&apos;ll see it fill up here, and get a heads-up at 80% and 100%.
            </p>
          </div>
          {canAdd && anyLeft && (
            <Button type="button" variant="outline" onClick={() => setDialog({ mode: "create" })}>
              <Plus className="size-4" /> Set your first budget
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {budgets.map((budget) => (
            <li key={budget.id} className="px-4 py-3.5">
              <BudgetRow
                budget={budget}
                currency={currency}
                locale={locale}
                action={
                  <div className="flex shrink-0 items-center gap-1 self-center">
                    {!budget.emailAlerts && (
                      <BellOff aria-label="Email alerts off" className="size-4 text-muted-foreground" />
                    )}
                    {budget.canManage ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Edit the ${budget.label} budget`}
                        onClick={() => setDialog({ mode: "edit", budget })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    ) : budget.canDelete ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Delete the ${budget.label} budget`}
                        onClick={() => setDeleting(budget)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <BudgetDialog
        open={dialog !== null}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
        budget={dialog?.mode === "edit" ? dialog.budget : null}
        choices={choices}
        currency={currency}
        locale={locale}
      />
      <BudgetDeleteConfirm
        budget={deleting}
        open={deleting !== null}
        onOpenChange={(v) => {
          if (!v) setDeleting(null);
        }}
      />
    </div>
  );
}

/** The in-app alert: shown while any visible budget is at 80% or more. */
function AlertBanner({ over, warn, monthLabel }: { over: number; warn: number; monthLabel: string }) {
  if (warn === 0) return null;
  const near = warn - over;
  const parts = [
    over > 0 ? `${over} budget${over === 1 ? " is" : "s are"} over` : null,
    near > 0
      ? over > 0
        ? `${near} ${near === 1 ? "is" : "are"} past 80%`
        : `${near} budget${near === 1 ? " is" : "s are"} past 80%`
      : null,
  ].filter(Boolean);
  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        over > 0
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300",
      )}
    >
      <span className="font-medium">{parts.join(", and ")}</span> for {monthLabel}. Nothing is
      blocked — it&apos;s a heads-up.
    </div>
  );
}
