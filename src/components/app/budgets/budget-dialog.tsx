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
import {
  BUDGET_DESCRIPTION_MAX,
  BUDGET_TITLE_MAX,
  suggestedBudgetTitle,
  type BudgetScope,
} from "@/lib/budgets";
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

/** A space, profile or category the form can offer. */
export type BudgetOption = { id: string; name: string; icon: string | null };

/** What the person may add a budget for, minus scopes that already have one. */
export type BudgetChoices = {
  workspace: boolean;
  /** Spaces they can see and manage a budget for. */
  spaces: BudgetOption[];
  profiles: BudgetOption[];
  categories: BudgetOption[];
};

/** The scopes in the order the form offers them — widest first. */
const SCOPE_CHOICES = ["workspace", "space", "profile", "category"] as const;

const SCOPE_LABEL: Record<BudgetScope, string> = {
  workspace: "Whole workspace",
  space: "A space",
  profile: "A profile",
  category: "A category",
};

const SCOPE_HINT: Record<BudgetScope, string> = {
  workspace: "Every expense in the workspace counts.",
  space: "Every profile in this space counts — as the space is now, if profiles move.",
  profile: "Only this profile's expenses count.",
  category: "This category's expenses count, in every profile.",
};

const TARGET_NOUN: Record<Exclude<BudgetScope, "workspace">, string> = {
  space: "space",
  profile: "profile",
  category: "category",
};

/**
 * Add a budget (create mode) or change one (edit mode — the title, the note,
 * the amount and the email switch; what it covers is fixed, delete lives here
 * too). A new budget's title follows what it's for ("Groceries this month",
 * "Home space") until it's typed over. The plan's budget cap shows up front as
 * a panel and a locked Save, like every other "new …" form.
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
  const optionsFor = (s: BudgetScope): BudgetOption[] =>
    s === "space" ? choices.spaces : s === "profile" ? choices.profiles : s === "category" ? choices.categories : [];
  const scopes = SCOPE_CHOICES.filter((s) => (s === "workspace" ? choices.workspace : optionsFor(s).length > 0));
  const [scope, setScope] = useState<BudgetScope>(scopes[0] ?? "workspace");
  const [targetId, setTargetId] = useState("");
  const [title, setTitle] = useState("");
  // The title follows the scope and target until someone types their own.
  const [titleEdited, setTitleEdited] = useState(false);
  const [description, setDescription] = useState("");
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
      const first = budget?.scope ?? scopes[0] ?? "workspace";
      setScope(first);
      setTargetId("");
      setTitle(budget?.title ?? suggestion(first, ""));
      setTitleEdited(!!budget);
      setDescription(budget?.description ?? "");
      setAmount(budget ? minorToInputString(budget.amountMinor, currency, locale) : "");
      setEmailAlerts(budget?.emailAlerts ?? true);
    }
  }

  const options = optionsFor(scope);
  const scopeKeys = radioGroupKeys(scopes, scope);

  /** The title a new budget for `s` / `id` would start with. */
  function suggestion(s: BudgetScope, id: string): string {
    const name = optionsFor(s).find((o) => o.id === id)?.name;
    if (s !== "workspace" && !name) return "";
    return suggestedBudgetTitle({ scope: s, spaceName: name, profileName: name, categoryName: name });
  }
  function pickScope(next: BudgetScope) {
    setScope(next);
    setTargetId("");
    if (!titleEdited) setTitle(suggestion(next, ""));
  }
  function pickTarget(id: string) {
    setTargetId(id);
    if (!titleEdited) setTitle(suggestion(scope, id));
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
      toast.error(`Pick a ${TARGET_NOUN[scope]}`);
      return;
    }
    // A cleared title on a new budget falls back to the suggestion, as the server would.
    const cleanTitle = title.trim() || (budget ? "" : suggestion(scope, targetId));
    if (!cleanTitle) {
      toast.error("Give the budget a title");
      return;
    }
    const note = description.trim() || null;
    startTransition(async () => {
      if (budget) {
        const res = await updateBudget(budget.id, {
          amount: value,
          emailAlerts,
          title: cleanTitle,
          description: note,
        });
        if (!res.ok) {
          reportFailure(res);
          return;
        }
        toast.success("Budget updated");
      } else {
        const shared = { amount: value, emailAlerts, title: cleanTitle, description: note };
        const input =
          scope === "space"
            ? { scope, spaceId: targetId, ...shared }
            : scope === "profile"
              ? { scope, profileId: targetId, ...shared }
              : scope === "category"
                ? { scope, categoryId: targetId, ...shared }
                : { scope, ...shared };
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
            <DialogTitle>{budget ? "Edit budget" : "New budget"}</DialogTitle>
            <DialogDescription>
              {budget
                ? `${budget.scopeText} — a monthly limit that starts again on the 1st.`
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
                  className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
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
                <Label htmlFor="budget-target" className="capitalize">
                  {TARGET_NOUN[scope]}
                </Label>
                <Select value={targetId} onValueChange={pickTarget}>
                  <SelectTrigger id="budget-target" className="w-full">
                    <SelectValue placeholder={`Pick a ${TARGET_NOUN[scope]}`} />
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
              <Label htmlFor="budget-title">Title</Label>
              <Input
                id="budget-title"
                value={title}
                maxLength={BUDGET_TITLE_MAX}
                placeholder="Groceries this month"
                onChange={(e) => {
                  setTitle(e.target.value);
                  // Clearing the field hands it back to the suggestion.
                  setTitleEdited(e.target.value.trim() !== "");
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget-description">
                Note <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="budget-description"
                value={description}
                maxLength={BUDGET_DESCRIPTION_MAX}
                placeholder="What it's for, or what to cut first"
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

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
