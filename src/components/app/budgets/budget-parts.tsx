import { Layers, Tag, UserRound } from "lucide-react";
import type { BudgetScope, BudgetStatus } from "@/lib/budgets";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The pieces every budget surface shares — the budgets page, the analytics
 * card — so a budget looks and reads the same wherever it shows. No hooks:
 * they render on the server or inside a client component alike.
 */

/** What a budget surface needs to draw one budget. */
export type BudgetItem = {
  id: string;
  scope: BudgetScope;
  profileId: string | null;
  categoryId: string | null;
  label: string;
  icon: string | null;
  amountMinor: number;
  spentMinor: number;
  percent: number;
  status: BudgetStatus;
  emailAlerts: boolean;
  /** Can change it (the amount, the email switch). */
  canManage: boolean;
  /** Can delete it — also in a view-only workspace, where changing can't. */
  canDelete: boolean;
};

const BAR_TONE: Record<BudgetStatus, string> = {
  ok: "bg-primary",
  warn: "bg-amber-500",
  over: "bg-destructive",
};

/** The progress bar: neutral, amber from 80%, red from 100%. */
export function BudgetBar({
  percent,
  status,
  label,
  className,
}: {
  percent: number;
  status: BudgetStatus;
  /** What the bar measures, for screen readers. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, percent)}
      aria-valuetext={`${percent}% used`}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", BAR_TONE[status])}
        style={{ width: `${Math.min(100, Math.max(percent, percent > 0 ? 2 : 0))}%` }}
      />
    </div>
  );
}

/** "80%+" / "Over" beside a budget that needs a look; nothing when it's fine. */
export function BudgetStatusBadge({ status, className }: { status: BudgetStatus; className?: string }) {
  if (status === "ok") return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium",
        status === "over"
          ? "bg-destructive/10 text-destructive dark:bg-destructive/20"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        className,
      )}
    >
      {status === "over" ? "Over" : "80%+"}
    </span>
  );
}

const SCOPE_ICON = { workspace: Layers, profile: UserRound, category: Tag } as const;

/** The budget's emoji when it has one, else an icon for what it covers. */
export function BudgetIcon({ scope, icon }: { scope: BudgetScope; icon: string | null }) {
  if (icon) {
    return (
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base">
        {icon}
      </span>
    );
  }
  const Icon = SCOPE_ICON[scope];
  return (
    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
      <Icon className="size-4 text-muted-foreground" />
    </span>
  );
}

/** "₹4,120 of ₹5,000" and "₹880 left" / "₹600 over". */
export function budgetFigures(
  b: Pick<BudgetItem, "spentMinor" | "amountMinor">,
  currency: string,
  locale: string,
): { used: string; rest: string; over: boolean } {
  const fmt = (minor: number) => formatMoney(minor, currency, locale);
  const left = b.amountMinor - b.spentMinor;
  return {
    used: `${fmt(b.spentMinor)} of ${fmt(b.amountMinor)}`,
    rest: left >= 0 ? `${fmt(left)} left` : `${fmt(-left)} over`,
    over: left < 0,
  };
}

/** One budget as a compact row: icon, name, badge, figures, bar. */
export function BudgetRow({
  budget,
  currency,
  locale,
  action,
}: {
  budget: BudgetItem;
  currency: string;
  locale: string;
  /** Trailing control (the page's Edit button). */
  action?: React.ReactNode;
}) {
  const f = budgetFigures(budget, currency, locale);
  return (
    <div className="flex items-start gap-3">
      <BudgetIcon scope={budget.scope} icon={budget.icon} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{budget.label}</p>
          <BudgetStatusBadge status={budget.status} />
          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
            {budget.percent}%
          </span>
        </div>
        <BudgetBar percent={budget.percent} status={budget.status} label={`${budget.label} budget`} />
        <div className="flex items-center justify-between gap-2 text-xs tabular-nums text-muted-foreground">
          <span>{f.used}</span>
          <span className={cn(f.over && "font-medium text-destructive")}>{f.rest}</span>
        </div>
      </div>
      {action}
    </div>
  );
}
