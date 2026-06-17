import type { Metadata } from "next";
import { getUserSettings, requireUser } from "@/lib/auth";
import { getCategoryBreakdown, getMonthlyTrend, getSummary } from "@/lib/queries";
import { monthLabel, monthRange, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

function lastNMonths(n: number, today: string): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default async function AnalyticsPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  const { currency, locale } = settings;

  const today = todayISO();
  const { start, end } = monthRange(today);
  const months = lastNMonths(6, today);
  const fromISO = `${months[0]}-01`;

  const [summary, breakdown, trendRows] = await Promise.all([
    getSummary(user.id, { from: start, to: end }),
    getCategoryBreakdown(user.id, "expense", { from: start, to: end }),
    getMonthlyTrend(user.id, fromISO),
  ]);

  const series = months.map((mm) => ({ month: mm, income: 0, expense: 0 }));
  const idx = new Map(series.map((s, i) => [s.month, i]));
  for (const r of trendRows) {
    const i = idx.get(r.month);
    if (i === undefined) continue;
    if (r.type === "income") series[i].income = r.total;
    else series[i].expense = r.total;
  }

  const maxBreak = Math.max(...breakdown.map((b) => b.total), 1);
  const maxTrend = Math.max(...series.flatMap((s) => [s.income, s.expense]), 1);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">{monthLabel(today, locale)} overview</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Income"
          value={formatMoney(summary.income, currency, locale)}
          positive
        />
        <StatCard label="Expenses" value={formatMoney(summary.expense, currency, locale)} />
        <StatCard
          label="Net"
          value={formatMoney(summary.balance, currency, locale)}
          positive={summary.balance >= 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Spending by category</CardTitle>
          <CardDescription>This month&apos;s expenses</CardDescription>
        </CardHeader>
        <CardContent>
          {breakdown.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No expense data for this month yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {breakdown.map((b) => (
                <li key={b.categoryId ?? "none"}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden>{b.categoryIcon ?? "💸"}</span>
                      {b.categoryName ?? "Uncategorized"}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(b.total, currency, locale)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground/70"
                      style={{ width: `${(b.total / maxBreak) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last 6 months</CardTitle>
          <CardDescription>Income vs. expenses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-emerald-500" /> Income
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-foreground/60" /> Expense
            </span>
          </div>
          <ul className="space-y-3">
            {series.map((s) => (
              <li key={s.month} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-xs text-muted-foreground">
                  {monthLabel(`${s.month}-01`, locale)}
                </span>
                <div className="flex-1 space-y-1">
                  <div
                    className="h-2.5 rounded-full bg-emerald-500/70"
                    style={{ width: `${(s.income / maxTrend) * 100}%` }}
                  />
                  <div
                    className="h-2.5 rounded-full bg-foreground/60"
                    style={{ width: `${(s.expense / maxTrend) * 100}%` }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {formatMoney(s.income - s.expense, currency, locale)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          positive ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
