"use client";

import { CurrencyField, MoreOptions, NumberField } from "@/components/tools/fields";
import {
  ResultActions,
  ResultEmpty,
  ResultHero,
  ResultRows,
  ToolLayout,
  ToolPanel,
} from "@/components/tools/result";
import { useToolCurrency, useToolLocale, useUrlState } from "@/components/tools/tool-state";
import { currencySymbol, formatCurrency, formatNumber, formatPercent } from "@/lib/tools/format";
import {
  freelanceRate,
  LIMITS,
  splitShares,
  type FreelanceResult,
  type RateSplit,
} from "@/lib/tools/freelance-rate";
import { amountRangeError, readField } from "@/lib/tools/growth";
import { cn } from "@/lib/utils";

/**
 * The hourly rate that pays for a freelancer's year. The five things everyone
 * can answer are up front; the profit margin and the length of a working day
 * (which only moves the day rate) sit under "More options".
 */

// Short, stable query keys — they're in every shared link.
const DEFAULTS = {
  /** Take-home pay wanted, per year, after tax. */
  p: "60000",
  /** Business expenses per year. */
  e: "6000",
  /** Tax rate on profit, %. */
  x: "25",
  /** Weeks off per year. */
  w: "6",
  /** Billable hours per week. */
  b: "25",
  /** Profit margin, % of revenue. Blank = none. */
  m: "",
  /** Hours in a working day, for the day rate. */
  d: "8",
};

const PERCENT_RANGE = `Use a rate from 0% to ${LIMITS.maxPercent}%.`;

/** Money you keep in emerald, money that goes out in grey — in the bar and the table alike. */
const PARTS: { key: keyof RateSplit; label: string; swatch: string }[] = [
  { key: "takeHome", label: "Take-home", swatch: "bg-emerald-600 dark:bg-emerald-500" },
  { key: "margin", label: "Margin", swatch: "bg-emerald-600/45 dark:bg-emerald-500/45" },
  { key: "tax", label: "Tax", swatch: "bg-muted-foreground/70" },
  { key: "expenses", label: "Expenses", swatch: "bg-muted-foreground/30" },
];

export function FreelanceRateTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency] = useToolCurrency();
  const locale = useToolLocale();
  const symbol = currencySymbol(currency, locale);
  const money = (v: number) => formatCurrency(Math.abs(v) < 0.5 ? 0 : v, currency, locale, { decimals: 0 });
  // The hourly rate keeps the currency's own decimals: it's the figure you quote.
  const rate = (v: number) => formatCurrency(v, currency, locale);
  const pc = (v: number) => formatPercent(v, locale, 2);

  const takeHome = readField(s.p, locale, {
    min: 0,
    max: LIMITS.maxAmount,
    required: "Enter the take-home pay you want.",
    range: amountRangeError,
  });
  const expenses = readField(s.e, locale, { min: 0, max: LIMITS.maxAmount, blank: 0, range: amountRangeError });
  const tax = readField(s.x, locale, { min: 0, max: LIMITS.maxPercent, blank: 0, range: PERCENT_RANGE });
  const weeksOff = readField(s.w, locale, {
    min: 0,
    max: LIMITS.maxWeeksOff,
    blank: 0,
    range: `Use between 0 and ${LIMITS.maxWeeksOff} weeks.`,
  });
  const hours = readField(s.b, locale, {
    min: 1,
    max: LIMITS.maxHoursPerWeek,
    required: "Enter the hours you can bill each week.",
    range: `Use between 1 and ${LIMITS.maxHoursPerWeek} hours.`,
  });
  const margin = readField(s.m, locale, { min: 0, max: LIMITS.maxPercent, blank: 0, range: PERCENT_RANGE });
  const dayHours = readField(s.d, locale, {
    min: 1,
    max: LIMITS.maxHoursPerDay,
    required: "Enter the hours in a working day.",
    range: `Use between 1 and ${LIMITS.maxHoursPerDay} hours.`,
  });

  // The first problem, worded for the result panel — including one hidden in
  // a collapsed "More options".
  const problem =
    (takeHome.error && `Take-home pay: ${takeHome.error}`) ||
    (expenses.error && `Business expenses: ${expenses.error}`) ||
    (tax.error && `Tax rate: ${tax.error}`) ||
    (weeksOff.error && `Weeks off: ${weeksOff.error}`) ||
    (hours.error && `Billable hours: ${hours.error}`) ||
    (margin.error && `Profit margin (in More options): ${margin.error}`) ||
    (dayHours.error && `Hours in a working day (in More options): ${dayHours.error}`) ||
    (tax.value! + margin.value! >= 100
      ? "Tax and profit margin together must be under 100% — otherwise no rate is ever enough."
      : null) ||
    (takeHome.value === 0 && expenses.value === 0
      ? "Enter the take-home pay you want, and your yearly expenses."
      : null);

  const result = problem
    ? null
    : freelanceRate({
        takeHome: takeHome.value!,
        expenses: expenses.value!,
        taxPercent: tax.value!,
        weeksOff: weeksOff.value!,
        hoursPerWeek: hours.value!,
        marginPercent: margin.value!,
        hoursPerDay: dayHours.value!,
      });

  const hoursText = (h: number) => `${formatNumber(h, locale, 2)} ${h === 1 ? "hour" : "hours"}`;
  const weeksText = (w: number) => `${formatNumber(w, locale, 2)} ${w === 1 ? "week" : "weeks"}`;

  let sub = "";
  let copy: string | null = null;
  if (result) {
    const plan =
      `take home ${money(takeHome.value!)} a year after ${pc(tax.value!)} tax` +
      (expenses.value! > 0 ? `, cover ${money(expenses.value!)} of expenses` : "") +
      (margin.value! > 0 ? `, keep a ${pc(margin.value!)} margin` : "") +
      ` and take ${weeksText(weeksOff.value!)} off`;
    sub = `To ${plan}, billing ${hoursText(hours.value!)} a week.`;
    copy =
      `To ${plan}, billing ${hoursText(hours.value!)} a week, charge at least ${rate(result.hourly)} an hour — ` +
      `${money(result.daily)} for a ${formatNumber(result.hoursPerDay, locale, 2)}-hour day, ` +
      `or ${money(result.monthly)} a month.`;
  }

  const optionsSummary = [
    margin.value ? `${pc(margin.value)} margin` : null,
    dayHours.value !== null ? `${formatNumber(dayHours.value, locale, 2)}-hour days` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ToolLayout>
      <ToolPanel>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Take-home pay you want (per year)"
            className="sm:col-span-2"
            prefix={symbol}
            value={s.p}
            onChange={(v) => set({ p: v })}
            error={takeHome.error}
            hint="After tax — what you'd like to live on."
          />
          <NumberField
            label="Business expenses (per year)"
            prefix={symbol}
            value={s.e}
            onChange={(v) => set({ e: v })}
            error={expenses.error}
            hint="Software, equipment, insurance, accountant."
          />
          <NumberField
            label="Tax rate"
            suffix="%"
            value={s.x}
            onChange={(v) => set({ x: v })}
            error={tax.error}
            hint="Your overall rate on profit, all taxes in."
          />
          <NumberField
            label="Weeks off (per year)"
            suffix="weeks"
            value={s.w}
            onChange={(v) => set({ w: v })}
            error={weeksOff.error}
            hint="Holidays, public holidays and sick days."
          />
          <NumberField
            label="Billable hours per week"
            suffix="hours"
            value={s.b}
            onChange={(v) => set({ b: v })}
            error={hours.error}
            hint="Not 40: admin, sales and email aren't billable."
          />
          <CurrencyField className="sm:col-span-2" />
          <MoreOptions className="sm:col-span-2" summary={optionsSummary}>
            <NumberField
              label="Profit margin"
              suffix="%"
              value={s.m}
              onChange={(v) => set({ m: v })}
              error={margin.error}
              placeholder="0"
              hint="A share of every invoice kept for slow months and growth. Blank for none."
            />
            <NumberField
              label="Hours in a working day"
              suffix="hours"
              value={s.d}
              onChange={(v) => set({ d: v })}
              error={dayHours.error}
              hint="What a client gets for your day rate."
            />
          </MoreOptions>
        </div>
      </ToolPanel>

      <ToolPanel sticky className="space-y-5">
        {result ? (
          <>
            <ResultHero label="Minimum hourly rate" value={rate(result.hourly)} sub={sub} />
            <ResultRows
              rows={[
                {
                  label: `Day rate (${hoursText(result.hoursPerDay)})`,
                  value: money(result.daily),
                },
                { label: "Monthly retainer equivalent", value: money(result.monthly) },
                { label: "Revenue needed per year", value: money(result.revenue), strong: true },
                {
                  label: (
                    <>
                      Billable hours per year{" "}
                      <span className="text-xs">({weeksText(result.workingWeeks)} of work)</span>
                    </>
                  ),
                  value: formatNumber(result.billableHours, locale, 1),
                },
              ]}
            />
            <RateSplitTable result={result} rate={rate} money={money} locale={locale} />
          </>
        ) : (
          <ResultEmpty>{problem}</ResultEmpty>
        )}
        <ResultActions copy={copy} onReset={reset} />
      </ToolPanel>
    </ToolLayout>
  );
}

/** Where every hour's rate — and the year's revenue — goes, as a bar and a table. */
function RateSplitTable({
  result,
  rate,
  money,
  locale,
}: {
  result: FreelanceResult;
  rate: (v: number) => string;
  money: (v: number) => string;
  locale: string;
}) {
  const shares = splitShares(result);
  const parts = PARTS.filter((p) => result.split[p.key] > 0);
  if (parts.length === 0) return null;
  const pct = (v: number) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(v / 100);

  return (
    <section aria-labelledby="rate-split" className="space-y-3">
      <h2 id="rate-split" className="text-sm font-medium">
        Where the rate goes
      </h2>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {parts.map((p) => (
          <div key={p.key} className={p.swatch} style={{ width: `${shares[p.key]}%` }} />
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Each hour&apos;s rate and the year&apos;s revenue, split into where it goes</caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 text-left font-medium">
                <span className="sr-only">Part</span>
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Per hour
              </th>
              <th scope="col" className="py-1.5 pl-2 text-right font-medium">
                Per year
              </th>
            </tr>
          </thead>
          <tbody className="divide-y border-t">
            {parts.map((p) => (
              <tr key={p.key}>
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className={cn("size-2.5 shrink-0 rounded-sm", p.swatch)} />
                    {p.label}
                    <span className="text-xs text-muted-foreground">{pct(shares[p.key])}</span>
                  </span>
                </th>
                <td className="px-2 py-2 text-right">{rate(result.split[p.key] / result.billableHours)}</td>
                <td className="py-2 pl-2 text-right text-muted-foreground">{money(result.split[p.key])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <th scope="row" className="py-2 pr-3 text-left">
                Your rate
              </th>
              <td className="px-2 py-2 text-right">{rate(result.hourly)}</td>
              <td className="py-2 pl-2 text-right">{money(result.revenue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
