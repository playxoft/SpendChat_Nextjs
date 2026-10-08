import type * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CircleAlert,
  Lightbulb,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanBadge } from "@/components/app/plan-badge";
import { formatDateShort } from "@/lib/dates";
import {
  formatRounded,
  pctChange,
  percentLabel,
  ratioLabel,
  shiftMonth,
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
import {
  SpendingCalendar,
  SpendingCalendarSkeleton,
  WeekdayBars,
  WeekdayBarsSkeleton,
} from "./spending-calendar";
import { BODY, SkeletonLine, WIDGET_GRID, WidgetCard, WidgetCardSkeleton } from "./widget";

/**
 * The analytics page's "Insights & trends" — the Plus and Pro section. The
 * same component draws the real section (Plus/Pro, from
 * `getAdvancedAnalytics`) and the locked preview (Free, from sample numbers
 * with each body blurred under a lock), and `InsightsSectionSkeleton` lays out
 * the same cards, with the same headers, in the same grid at the same
 * heights.
 *
 * Which filters each card follows is in its description: the profile filter
 * applies everywhere; the date range drives the calendar, unusual spending and
 * the breakdowns; the rest is about *now* and anchored to today. The
 * descriptions never depend on the data, so the skeleton can show them as
 * they are and the headers can't change height when the data lands.
 */

type CardKey =
  | "insights"
  | "pace"
  | "trends"
  | "cashFlow"
  | "calendar"
  | "recurring"
  | "anomalies"
  | "breakdown";

const CARDS: Record<CardKey, { title: string; description: string; hint: string }> = {
  insights: {
    title: "Insights",
    description: "What stands out this month so far",
    hint: "Plain-language notes on what changed this month.",
  },
  pace: {
    title: "This month's pace",
    description: "Spent so far, and where the month is heading",
    hint: "See where this month's spending is heading.",
  },
  trends: {
    title: "Category trends",
    description: "This month so far against your usual by this point",
    hint: "See which categories are up or down on usual.",
  },
  cashFlow: {
    title: "Cash flow",
    description: "Income, spending and what you kept — last 12 months",
    hint: "See 12 months of income, spending and savings.",
  },
  calendar: {
    title: "Spending calendar",
    description: "Each day's spending in the selected range (12 months at most)",
    hint: "See which days and weekdays cost the most.",
  },
  recurring: {
    title: "Recurring payments",
    description: "Payments that come round every month, from the last 6 months",
    hint: "See the payments that come round every month.",
  },
  anomalies: {
    title: "Unusual spending",
    description: "Entries far above their category's usual, in the selected range",
    hint: "Spot entries far above their usual.",
  },
  breakdown: {
    title: "Where it goes",
    description: "Spending by payee, tag and profile in the selected range",
    hint: "See your biggest payees, tags and profiles.",
  },
};

const card = (key: CardKey) => ({ title: CARDS[key].title, description: CARDS[key].description });

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

// ── Stats ──────────────────────────────────────────────────────────────────

/**
 * A headline figure. Whole currency units and a smaller size on phones, so
 * even "₹1,23,45,678" fits half of a 320px card without being cut off. The
 * line boxes are fixed (`leading-*`, and the sub line's height) so the
 * skeleton's `StatSkeleton` is the same size.
 */
const STAT_VALUE =
  "text-base leading-6 font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-lg sm:leading-7";
const STAT_SUB = { 1: "h-4 truncate", 2: "h-8 line-clamp-2" } as const;

function Stat({
  label,
  value,
  sub,
  subLines,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Lines kept for the sub line, filled or not. */
  subLines?: 1 | 2;
  tone?: "income";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs leading-4 text-muted-foreground">{label}</dt>
      <dd className={cn(STAT_VALUE, tone === "income" && "text-emerald-600 dark:text-emerald-400")}>{value}</dd>
      {subLines ? (
        <dd className={cn("text-xs leading-4 text-muted-foreground", STAT_SUB[subLines])}>{sub}</dd>
      ) : null}
    </div>
  );
}

/** `Stat` while it loads: the real label, a placeholder value, the same sub line box. */
function StatSkeleton({ label, sub, subLines }: { label: string; sub?: string; subLines?: 1 | 2 }) {
  return (
    <div className="min-w-0">
      <p className="text-xs leading-4 text-muted-foreground">{label}</p>
      <SkeletonLine className="h-4 w-24 max-w-full sm:h-5" lineClassName="h-6 sm:h-7" />
      {subLines ? (
        sub ? (
          <p className={cn("text-xs leading-4 text-muted-foreground", STAT_SUB[subLines])}>{sub}</p>
        ) : (
          <div className={cn("flex items-start pt-0.5", STAT_SUB[subLines])}>
            <Skeleton className="h-3 w-20 max-w-full" />
          </div>
        )
      ) : null}
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
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { ...opts, timeZone: "UTC" });
}

// ── Shared card bodies ─────────────────────────────────────────────────────

/** The pace card's stats, chart and comparisons — laid out once for the card and its skeleton. */
function PaceLayout({
  stats,
  chart,
  comparisons,
}: {
  stats: React.ReactNode;
  chart: React.ReactNode;
  comparisons: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-4">{stats}</dl>
      <div className="space-y-2">
        <PaceLegend />
        {chart}
      </div>
      <div className="space-y-1.5 text-sm">{comparisons}</div>
    </div>
  );
}

/** The cash-flow card's stats and chart — laid out once for the card and its skeleton. */
function CashFlowLayout({ stats, chart }: { stats: React.ReactNode; chart: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">{stats}</dl>
      <div className="space-y-2">
        <CashFlowLegend />
        {chart}
      </div>
    </div>
  );
}

/** The calendar card: months on the left (or on top), weekday averages beside them. */
function CalendarLayout({
  calendar,
  weekdays,
  total,
}: {
  calendar: React.ReactNode;
  weekdays: React.ReactNode;
  total: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="min-w-0 flex-1">{calendar}</div>
      <div className="space-y-2 md:w-56 md:shrink-0">
        <p className="text-xs leading-4 font-medium text-muted-foreground">Average per weekday</p>
        {weekdays}
        <div className="h-4 truncate text-xs leading-4 text-muted-foreground">{total}</div>
      </div>
    </div>
  );
}

const COMPARE_ROW = "grid grid-cols-[minmax(0,1fr)_auto_3.75rem] items-center gap-2 leading-5";

// ── The section ────────────────────────────────────────────────────────────

export function InsightsSection({
  data,
  currency,
  locale,
  locked = false,
}: {
  data: AdvancedAnalyticsData;
  currency: string;
  locale: string;
  /** Free: sample data under a lock. */
  locked?: boolean;
}) {
  const money = (minor: number) => formatMoney(minor, currency, locale);
  // Totals and averages in whole units: cents are noise there, and it keeps them on one line.
  const rounded = (minor: number) => formatRounded(minor, currency, locale);
  const lock = (key: CardKey) => (locked ? { hint: CARDS[key].hint } : null);
  const { pace, cashFlow: flow, trends, calendar } = data;
  const methodLine =
    pace.method === "history"
      ? "So far, plus your usual rest of month"
      : pace.method === "pace"
        ? "At your pace so far"
        : pace.method === "early"
          ? "Too early to tell yet"
          : "The month ends today";

  return (
    <section aria-labelledby={INSIGHTS_HEADING_ID} className={cn("space-y-4", locked && "print:hidden")}>
      <InsightsHeader locked={locked} />

      <div className={WIDGET_GRID}>
        <WidgetCard span="full" {...card("insights")} bodyClassName={BODY.insights} locked={lock("insights")}>
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

        <WidgetCard {...card("pace")} bodyClassName={BODY.pace} locked={lock("pace")}>
          <PaceLayout
            stats={
              <>
                <Stat
                  label="Spent so far"
                  value={rounded(pace.soFar)}
                  sub={`Day ${pace.day} of ${pace.daysInMonth}`}
                  subLines={2}
                />
                <Stat
                  label="By month-end"
                  value={pace.projected === null ? "—" : rounded(pace.projected)}
                  sub={methodLine}
                  subLines={2}
                />
              </>
            }
            chart={<PaceChart points={pace.points} day={pace.day} currency={currency} locale={locale} />}
            comparisons={
              <>
                <p className="text-xs leading-4 text-muted-foreground">By day {pace.day}, compared with</p>
                <dl className="space-y-1.5">
                  {(
                    [
                      ["Last month", pace.lastMonth?.toDate],
                      [
                        pace.usual && pace.usual.months > 1 ? `${pace.usual.months}-month average` : "Your usual month",
                        pace.usual?.toDate,
                      ],
                      [
                        monthName(shiftMonth(pace.month, -12), locale, { month: "long", year: "numeric" }),
                        pace.lastYear?.toDate,
                      ],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className={COMPARE_ROW}>
                      <dt className="truncate text-muted-foreground">{label}</dt>
                      <dd className="tabular-nums">{value === undefined ? "—" : rounded(value)}</dd>
                      <dd className="text-right text-xs">
                        <Change change={value === undefined ? null : pctChange(pace.soFar, value)} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            }
          />
        </WidgetCard>

        <WidgetCard {...card("trends")} bodyClassName={BODY.trends} locked={lock("trends")}>
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
                      {rounded(t.soFar)} so far
                      {t.usualToDate !== null ? ` · usual ${rounded(t.usualToDate)}` : ""}
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

        <WidgetCard span="full" {...card("cashFlow")} bodyClassName={BODY.cashFlow} locked={lock("cashFlow")}>
          <CashFlowLayout
            stats={
              <>
                <Stat label="Income" value={rounded(flow.income)} tone="income" />
                <Stat label="Spending" value={rounded(flow.expense)} />
                <Stat label="Kept" value={rounded(flow.net)} />
                <Stat
                  label="Savings rate"
                  value={
                    flow.savingsRate === null
                      ? "—"
                      : `${flow.savingsRate < 0 ? "−" : ""}${percentLabel(flow.savingsRate)}`
                  }
                  sub="of income kept"
                  subLines={1}
                />
              </>
            }
            chart={<CashFlowChart months={flow.months} currency={currency} locale={locale} />}
          />
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
        </WidgetCard>

        <WidgetCard span="full" {...card("calendar")} bodyClassName={BODY.calendar} locked={lock("calendar")}>
          <CalendarLayout
            calendar={
              <SpendingCalendar
                months={calendar.months}
                firstDay={calendar.firstDay}
                currency={currency}
                locale={locale}
              />
            }
            weekdays={
              <WeekdayBars
                weekdays={calendar.weekdays}
                firstDay={calendar.firstDay}
                currency={currency}
                locale={locale}
              />
            }
            total={`${rounded(calendar.total)} on ${calendar.activeDays} ${calendar.activeDays === 1 ? "day" : "days"} with spending`}
          />
        </WidgetCard>

        <WidgetCard {...card("recurring")} bodyClassName={BODY.recurring} locked={lock("recurring")}>
          {data.recurring.items.length ? (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                About {rounded(data.recurring.monthly)} a month in all
              </p>
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
            </>
          ) : (
            <Empty>Payments that come round every month show up here after about three months.</Empty>
          )}
        </WidgetCard>

        <WidgetCard {...card("anomalies")} bodyClassName={BODY.anomalies} locked={lock("anomalies")}>
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

        <WidgetCard span="full" {...card("breakdown")} bodyClassName={BODY.breakdown} locked={lock("breakdown")}>
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

/**
 * The section when its data couldn't be read: the heading and one card saying
 * so, in place of the cards — the rest of the page (the overview above) is
 * unaffected. The page logs the failure.
 */
export function InsightsUnavailable() {
  return (
    <section aria-labelledby={INSIGHTS_HEADING_ID} className="space-y-4 print:hidden">
      <InsightsHeader locked={false} />
      <Card>
        <CardContent className="flex items-start gap-3 text-sm">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>
            Insights couldn&apos;t load just now. Everything above is up to date — reload the page to try
            again.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

/** Placeholder rows for a list body, at the real rows' height. */
function SkeletonRows({ rows, aside = "w-16" }: { rows: number; aside?: string }) {
  return (
    <div className="divide-y">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-2 first:pt-0">
          <div className="min-w-0 flex-1">
            <SkeletonLine className="w-32 max-w-full" />
            <SkeletonLine className="h-3 w-44 max-w-full" lineClassName="h-4" />
          </div>
          <Skeleton className={cn("h-4 shrink-0", aside)} />
        </div>
      ))}
    </div>
  );
}

/**
 * The section while it streams: the same header, grid, spans, card headers
 * and minimum heights, and — where a card's shape doesn't depend on the data —
 * the same body: the pace and cash-flow stats and legends, and the calendar
 * with `calendarMonths` months (from the page's range, `monthCount`).
 */
export function InsightsSectionSkeleton({
  locked = false,
  calendarMonths = 1,
}: {
  locked?: boolean;
  calendarMonths?: number;
}) {
  return (
    <section aria-busy className={cn("space-y-4", locked && "print:hidden")}>
      <InsightsHeader locked={locked} />
      <div className={WIDGET_GRID}>
        <WidgetCardSkeleton span="full" {...card("insights")} bodyClassName={BODY.insights}>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[3.25rem] rounded-lg" />
            ))}
          </div>
        </WidgetCardSkeleton>

        <WidgetCardSkeleton {...card("pace")} bodyClassName={BODY.pace}>
          <PaceLayout
            stats={
              <>
                <StatSkeleton label="Spent so far" subLines={2} />
                <StatSkeleton label="By month-end" subLines={2} />
              </>
            }
            chart={<Skeleton className="h-40 w-full rounded-lg" />}
            comparisons={
              <>
                <SkeletonLine className="h-3 w-36" lineClassName="h-4" />
                <div className="space-y-1.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={COMPARE_ROW}>
                      <SkeletonLine className="w-24 max-w-full" />
                      <Skeleton className="h-3.5 w-16" />
                      <Skeleton className="ml-auto h-3 w-10" />
                    </div>
                  ))}
                </div>
              </>
            }
          />
        </WidgetCardSkeleton>

        <WidgetCardSkeleton {...card("trends")} bodyClassName={BODY.trends}>
          <SkeletonRows rows={6} aside="w-28" />
        </WidgetCardSkeleton>

        <WidgetCardSkeleton span="full" {...card("cashFlow")} bodyClassName={BODY.cashFlow}>
          <CashFlowLayout
            stats={
              <>
                <StatSkeleton label="Income" />
                <StatSkeleton label="Spending" />
                <StatSkeleton label="Kept" />
                <StatSkeleton label="Savings rate" sub="of income kept" subLines={1} />
              </>
            }
            chart={<Skeleton className="h-48 w-full rounded-lg" />}
          />
        </WidgetCardSkeleton>

        <WidgetCardSkeleton span="full" {...card("calendar")} bodyClassName={BODY.calendar}>
          <CalendarLayout
            calendar={<SpendingCalendarSkeleton months={calendarMonths} />}
            weekdays={<WeekdayBarsSkeleton />}
            total={
              <div className="flex h-4 items-center">
                <Skeleton className="h-3 w-40 max-w-full" />
              </div>
            }
          />
        </WidgetCardSkeleton>

        <WidgetCardSkeleton {...card("recurring")} bodyClassName={BODY.recurring}>
          <SkeletonRows rows={4} />
        </WidgetCardSkeleton>

        <WidgetCardSkeleton {...card("anomalies")} bodyClassName={BODY.anomalies}>
          <SkeletonRows rows={4} />
        </WidgetCardSkeleton>

        <WidgetCardSkeleton span="full" {...card("breakdown")} bodyClassName={BODY.breakdown}>
          <div className="space-y-3">
            <Skeleton className="h-8 w-52 rounded-lg" />
            <div className="space-y-2.5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="space-y-1">
                  <SkeletonLine className="w-40 max-w-full" />
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </WidgetCardSkeleton>
      </div>
    </section>
  );
}
