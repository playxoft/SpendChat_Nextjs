import type { Metadata } from "next";
import { Suspense } from "react";
import { getUserSettings, requireUser } from "@/lib/auth";
import {
  getCategoryBreakdown,
  getMonthlyTrend,
  getSummary,
} from "@/lib/queries";
import { parseTxnFilters } from "@/lib/filters";
import { formatDateLabel, monthLabel, monthRange, todayISO } from "@/lib/dates";
import { getTimeZone } from "@/lib/timezone.server";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AnalyticsFilters } from "@/components/app/analytics-filters";
import { AnalyticsResultsSkeleton } from "@/components/app/analytics-skeleton";
import { CategoryPieChart } from "@/components/app/category-pie-chart";
import { PrintButton } from "@/components/app/print-button";

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

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const get = (k: string): string | null => {
    const v = sp[k];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  };

  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  const { currency, locale } = settings;

  const today = todayISO(await getTimeZone());
  const { start, end } = monthRange(today);
  const parsed = parseTxnFilters(get);
  const range = { from: parsed.from ?? start, to: parsed.to ?? end };
  const profileId = parsed.profileId;

  const rangeLabel = `${formatDateLabel(range.from, locale)} – ${formatDateLabel(range.to, locale)}`;
  // Remount the streamed results on any filter change so the skeleton shows
  // immediately instead of holding the previous numbers.
  const streamKey = `${profileId ?? "all"}|${range.from}|${range.to}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">{rangeLabel}</p>
        </div>
        <PrintButton />
      </div>

      <AnalyticsFilters today={today} />

      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">MoneyTracker — Analytics</h2>
        <p className="text-sm">{rangeLabel}</p>
      </div>

      <Suspense key={streamKey} fallback={<AnalyticsResultsSkeleton />}>
        <AnalyticsResults
          userId={user.id}
          from={range.from}
          to={range.to}
          profileId={profileId}
          currency={currency}
          locale={locale}
          today={today}
        />
      </Suspense>
    </div>
  );
}

async function AnalyticsResults({
  userId,
  from,
  to,
  profileId,
  currency,
  locale,
  today,
}: {
  userId: string;
  from: string;
  to: string;
  profileId?: string;
  currency: string;
  locale: string;
  today: string;
}) {
  const filters = { from, to, profileId };
  const months = lastNMonths(6, today);
  const fromISO = `${months[0]}-01`;

  const [summary, breakdown, trendRows] = await Promise.all([
    getSummary(userId, filters),
    getCategoryBreakdown(userId, "expense", filters),
    getMonthlyTrend(userId, fromISO, profileId),
  ]);

  const series = months.map((mm) => ({ month: mm, income: 0, expense: 0 }));
  const idx = new Map(series.map((s, i) => [s.month, i]));
  for (const r of trendRows) {
    const i = idx.get(r.month);
    if (i === undefined) continue;
    if (r.type === "income") series[i].income = r.total;
    else series[i].expense = r.total;
  }
  const maxTrend = Math.max(...series.flatMap((s) => [s.income, s.expense]), 1);

  const pieData = breakdown.map((b) => ({
    name: b.categoryName ?? "Uncategorized",
    value: b.total,
    icon: b.categoryIcon,
  }));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Income" value={formatMoney(summary.income, currency, locale)} positive />
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
          <CardDescription>Expenses for the selected range</CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryPieChart data={pieData} currency={currency} locale={locale} />
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
    </>
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
