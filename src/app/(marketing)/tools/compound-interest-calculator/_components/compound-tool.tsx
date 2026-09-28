"use client";

import { CurrencyField, MoreOptions, NumberField, Segmented, SelectField } from "@/components/tools/fields";
import { GrowthBreakdown, GrowthSplitBar, type GrowthLabels } from "@/components/tools/growth-breakdown";
import {
  ResultActions,
  ResultEmpty,
  ResultHero,
  ResultRows,
  ToolCta,
  ToolLayout,
  ToolPanel,
  type ResultRow,
} from "@/components/tools/result";
import { useToolCurrency, useToolLocale, useUrlState } from "@/components/tools/tool-state";
import { currencySymbol, formatCurrency, formatNumber, formatPercent } from "@/lib/tools/format";
import {
  amountRangeError,
  compoundInterest,
  LIMITS,
  PERIODS_PER_YEAR,
  readField,
  yearsToMonths,
  type Compounding,
} from "@/lib/tools/growth";

/**
 * Compound interest with a starting lump sum and monthly deposits. The four
 * numbers everyone has are up front; compounding frequency, deposit timing
 * and inflation — which most people leave alone — sit under "More options".
 */

// Short, stable query keys — they're in every shared link.
const DEFAULTS = {
  p: "10000",
  m: "200",
  r: "7",
  y: "10",
  c: "monthly",
  t: "end",
  inf: "",
};

const COMPOUNDING_OPTIONS: { value: Compounding; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half-yearly", label: "Half-yearly" },
  { value: "yearly", label: "Yearly" },
];

const LABELS: GrowthLabels = { contributed: "Contributed", interest: "Interest", balance: "Balance" };

const RATE_RANGE = "Use a rate between −50% and 100%.";

function isCompounding(v: string): v is Compounding {
  return v in PERIODS_PER_YEAR;
}

export function CompoundTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency] = useToolCurrency();
  const locale = useToolLocale();
  const symbol = currencySymbol(currency, locale);
  const money = (v: number) => formatCurrency(Math.abs(v) < 0.5 ? 0 : v, currency, locale, { decimals: 0 });
  const pc = (v: number) => formatPercent(v, locale, 2);

  const principal = readField(s.p, locale, { min: 0, max: LIMITS.maxAmount, blank: 0, range: amountRangeError });
  const monthly = readField(s.m, locale, { min: 0, max: LIMITS.maxAmount, blank: 0, range: amountRangeError });
  const rate = readField(s.r, locale, {
    min: LIMITS.minRate,
    max: LIMITS.maxRate,
    required: "Enter an interest rate.",
    range: RATE_RANGE,
  });
  const years = readField(s.y, locale, {
    min: LIMITS.minYears,
    max: LIMITS.maxYears,
    required: "Enter how many years.",
    range: `Use between ${LIMITS.minYears} and ${LIMITS.maxYears} years.`,
  });
  const inflation = readField(s.inf, locale, {
    min: LIMITS.minRate,
    max: LIMITS.maxRate,
    blank: null,
    range: RATE_RANGE,
  });
  const compounding: Compounding = isCompounding(s.c) ? s.c : "monthly";
  const timing = s.t === "start" ? "start" : "end";

  // The first problem, worded for the result panel — including one hidden in
  // a collapsed "More options".
  const problem =
    (principal.error && `Initial amount: ${principal.error}`) ||
    (monthly.error && `Monthly deposit: ${monthly.error}`) ||
    (rate.error && `Interest rate: ${rate.error}`) ||
    (years.error && `Years: ${years.error}`) ||
    (inflation.error && `Inflation rate (in More options): ${inflation.error}`) ||
    (principal.value === 0 && monthly.value === 0
      ? "Enter an initial amount, a monthly deposit, or both."
      : null);

  const result = problem
    ? null
    : compoundInterest({
        principal: principal.value!,
        monthly: monthly.value!,
        ratePercent: rate.value!,
        years: years.value!,
        compounding,
        timing,
        inflationPercent: inflation.value,
      });

  const freq = COMPOUNDING_OPTIONS.find((o) => o.value === compounding)!.label.toLowerCase();
  const period = result ? yearsLabel(yearsToMonths(years.value!), locale) : "";

  let plan = "";
  let sentence: string | null = null;
  const rows: ResultRow[] = [];
  if (result) {
    const p = principal.value!;
    const m = monthly.value!;
    const paidIn =
      p > 0 && m > 0 ? `${money(p)} plus ${money(m)} a month` : p > 0 ? money(p) : `${money(m)} a month`;
    plan = `${paidIn} at ${pc(rate.value!)} a year, compounded ${freq}.`;
    sentence =
      `${paidIn} at ${pc(rate.value!)} a year (compounded ${freq}) grows to about ${money(result.balance)} ` +
      `in ${period}: ${money(result.contributed)} paid in and ${money(result.interest)} interest` +
      (result.real !== null
        ? `, or ${money(result.real)} in today's money at ${pc(inflation.value!)} inflation.`
        : ".");

    rows.push(
      { label: "Total contributed", value: money(result.contributed) },
      {
        label: "Total interest",
        value:
          result.interest >= 0.5 ? (
            <span className="text-emerald-600 dark:text-emerald-400">+{money(result.interest)}</span>
          ) : (
            money(result.interest)
          ),
      },
      { label: "Final balance", value: money(result.balance), strong: true },
    );
    if (result.real !== null) {
      rows.push({
        label: (
          <>
            In today&apos;s money{" "}
            <span className="text-xs">({pc(inflation.value!)} inflation)</span>
          </>
        ),
        value: money(result.real),
      });
    }
  }

  const optionsSummary = [
    `${COMPOUNDING_OPTIONS.find((o) => o.value === compounding)!.label} compounding`,
    timing === "start" ? "start-of-month deposits" : null,
    inflation.value !== null ? `${pc(inflation.value)} inflation` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <ToolLayout>
        <ToolPanel>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Initial amount"
              prefix={symbol}
              value={s.p}
              onChange={(v) => set({ p: v })}
              error={principal.error}
            />
            <NumberField
              label="Monthly deposit"
              prefix={symbol}
              value={s.m}
              onChange={(v) => set({ m: v })}
              error={monthly.error}
            />
            <NumberField
              label="Interest rate (per year)"
              suffix="%"
              value={s.r}
              onChange={(v) => set({ r: v })}
              error={rate.error}
            />
            <NumberField
              label="Years"
              suffix="years"
              value={s.y}
              onChange={(v) => set({ y: v })}
              error={years.error}
            />
            <CurrencyField className="sm:col-span-2" />
            <MoreOptions className="sm:col-span-2" summary={optionsSummary}>
              <SelectField
                label="Compounding"
                value={compounding}
                onChange={(v) => set({ c: v })}
                options={COMPOUNDING_OPTIONS}
              />
              <NumberField
                label="Inflation rate (per year)"
                suffix="%"
                value={s.inf}
                onChange={(v) => set({ inf: v })}
                error={inflation.error}
                hint="Shows the result in today's money. Leave blank to skip."
              />
              <Segmented
                label="Deposit timing"
                className="sm:col-span-2"
                value={timing}
                onChange={(v) => set({ t: v })}
                options={[
                  { value: "end", label: "End of month" },
                  { value: "start", label: "Start of month" },
                ]}
              />
            </MoreOptions>
          </div>
        </ToolPanel>

        <ToolPanel sticky className="space-y-5">
          {result ? (
            <>
              <ResultHero label={`Balance after ${period}`} value={money(result.balance)} sub={plan} />
              <GrowthSplitBar
                contributed={result.contributed}
                interest={result.interest}
                labels={LABELS}
                locale={locale}
              />
              <ResultRows rows={rows} />
            </>
          ) : (
            <ResultEmpty>{problem}</ResultEmpty>
          )}
          <ResultActions copy={sentence} onReset={reset} />
          <ToolCta slug="compound-interest-calculator" message="Looking for more to save each month?" />
        </ToolPanel>
      </ToolLayout>

      <GrowthBreakdown
        result={result}
        currency={currency}
        locale={locale}
        labels={LABELS}
        filename="compound-interest-schedule.csv"
        empty="Fix the inputs above to see how the balance grows year by year."
      />
    </div>
  );
}

function yearsLabel(months: number, locale: string): string {
  return months === 12 ? "1 year" : `${formatNumber(months / 12, locale, 2)} years`;
}
