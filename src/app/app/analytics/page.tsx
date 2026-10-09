import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import {
  getCategoryBreakdown,
  getProfiles,
  getSummary,
} from "@/lib/queries";
import { parseTxnFilters } from "@/lib/filters";
import {
  parseProfileScope,
  resolveProfileScope,
  scopeLabel,
  type ProfileScope,
} from "@/lib/profile-scope";
import { formatDateLabel, monthKey, monthRange, todayISO } from "@/lib/dates";
import {
  advancedAnalyticsAllowed,
  getWorkspaceEntitlements,
  type WorkspaceEntitlements,
} from "@/lib/entitlements";
import { getAdvancedAnalytics } from "@/lib/insights-queries";
import { buildAdvancedAnalytics, calendarWindow, firstDayOfWeek, monthCount } from "@/lib/insights";
import { describeError, logger } from "@/lib/logger";
import { getTrend } from "@/lib/trend.server";
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
import { TrendBody } from "@/components/app/analytics/trend-card";
import { PrintButton } from "@/components/app/print-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

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
  // Web default: no `?profile=` shows the first profile; "all" is explicit; a
  // sidebar selection is expanded against the profiles this viewer can see
  // (and intersected with them again in every query).
  const picked = parseProfileScope(get("profile"));
  const scope = resolveProfileScope(picked, profiles);
  const profileIds = scope.profileIds;
  const profileName = scopeLabel(scope, profiles, Infinity);

  const rangeLabel = allTime
    ? "All time"
    : `${formatDateLabel(from ?? start, locale)} – ${formatDateLabel(to ?? end, locale)}`;
  // Remount the streamed results on any filter change so the skeleton shows
  // immediately instead of holding the previous numbers. The insights don't
  // follow the Type filter, so their key leaves it out: changing Type keeps
  // them on screen instead of blanking them to a skeleton (the server still
  // renders them again with the rest of the page).
  const insightsKey = `${profileIds?.join(",") ?? "all"}|${allTime ? "all" : `${from}|${to}`}`;
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
            kept={advanced}
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
          profileIds={profileIds}
          picked={picked}
          type={parsed.type}
          currency={currency}
          locale={locale}
          today={today}
          showBudgets={showBudgets}
          kept={advanced}
          firstDay={firstDayOfWeek(locale)}
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
            profileIds={profileIds}
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
  /** Profiles in view; undefined = every profile the viewer can see. */
  profileIds?: string[];
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
  profileIds,
  picked,
  type,
  currency,
  locale,
  today,
  showBudgets,
  kept,
  firstDay,
}: {
  userId: string;
  workspaceId: string;
  from?: string;
  to?: string;
  /** Profiles in view; undefined = every profile the viewer can see. */
  profileIds?: string[];
  /** What the sidebar picked — which spaces were picked whole, for their budgets. */
  picked: ProfileScope;
  type?: "income" | "expense";
  currency: string;
  locale: string;
  today: string;
  showBudgets: boolean;
  /** Plus and Pro: the trend adds what was kept and the savings rate (cash flow). */
  kept: boolean;
  firstDay: 0 | 1;
}) {
  const filters = { from, to, profileIds };
  // The Type filter scopes the category breakdown; without it we keep the
  // default expense view. The overview cards and trend stay the full picture.
  const breakdownType = type ?? "expense";

  const [summary, breakdown, trend, budgets] = await Promise.all([
    getSummary(userId, workspaceId, filters),
    getCategoryBreakdown(userId, workspaceId, breakdownType, filters),
    getTrend(userId, workspaceId, { from, to, profileIds, today, firstDay, kept }),
    showBudgets ? listBudgets(userId, workspaceId, monthKey(today)) : Promise.resolve([]),
  ]);
  // All profiles: every budget the viewer can see. One profile or a selection:
  // the budgets of the profiles in view, plus those of spaces picked whole.
  const inView = new Set(profileIds ?? []);
  const pickedSpaces = new Set(
    picked.kind === "pick" ? picked.items.filter((i) => i.kind === "space").map((i) => i.id) : [],
  );
  const shownBudgets = profileIds
    ? budgets.filter(
        (b) =>
          (b.scope === "profile" && b.profileId !== null && inView.has(b.profileId)) ||
          (b.scope === "space" && b.spaceId !== null && pickedSpaces.has(b.spaceId)),
      )
    : budgets;

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

        <WidgetCard
          span="full"
          title="Income vs. expenses"
          description="Money in and out over the selected range"
          bodyClassName={BODY.trend}
        >
          <TrendBody trend={trend} currency={currency} locale={locale} />
        </WidgetCard>
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
