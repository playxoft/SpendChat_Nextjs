import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import {
  getCategoryBreakdown,
  getMonthlyTrend,
  getProfiles,
  getSummary,
} from "@/lib/queries";
import { parseTxnFilters, resolveWebProfile } from "@/lib/filters";
import { formatDateLabel, monthKey, monthLabel, monthRange, todayISO } from "@/lib/dates";
import {
  advancedAnalyticsAllowed,
  getWorkspaceEntitlements,
  type WorkspaceEntitlements,
} from "@/lib/entitlements";
import { getAdvancedAnalytics } from "@/lib/insights-queries";
import { buildAdvancedAnalytics, calendarWindow, firstDayOfWeek, monthCount } from "@/lib/insights";
import { describeError, logger } from "@/lib/logger";
import { sampleAdvancedRaw } from "@/lib/insights-sample";
import { listBudgets } from "@/services/budgets";
import { BudgetRow } from "@/components/app/budgets/budget-parts";
import { getTimeZone } from "@/lib/timezone.server";
import { formatMoney } from "@/lib/money";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";
import { AnalyticsFilters } from "@/components/app/analytics-filters";
import { AnalyticsResultsSkeleton } from "@/components/app/analytics-skeleton";
import {
  InsightsSection,
  InsightsSectionSkeleton,
  InsightsUnavailable,
} from "@/components/app/analytics/insights-section";
import { ANALYTICS_SHELL, BODY, WIDGET_GRID, WidgetCard } from "@/components/app/analytics/widget";
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
  const workspace = await getCurrentWorkspace(user.id);
  const [profiles, entitlements] = await Promise.all([
    getProfiles(user.id, workspace.id),
    getWorkspaceEntitlements(workspace.id),
  ]);
  const { currency, locale } = workspace;
  // Plus and Pro: "Insights & trends" with the workspace's numbers. Free: the
  // same section over sample numbers, locked — no transaction is read for it.
  const advanced = advancedAnalyticsAllowed(entitlements);

  const today = todayISO(await getTimeZone());
  const { start, end } = monthRange(today);
  const parsed = parseTxnFilters(get);
  // "All time" (span=all) clears the date bounds; otherwise default to this month.
  const allTime = get("span") === "all";
  const from = allTime ? undefined : (parsed.from ?? start);
  const to = allTime ? undefined : (parsed.to ?? end);
  // Web default: no `?profile=` shows the first profile; "all" is explicit.
  const profileId = resolveWebProfile(get("profile"), profiles[0]?.id);
  const profileName = profileId
    ? (profiles.find((p) => p.id === profileId)?.name ?? "Selected profile")
    : "All profiles";

  const rangeLabel = allTime
    ? "All time"
    : `${formatDateLabel(from ?? start, locale)} – ${formatDateLabel(to ?? end, locale)}`;
  // Remount the streamed results on any filter change so the skeleton shows
  // immediately instead of holding the previous numbers. The insights don't
  // follow the Type filter, so their key leaves it out — changing it doesn't
  // re-run (or blank) them.
  const insightsKey = `${profileId ?? "all"}|${allTime ? "all" : `${from}|${to}`}`;
  const streamKey = `${insightsKey}|${parsed.type ?? "all"}`;
  // Budgets are monthly, so they show when the range is exactly this month.
  const showBudgets = from === start && to === end;
  const window = calendarWindow(today, from, to);

  return (
    <div className={ANALYTICS_SHELL}>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">{rangeLabel}</p>
        </div>
        <PrintButton />
      </div>

      <AnalyticsFilters today={today} locale={locale} />

      {/* Print-only branded report header. */}
      <div className="mb-4 hidden border-b pb-3 print:block">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-heading text-2xl font-bold tracking-tight">{siteConfig.name}</p>
            <p className="text-sm text-muted-foreground">Analytics report</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Workspace:</span> {workspace.name}
            </p>
            <p>
              <span className="font-medium text-foreground">Profile:</span> {profileName}
            </p>
            <p>
              <span className="font-medium text-foreground">Date range:</span> {rangeLabel}
            </p>
          </div>
        </div>
      </div>

      <Suspense
        key={streamKey}
        fallback={
          <AnalyticsResultsSkeleton
            trend={!advanced}
            budgets={showBudgets ? undefined : 0}
            type={parsed.type ?? "expense"}
          />
        }
      >
        <AnalyticsResults
          userId={user.id}
          workspaceId={workspace.id}
          from={from}
          to={to}
          profileId={profileId}
          type={parsed.type}
          currency={currency}
          locale={locale}
          today={today}
          showBudgets={showBudgets}
          showTrend={!advanced}
        />
      </Suspense>

      {advanced ? (
        <Suspense
          key={`insights|${insightsKey}`}
          fallback={<InsightsSectionSkeleton calendarMonths={monthCount(window)} />}
        >
          <AdvancedResults
            userId={user.id}
            workspaceId={workspace.id}
            from={from}
            to={to}
            profileId={profileId}
            currency={currency}
            locale={locale}
            today={today}
            entitlements={entitlements}
            profiles={profiles}
          />
        </Suspense>
      ) : (
        <InsightsSection
          locked
          data={buildAdvancedAnalytics(sampleAdvancedRaw(today, window), {
            today,
            window,
            firstDay: firstDayOfWeek(locale),
            currency,
            locale,
          })}
          currency={currency}
          locale={locale}
        />
      )}

      {/* Print-only marketing footer. */}
      <div className="mt-6 hidden border-t pt-3 text-center text-xs text-muted-foreground print:block">
        <p>{siteConfig.tagline}</p>
        <p>Track your spending at {siteConfig.domain}</p>
      </div>
    </div>
  );
}

/**
 * "Insights & trends" with the workspace's numbers (Plus and Pro), streamed on
 * its own. A failure here is contained: it's logged and the section says it
 * couldn't load, while the overview above — already on screen — stays.
 */
async function AdvancedResults({
  userId,
  workspaceId,
  currency,
  locale,
  entitlements,
  profiles,
  ...opts
}: {
  userId: string;
  workspaceId: string;
  from?: string;
  to?: string;
  profileId?: string;
  currency: string;
  locale: string;
  today: string;
  /** Already read by the page — an RSC render has no request memo to share them. */
  entitlements: WorkspaceEntitlements;
  profiles: Awaited<ReturnType<typeof getProfiles>>;
}) {
  let data;
  try {
    data = await getAdvancedAnalytics(
      userId,
      workspaceId,
      { ...opts, currency, locale },
      { entitlements, profiles },
    );
  } catch (err) {
    unstable_rethrow(err);
    logger.error(`Analytics insights failed to load: ${describeError(err)}`, {
      event: "analytics.insights_failed",
      error: err,
    });
    return <InsightsUnavailable />;
  }
  return <InsightsSection data={data} currency={currency} locale={locale} />;
}

async function AnalyticsResults({
  userId,
  workspaceId,
  from,
  to,
  profileId,
  type,
  currency,
  locale,
  today,
  showBudgets,
  showTrend,
}: {
  userId: string;
  workspaceId: string;
  from?: string;
  to?: string;
  profileId?: string;
  type?: "income" | "expense";
  currency: string;
  locale: string;
  today: string;
  showBudgets: boolean;
  /** The 6-month trend — Free; Plus and Pro get the 12-month cash flow instead. */
  showTrend: boolean;
}) {
  const filters = { from, to, profileId };
  // The Type filter scopes the category breakdown; without it we keep the
  // default expense view. The overview cards and trend stay the full picture.
  const breakdownType = type ?? "expense";
  const months = lastNMonths(6, today);
  const fromISO = `${months[0]}-01`;

  const [summary, breakdown, trendRows, budgets] = await Promise.all([
    getSummary(userId, workspaceId, filters),
    getCategoryBreakdown(userId, workspaceId, breakdownType, filters),
    showTrend ? getMonthlyTrend(userId, workspaceId, fromISO, profileId) : Promise.resolve([]),
    showBudgets ? listBudgets(userId, workspaceId, monthKey(today)) : Promise.resolve([]),
  ]);
  // One profile selected: its own budget. All profiles: every budget the viewer can see.
  const shownBudgets = profileId
    ? budgets.filter((b) => b.scope === "profile" && b.profileId === profileId)
    : budgets;

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

      {shownBudgets.length > 0 && (
        <div className={WIDGET_GRID}>
          <WidgetCard
            span="full"
            title="Budgets this month"
            description={
              <>
                Spending against each monthly limit.{" "}
                <Link href="/app/budgets" className="underline underline-offset-4 print:hidden">
                  Manage budgets
                </Link>
              </>
            }
          >
            <ul className="space-y-4">
              {shownBudgets.map((b) => (
                <li key={b.id}>
                  <BudgetRow budget={b} currency={currency} locale={locale} />
                </li>
              ))}
            </ul>
          </WidgetCard>
        </div>
      )}

      <div className={WIDGET_GRID}>
        <WidgetCard
          span="full"
          title={breakdownType === "income" ? "Income by category" : "Spending by category"}
          description={`${breakdownType === "income" ? "Income" : "Expenses"} for the selected range`}
          bodyClassName={BODY.categories}
        >
          <CategoryPieChart data={pieData} currency={currency} locale={locale} />
        </WidgetCard>

        {showTrend ? (
          <WidgetCard
            span="full"
            title="Last 6 months"
            description="Income vs. expenses"
            bodyClassName={BODY.trend}
          >
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
          </WidgetCard>
        ) : null}
      </div>
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
