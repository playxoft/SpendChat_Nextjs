"use client";

import { useState } from "react";
import { Mail, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BudgetBar, BudgetIcon, BudgetStatusBadge } from "@/components/app/budgets/budget-parts";
import { DemoFrame } from "./demo-frame";
import { DemoReplay } from "./demo-replay";
import { demoAmount, useDemoMoney } from "@/hooks/use-demo-currency";
import {
  WORKSPACE_BUDGET_LABEL,
  budgetStatus,
  countAlerts,
  percentUsed,
  thresholdsMet,
  type BudgetScope,
  type BudgetThreshold,
} from "@/lib/budgets";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Three budgets and the alerts they raise, using the app's own pieces.
 *
 * The bar, the "80%+" / "Over" chip and the icon are the real components from
 * `budget-parts.tsx`, and every percentage, status and threshold comes from
 * `src/lib/budgets.ts` — the same integer maths the budgets page, the nav
 * badge and the alert emails share. So when "Dining out" turns amber here at
 * 80%, it's because the app's rule says so, not because the demo was scripted
 * to.
 *
 * The outbox under the list stands in for the alert emails: one line per
 * budget per threshold, worded like the real subject lines, and never twice —
 * which is the promise the emails make. Nothing is sent; it's all `useState`.
 *
 * Seeds are USD minor units, rescaled into the visitor's currency by
 * `demoAmount()` like every other demo amount.
 */

type DemoBudget = {
  id: string;
  scope: BudgetScope;
  label: string;
  icon: string | null;
  /** The category an expense must be in to count; null = everything. */
  category: string | null;
  amountUsd: number;
  spentUsd: number;
};

const BUDGETS: DemoBudget[] = [
  { id: "all", scope: "workspace", label: WORKSPACE_BUDGET_LABEL, icon: null, category: null, amountUsd: 200_000, spentUsd: 131_000 },
  { id: "dining", scope: "category", label: "Dining out", icon: "🍽️", category: "dining", amountUsd: 25_000, spentUsd: 17_500 },
  { id: "groceries", scope: "category", label: "Groceries", icon: "🛒", category: "groceries", amountUsd: 50_000, spentUsd: 36_000 },
];

/** The expenses the visitor can log. Transport has no budget of its own. */
const EXPENSES = [
  { id: "dinner", label: "Dinner out", category: "dining", amountUsd: 4_500 },
  { id: "groceries", label: "Weekly shop", category: "groceries", amountUsd: 6_200 },
  { id: "taxi", label: "Taxi", category: "transport", amountUsd: 1_800 },
] as const;

type Email = { id: number; subject: string; over: boolean };

/** Spending per budget, in USD seed units — scaled at render. */
function seedSpent(): Record<string, number> {
  return Object.fromEntries(BUDGETS.map((b) => [b.id, b.spentUsd]));
}

export function BudgetsDemo() {
  const money = useDemoMoney();
  const [spentUsd, setSpentUsd] = useState<Record<string, number>>(seedSpent);
  const [emails, setEmails] = useState<Email[]>([]);
  const [last, setLast] = useState<string | null>(null);

  const scale = (usd: number) => demoAmount(usd, money);
  const fmt = (minor: number) => formatMoney(minor, money.code, money.locale);

  const rows = BUDGETS.map((b) => {
    const amountMinor = scale(b.amountUsd);
    const spentMinor = scale(spentUsd[b.id] ?? 0);
    return {
      ...b,
      amountMinor,
      spentMinor,
      percent: percentUsed(spentMinor, amountMinor),
      status: budgetStatus(spentMinor, amountMinor),
    };
  });
  const alerts = countAlerts(rows.map((r) => r.status));

  function log(expense: (typeof EXPENSES)[number]) {
    const next = { ...spentUsd };
    const fresh: Email[] = [];
    for (const b of BUDGETS) {
      if (b.category !== null && b.category !== expense.category) continue;
      const before = thresholdsMet(scale(next[b.id] ?? 0), scale(b.amountUsd));
      next[b.id] = (next[b.id] ?? 0) + expense.amountUsd;
      const amountMinor = scale(b.amountUsd);
      const spentMinor = scale(next[b.id]!);
      const crossed = thresholdsMet(spentMinor, amountMinor).filter((t) => !before.includes(t));
      // Only the highest new threshold is told, as the real email does.
      const top: BudgetThreshold | undefined = crossed.at(-1);
      if (top === 100) {
        fresh.push({ id: 0, subject: `${b.label} is over budget for this month`, over: true });
      } else if (top === 80) {
        fresh.push({
          id: 0,
          subject: `${b.label}: ${percentUsed(spentMinor, amountMinor)}% of this month's budget used`,
          over: false,
        });
      }
    }
    setSpentUsd(next);
    setLast(expense.label);
    if (fresh.length) {
      setEmails((prev) => [...fresh.map((e, i) => ({ ...e, id: prev.length + i + 1 })).reverse(), ...prev]);
    }
  }

  function reset() {
    setSpentUsd(seedSpent());
    setEmails([]);
    setLast(null);
  }

  const badge =
    alerts.warn === 0
      ? null
      : alerts.over > 0
        ? `${alerts.over} budget${alerts.over === 1 ? "" : "s"} over this month`
        : `${alerts.warn} budget${alerts.warn === 1 ? "" : "s"} past 80% this month`;

  return (
    <>
      <DemoFrame
        label="Interactive budgets demo"
        active="/app/budgets"
        className="h-[36rem]"
        header={
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3">
            <p className="text-sm font-medium">Budgets · this month</p>
            {badge && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums text-white",
                    alerts.over > 0 ? "bg-destructive" : "bg-amber-500",
                  )}
                >
                  {alerts.warn}
                </span>
                {badge}
              </span>
            )}
          </div>
        }
        bodyClassName="overflow-y-auto"
      >
        <div className="space-y-5 px-4 py-4">
          <ul className="space-y-4" aria-label="Budgets">
            {rows.map((b) => {
              const left = b.amountMinor - b.spentMinor;
              return (
                <li key={b.id} className="flex items-start gap-3">
                  <BudgetIcon scope={b.scope} icon={b.icon} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{b.label}</p>
                      <BudgetStatusBadge status={b.status} />
                      <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                        {b.percent}%
                      </span>
                    </div>
                    <BudgetBar percent={b.percent} status={b.status} label={`${b.label} budget`} />
                    <div className="flex items-center justify-between gap-2 text-xs tabular-nums text-muted-foreground">
                      <span>
                        {fmt(b.spentMinor)} of {fmt(b.amountMinor)}
                      </span>
                      <span className={cn(left < 0 && "font-medium text-destructive")}>
                        {left >= 0 ? `${fmt(left)} left` : `${fmt(-left)} over`}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">Log an expense</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXPENSES.map((e) => (
                <Button
                  key={e.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-full bg-background"
                  onClick={() => log(e)}
                >
                  <Plus className="size-3.5" />
                  {e.label} · {fmt(scale(e.amountUsd))}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
              {last ? `Added “${last}”. Every budget it falls under moved.` : "Try Dinner out twice."}
            </p>
          </div>

          <section aria-label="Alert emails">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Mail className="size-3.5" /> Alert emails to admins and whoever set the budget
            </p>
            {emails.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                Nothing yet. A budget emails once at 80% and once at 100% each month.
              </p>
            ) : (
              <ul className="mt-2 divide-y rounded-lg border bg-background">
                {emails.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span
                      aria-hidden
                      className={cn("size-1.5 shrink-0 rounded-full", e.over ? "bg-destructive" : "bg-amber-500")}
                    />
                    <span className="truncate">{e.subject}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DemoFrame>
      <DemoReplay onClick={reset} label="Reset" />
    </>
  );
}
