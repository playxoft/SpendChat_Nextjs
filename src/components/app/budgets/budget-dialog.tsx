"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { addBudget, updateBudget } from "@/actions/budgets";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { BudgetScope } from "@/lib/budgets";
import { getCurrency } from "@/lib/currencies";
import { minorToInputString } from "@/lib/money";
import {
  amountPlaceholder,
  formatAmountInput,
  integerDigitCount,
  parseAmountInput,
  stripNonAmountChars,
} from "@/lib/parse-amount";
import { radioGroupKeys } from "@/lib/radio-group-keys";
import { AMOUNT_INTEGER_DIGITS_MAX } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { LimitPanel, LockedButton, useAddLock } from "../limit-lock";
import { usePlan } from "../upgrade-dialog";
import { BudgetDeleteConfirm } from "./budget-delete-confirm";
import type { BudgetItem } from "./budget-parts";

/** A profile or category the form can offer. */
export type BudgetOption = { id: string; name: string; icon: string | null };

/** What the person may add a budget for, minus scopes that already have one. */
export type BudgetChoices = {
  workspace: boolean;
  profiles: BudgetOption[];
  categories: BudgetOption[];
};

const SCOPE_LABEL: Record<BudgetScope, string> = {
  workspace: "Whole workspace",
  profile: "A profile",
  category: "A category",
};

const SCOPE_HINT: Record<BudgetScope, string> = {
  workspace: "Every expense in the workspace counts.",
  profile: "Only this profile's expenses count.",
  category: "This category's expenses count, in every profile.",
};

/**
 * Add a budget (create mode) or change one (edit mode — the amount and the
 * email switch; what it covers is fixed, delete lives here too). The plan's
 * budget cap shows up front as a panel and a locked Save, like every other
 * "new …" form.
 */
export function BudgetDialog({
  open,
  onOpenChange,
  budget,
  choices,
  currency,
  locale,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Present = edit mode. */
  budget?: BudgetItem | null;
  choices: BudgetChoices;
  currency: string;
  locale: string;
}) {
  const editing = !!budget;
  const scopes = (["workspace", "profile", "category"] as const).filter((s) =>
    s === "workspace" ? choices.workspace : s === "profile" ? choices.profiles.length > 0 : choices.categories.length > 0,
  );
  const [scope, setScope] = useState<BudgetScope>(scopes[0] ?? "workspace");
  const [targetId, setTargetId] = useState("");
  const [amount, setAmount] = useState("");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { reportFailure, showUpgrade } = usePlan();
  const budgetLock = useAddLock("budgets");
  const createLock = editing ? null : budgetLock;

  // Re-seed on every open: the dialog is mounted once and reused.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setScope(budget?.scope ?? scopes[0] ?? "workspace");
      setTargetId("");
      setAmount(budget ? minorToInputString(budget.amountMinor, currency, locale) : "");
      setEmailAlerts(budget?.emailAlerts ?? true);
    }
  }

  const options = scope === "profile" ? choices.profiles : scope === "category" ? choices.categories : [];
  const scopeKeys = radioGroupKeys(scopes, scope);
  function pickScope(next: BudgetScope) {
    setScope(next);
    setTargetId("");
  }
  const symbol = getCurrency(currency).symbol;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (createLock) {
      showUpgrade(createLock.info);
      return;
    }
    const value = parseAmountInput(amount, locale);
    if (value === null || value <= 0) {
      toast.error(
        value === null && amount.trim()
          ? `That amount isn't clear — try ${formatAmountInput(500, locale)}`
          : "Enter an amount greater than 0",
      );
      return;
    }
    // 0.001, or 0.4 in yen, is nothing once it's in whole minor units.
    const decimals = getCurrency(currency).decimals;
    if (Math.round(value * 10 ** decimals) <= 0) {
      toast.error(`The amount must be at least ${1 / 10 ** decimals} ${currency}`);
      return;
    }
    if (!editing && scope !== "workspace" && !targetId) {
      toast.error(scope === "profile" ? "Pick a profile" : "Pick a category");
      return;
    }
    startTransition(async () => {
      if (budget) {
        const res = await updateBudget(budget.id, { amount: value, emailAlerts });
        if (!res.ok) {
          reportFailure(res);
          return;
        }
        toast.success("Budget updated");
      } else {
        const input =
          scope === "profile"
            ? { scope, profileId: targetId, amount: value, emailAlerts }
            : scope === "category"
              ? { scope, categoryId: targetId, amount: value, emailAlerts }
              : { scope, amount: value, emailAlerts };
        const res = await addBudget(input);
        if (!res.ok) {
          // The plan's cap opens the upgrade dialog; anything else toasts.
          reportFailure(res);
          return;
        }
        toast.success("Budget added");
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>{budget ? `${budget.label} budget` : "New budget"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "A monthly limit on spending. It starts again on the 1st."
                : "Set a monthly limit. We'll tell you at 80% and again at 100%."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <LimitPanel lock={createLock} hint="Deleting a budget you don't need frees a place." />

            {!editing && (
              <div className="space-y-2">
                <Label id="budget-scope-label">For</Label>
                <div
                  role="radiogroup"
                  aria-labelledby="budget-scope-label"
                  onKeyDown={(e) => scopeKeys.onKeyDown(e, pickScope)}
                  className="grid grid-cols-3 gap-1.5"
                >
                  {scopes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={scope === s}
                      tabIndex={scopeKeys.tabIndexFor(s)}
                      onClick={() => pickScope(s)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        scope === s ? "border-foreground bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50",
                      )}
                    >
                      {SCOPE_LABEL[s]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{SCOPE_HINT[scope]}</p>
              </div>
            )}

            {!editing && scope !== "workspace" && (
              <div className="space-y-2">
                <Label htmlFor="budget-target">{scope === "profile" ? "Profile" : "Category"}</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger id="budget-target" className="w-full">
                    <SelectValue placeholder={scope === "profile" ? "Pick a profile" : "Pick a category"} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.icon ? `${o.icon} ` : ""}
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="budget-amount">Amount each month</Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                  {symbol}
                </span>
                <Input
                  id="budget-amount"
                  inputMode="decimal"
                  placeholder={amountPlaceholder(locale)}
                  value={amount}
                  autoFocus={editing}
                  onChange={(e) => {
                    const next = stripNonAmountChars(e.target.value, locale);
                    if (integerDigitCount(next, locale) <= AMOUNT_INTEGER_DIGITS_MAX) setAmount(next);
                  }}
                  className="pl-7 tabular-nums"
                />
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="budget-email">Email alerts</Label>
                <p className="text-xs text-muted-foreground">
                  Admins and whoever set the budget get an email at 80% and 100%. Alerts in
                  the app always show.
                </p>
              </div>
              <Switch id="budget-email" checked={emailAlerts} onCheckedChange={setEmailAlerts} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {budget?.canDelete ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmingDelete(true)}
                disabled={pending}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <LockedButton type="submit" lock={createLock} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save" : "Add budget"}
            </LockedButton>
          </DialogFooter>
        </form>
      </DialogContent>
      <BudgetDeleteConfirm
        budget={budget ?? null}
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        onDeleted={() => onOpenChange(false)}
      />
    </Dialog>
  );
}
