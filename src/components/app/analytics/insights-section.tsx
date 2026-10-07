import type * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Lightbulb,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanBadge } from "@/components/app/plan-badge";
import { formatDateLabel, formatDateShort } from "@/lib/dates";
import {
  pctChange,
  shiftMonth,
  percentLabel,
  ratioLabel,
  type AdvancedAnalyticsData,
  type Insight,
} from "@/lib/insights";
import { formatMoney } from "@/lib/money";
import { plansWith } from "@/lib/plan-copy";
import { lowestPlanWith } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { BreakdownTabs } from "./breakdown-tabs";
import { CashFlowChart, CashFlowLegend } from "./cash-flow-chart";
import { InsightsUpgradeButton } from "./locked-body";
import { PaceChart, PaceLegend } from "./pace-chart";
import { Sparkline } from "./sparkline";
import { SpendingCalendar, WeekdayBars } from "./spending-calendar";
import { BODY, SkeletonLine, WIDGET_GRID, WidgetCard, WidgetCardSkeleton } from "./widget";

/**
 * The analytics page's "Insights & trends" — the Plus and Pro section. The
 * same component draws the real section (Plus/Pro, from
 * `getAdvancedAnalytics`) and the locked preview (Free, from sample numbers
 * with each body blurred under a lock), and `InsightsSectionSkeleton` lays out
 * the same cards in the same grid at the same minimum heights.
 *
 * Which filters each card follows is in its description: the profile filter
 * applies everywhere; the date range drives the calendar, unusual spending and
 * the breakdowns; the rest is about *now* and anchored to today.
 */

const LOCKED_HINTS = {
  insights: "Plain-language notes on what changed this month.",
  pace: "See where this month's spending is heading.",
  trends: "See which categories are up or down on usual.",
  cashFlow: "See 12 months of income, spending and savings.",
  calendar: "See which days and weekdays cost the most.",
  recurring: "See the payments that come round every month.",
  anomalies: "Spot entries far above their usual.",
  breakdown: "See your biggest payees, tags and profiles.",
} as const;

export const INSIGHTS_HEADING_ID = "insights-heading";

/** The section's heading — identical in the skeleton, so nothing moves. */
export function InsightsHeader({ locked }: { locked: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", locked && "print:hidden")}>
      <div className="min-w-0">
        <h2 id={INSIGHTS_HEADING_ID} className="flex items-center gap-2 text-lg font-semibold">
          Insights &amp; trends
          {locked ? <PlanBadge plan={lowestPlanWith("advancedAnalytics")} /> : null}
        </h2>
        <p className="text-sm text-muted-foreground">
          Where the month is heading, what&apos;s changed and what repeats.
          {locked ? ` On ${plansWith("advancedAnalytics")}.` : ""}
        </p>
      </div>
      {locked ? <InsightsUpgradeButton /> : null}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

/** A change in spending: up in plain ink, down in the income emerald. */
function Change({ change, className }: { change: number | null; className?: string }) {
  if (change === null) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const pct = Math.round(change * 100);
  if (pct === 0) return <span className={cn("tabular-nums text-muted-foreground", className)}>±0%</span>;
  const up = pct > 0;
  // Past double, a multiple reads better than "2678%".
  const shown = change >= 1 ? ratioLabel(1 + change) : `${Math.abs(pct)}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-0.5 tabular-nums",
        up ? "text-foreground" : "text-emerald-600 dark:text-emerald-400",
        className,
      )}
    >
      {up ? <ArrowUpRight aria-hidden className="size-3.5" /> : <ArrowDownRight aria-hidden className="size-3.5" />}
      <span className="sr-only">{up ? "up" : "down"}</span>
      {shown}
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "income";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "truncate text-lg font-semibold tabular-nums",
          tone === "income" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </dd>
      {sub ? <dd className="text-xs text-muted-foreground">{sub}</dd> : null}
    </div>
  );
}

const TONE_ICON: Record<Insight["tone"], React.ComponentType<{ className?: string }>> = {
  up: TrendingUp,
  down: TrendingDown,
  neutral: Lightbulb,
};

function monthName(month: string, locale: string, opts: Intl.DateTimeFormatOptions) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString(locale, { ...opts, timeZone: "UTC" });
}

export function InsightsSection({
  data,
  currency,
  locale,
  rangeLabel,
  locked = false,
}: {
  data: AdvancedAnalyticsData;
  currency: string;
  locale: string;
  /** The page's range, for the cards that follow it. */
  rangeLabel: string;
  /** Free: sample data under a lock. */
  locked?: boolean;
}) {
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const lock = (key: keyof typeof LOCKED_HINTS) => (locked ? { hint: LOCKED_HINTS[key] } : null);
  const { pace, cashFlow: flow, trends, calendar } = data;
  const windowLabel = `${formatDateLabel(calendar.window.from, locale)} – ${formatDateLabel(calendar.window.to, locale)}`;
  const thisMonth = monthName(pace.month, locale, { month: "long" });
  const methodLine =
    pace.method === "history"
      ? "So far, plus your usual rest of month"
      : pace.method === "pace"
        ? "At your pace so far"
        : "The month ends today";

  return (
    <section aria-labelledby={INSIGHTS_HEADING_ID} className={cn("space-y-4", locked && "print:hidden")}>
      <InsightsHeader locked={locked} />

      <div className={WIDGET_GRID}>
        <WidgetCard
          span="full"
          title="Insights"
          description={`What stands out in ${thisMonth} so far`}
          bodyClassName={BODY.insights}
          locked={lock("insights")}
        >
          {data.insights.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.insights.map((i) => {
                const Icon = TONE_ICON[i.tone];
                return (
                  <li key={i.id} className="flex gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                    <Icon
                      aria-hidden
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        i.tone === "down" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                      )}
                    />
                    <p>{i.text}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>Insights appear once there&apos;s a month or so of spending to compare.</Empty>
          )}
        </WidgetCard>

        <WidgetCard
          title="This month's pace"
          description="Spent so far, and where the month is heading"
          bodyClassName={BODY.pace}
          locked={lock("pace")}
        >
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-4">
              <Stat label="Spent so far" value={money(pace.soFar)} sub={`Day ${pace.day} of ${pace.daysInMonth}`} />
              <Stat label="By month-end" value={money(pace.projected)} sub={methodLine} />
            </dl>
            <div className="space-y-2">
              <PaceLegend />
              <PaceChart points={pace.points} day={pace.day} currency={currency} locale={locale} />
            </div>
            <div className="space-y-1.5 text-sm">
              <p className="text-xs text-muted-foreground">By day {pace.day}, compared with</p>
              <dl className="space-y-1.5">
                {(
                  [
                    ["Last month", pace.lastMonth?.toDate],
                    [
                      pace.usual && pace.usual.months > 1
                        ? `${pace.usual.months}-month average`
                        : "Your usual month",
                      pace.usual?.toDate,
                    ],
                    [monthName(shiftMonth(pace.month, -12), locale, { month: "long", year: "numeric" }), pace.lastYear?.toDate],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto_3.75rem] items-center gap-2">
                    <dt className="truncate text-muted-foreground">{label}</dt>
                    <dd className="tabular-nums">{value === undefined ? "—" : money(value)}</dd>
                    <dd className="text-right text-xs">
                      <Change change={value === undefined ? null : pctChange(pace.soFar, value)} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard
          title="Category trends"
          description="This month so far against your usual by this point"
          bodyClassName={BODY.trends}
          locked={lock("trends")}
        >
          {trends.rows.length ? (
            <ul className="divide-y">
              {trends.rows.map((t) => (
                <li key={t.categoryId ?? "none"} className="flex items-center gap-3 py-2 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {t.icon ? `${t.icon} ` : ""}
                      {t.name}
                    </p>
                    <p className="truncate text-xs tabular-nums text-muted-foreground">
                      {money(t.soFar)} so far
                      {t.usualToDate !== null ? ` · usual ${money(t.usualToDate)}` : ""}
                    </p>
                  </div>
                  <Sparkline values={t.series} className="hidden min-[400px]:block" />
                  <Change change={t.change} className="w-14 shrink-0 text-xs" />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No spending in the last 6 months yet.</Empty>
          )}
          {trends.rows.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Lines show {monthName(trends.months[0], locale, { month: "short" })}–
              {monthName(trends.months[trends.months.length - 1], locale, { month: "short" })}; the dashed end is
              this month so far.
            </p>
          ) : null}
        </WidgetCard>

        <WidgetCard
          span="full"
          title="Cash flow"
          description="Income, spending and what you kept — last 12 months"
          bodyClassName={BODY.cashFlow}
          locked={lock("cashFlow")}
        >
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Income" value={money(flow.income)} tone="income" />
              <Stat label="Spending" value={money(flow.expense)} />
              <Stat label="Kept" value={money(flow.net)} />
              <Stat
                label="Savings rate"
                value={flow.savingsRate === null ? "—" : `${flow.savingsRate < 0 ? "−" : ""}${percentLabel(flow.savingsRate)}`}
                sub="of income kept"
              />
            </dl>
            <div className="space-y-2">
              <CashFlowLegend />
              <CashFlowChart months={flow.months} currency={currency} locale={locale} />
            </div>
            <table className="sr-only">
              <caption>Cash flow by month</caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Income</th>
                  <th scope="col">Spending</th>
                  <th scope="col">Kept</th>
                  <th scope="col">Savings rate</th>
                </tr>
              </thead>
              <tbody>
                {flow.months.map((m) => (
                  <tr key={m.month}>
                    <th scope="row">{monthName(m.month, locale, { month: "long", year: "numeric" })}</th>
                    <td>{money(m.income)}</td>
                    <td>{money(m.expense)}</td>
                    <td>{money(m.net)}</td>
                    <td>{m.savingsRate === null ? "—" : `${m.savingsRate < 0 ? "−" : ""}${percentLabel(m.savingsRate)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WidgetCard>

        <WidgetCard
          span="full"
          title="Spending calendar"
          description={`Daily spending, ${windowLabel}${calendar.window.clamped ? " (the last 12 months of the range)" : ""}`}
          bodyClassName={BODY.calendar}
          locked={lock("calendar")}
        >
          <div className="flex flex-col gap-6 md:flex-row">
            <div className="min-w-0 flex-1">
              <SpendingCalendar
                months={calendar.months}
                firstDay={calendar.firstDay}
                currency={currency}
                locale={locale}
              />
            </div>
            <div className="space-y-2 md:w-56 md:shrink-0">
              <p className="text-xs font-medium text-muted-foreground">Average per weekday</p>
              <WeekdayBars
                weekdays={calendar.weekdays}
                firstDay={calendar.firstDay}
                currency={currency}
                locale={locale}
              />
              <p className="text-xs text-muted-foreground">
                {money(calendar.total)} over {calendar.activeDays}{" "}
                {calendar.activeDays === 1 ? "day" : "days"} with spending.
              </p>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard
          title="Recurring payments"
          description={
            data.recurring.items.length
              ? `Spotted in the last 6 months — about ${money(data.recurring.monthly)} a month`
              : "Spotted in the last 6 months"
          }
          bodyClassName={BODY.recurring}
          locked={lock("recurring")}
        >
          {data.recurring.items.length ? (
            <ul className="divide-y">
              {data.recurring.items.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm"
                    >
                      {r.icon ?? <CalendarClock className="size-4 text-muted-foreground" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm">{r.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Next around {formatDateShort(r.nextDate, locale)} · {r.occurrences} so far
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm tabular-nums">
                    {money(r.typical)}
                    <span className="text-xs text-muted-foreground"> /mo</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Payments that come round every month show up here after about three months.</Empty>
          )}
        </WidgetCard>

        <WidgetCard
          title="Unusual spending"
          description={`Entries far above their category's usual, ${windowLabel}`}
          bodyClassName={BODY.anomalies}
          locked={lock("anomalies")}
        >
          {data.anomalies.length ? (
            <ul className="divide-y">
              {data.anomalies.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{a.title || `${a.icon ? `${a.icon} ` : ""}${a.name}`}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDateShort(a.date, locale)} · {a.name} · usually {money(a.typical)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums">{money(a.amount)}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{ratioLabel(a.ratio)} usual</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing out of the ordinary in this range.</Empty>
          )}
        </WidgetCard>

        <WidgetCard
          span="full"
          title="Where it goes"
          description={`Spending by payee, tag and profile, ${rangeLabel.toLowerCase() === "all time" ? "all time" : rangeLabel}`}
          bodyClassName={BODY.breakdown}
          locked={lock("breakdown")}
        >
          <BreakdownTabs
            payees={data.breakdown.payees}
            tags={data.breakdown.tags}
            profiles={data.breakdown.profiles}
            currency={currency}
            locale={locale}
          />
        </WidgetCard>
      </div>
    </section>
  );
}

/** Placeholder rows for a list body. */
function SkeletonRows({ rows, aside = "w-16" }: { rows: number; aside?: string }) {
  return (
    <div className="divide-y">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-2 first:pt-0">
          <div className="min-w-0 flex-1 space-y-1">
            <SkeletonLine className="w-32 max-w-full" />
            <SkeletonLine className="h-3 w-44 max-w-full" lineClassName="h-4" />
          </div>
          <Skeleton className={cn("h-4 shrink-0", aside)} />
        </div>
      ))}
    </div>
  );
}

/** The section while it streams: the same header, grid, spans and minimum heights. */
export function InsightsSectionSkeleton({ locked = false }: { locked?: boolean }) {
  return (
    <section aria-busy className={cn("space-y-4", locked && "print:hidden")}>
      <InsightsHeader locked={locked} />
      <div className={WIDGET_GRID}>
        <WidgetCardSkeleton span="full" titleWidth="w-20" descriptionWidth="w-52" bodyClassName={BODY.insights}>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[3.25rem] rounded-lg" />
            ))}
          </div>
        </WidgetCardSkeleton>

        <WidgetCardSkeleton titleWidth="w-36" descriptionWidth="w-64" bodyClassName={BODY.pace}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[0, 1].map((i) => (
                <div key={i}>
                  <SkeletonLine className="h-3 w-20" lineClassName="h-4" />
                  <SkeletonLine className="h-5 w-28" lineClassName="h-7" />
                  <SkeletonLine className="h-3 w-24" lineClassName="h-4" />
                </div>
              ))}
            </div>
            <Skeleton className="h-[11.5rem] w-full rounded-lg" />
            <div className="space-y-1.5">
              <SkeletonLine className="h-3 w-36" lineClassName="h-4" />
              {[0, 1, 2].map((i) => (
                <SkeletonLine key={i} className="w-full" />
              ))}
            </div>
          </div>
        </WidgetCardSkeleton>

        <WidgetCardSkeleton titleWidth="w-32" descriptionWidth="w-72" bodyClassName={BODY.trends}>
          <SkeletonRows rows={6} aside="w-28" />
        </WidgetCardSkeleton>

        <WidgetCardSkeleton span="full" titleWidth="w-24" descriptionWidth="w-72" bodyClassName={BODY.cashFlow}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i}>
                  <SkeletonLine className="h-3 w-16" lineClassName="h-4" />
                  <SkeletonLine className="h-5 w-24" lineClassName="h-7" />
                  <SkeletonLine className="h-3 w-20" lineClassName="h-4" />
                </div>
              ))}
            </div>
            <Skeleton className="h-[13.5rem] w-full rounded-lg" />
          </div>
        </WidgetCardSkeleton>

        <WidgetCardSkeleton span="full" titleWidth="w-36" descriptionWidth="w-80" bodyClassName={BODY.calendar}>
          <div className="flex flex-col gap-6 md:flex-row">
            <Skeleton className="h-56 w-full max-w-72 rounded-lg" />
            <div className="hidden flex-1 md:block" />
            <div className="space-y-2 md:w-56 md:shrink-0">
              {Array.from({ length: 7 }, (_, i) => (
                <Skeleton key={i} className="h-3.5 w-full" />
              ))}
            </div>
          </div>
        </WidgetCardSkeleton>

        <WidgetCardSkeleton titleWidth="w-40" descriptionWidth="w-60" bodyClassName={BODY.recurring}>
          <SkeletonRows rows={4} />
        </WidgetCardSkeleton>

        <WidgetCardSkeleton titleWidth="w-36" descriptionWidth="w-72" bodyClassName={BODY.anomalies}>
          <SkeletonRows rows={4} />
        </WidgetCardSkeleton>

        <WidgetCardSkeleton span="full" titleWidth="w-28" descriptionWidth="w-72" bodyClassName={BODY.breakdown}>
          <div className="space-y-3">
            <Skeleton className="h-8 w-52 rounded-lg" />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <SkeletonLine className="w-40 max-w-full" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </WidgetCardSkeleton>
      </div>
    </section>
  );
}
