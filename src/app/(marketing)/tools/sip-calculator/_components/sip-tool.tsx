"use client";

import { CurrencyField, MoreOptions, NumberField } from "@/components/tools/fields";
import { GrowthBreakdown, GrowthSplitBar, type GrowthLabels } from "@/components/tools/growth-breakdown";
import {
  ResultActions,
  ResultEmpty,
  ResultHero,
  ResultRows,
  ToolLayout,
  ToolPanel,
  type ResultRow,
} from "@/components/tools/result";
import { useToolCurrency, useToolLocale, useUrlState } from "@/components/tools/tool-state";
import { currencySymbol, formatCurrency, formatNumber, formatPercent } from "@/lib/tools/format";
import { amountRangeError, LIMITS, readField, sipGrowth, yearsToMonths } from "@/lib/tools/growth";

/**
 * SIP / monthly investment calculator. Three inputs answer the usual
 * question; the step-up and inflation that make it an honest plan are one
 * click away under "More options" rather than on separate calculators.
 */

// Short, stable query keys — they're in every shared link.
const DEFAULTS = {
  m: "5000",
  r: "12",
  y: "10",
  su: "",
  inf: "",
};

const LABELS: GrowthLabels = { contributed: "Invested", interest: "Returns", balance: "Value" };

const RATE_RANGE = "Use a rate between −50% and 100%.";

export function SipTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency] = useToolCurrency();
  const locale = useToolLocale();
  const symbol = currencySymbol(currency, locale);
  const money = (v: number) => formatCurrency(Math.abs(v) < 0.5 ? 0 : v, currency, locale, { decimals: 0 });
  const pc = (v: number) => formatPercent(v, locale, 2);

  const monthly = readField(s.m, locale, {
    min: 0,
    max: LIMITS.maxAmount,
    required: "Enter how much you'll invest each month.",
    range: amountRangeError,
  });
  const rate = readField(s.r, locale, {
    min: LIMITS.minRate,
    max: LIMITS.maxRate,
    required: "Enter the return you expect.",
    range: RATE_RANGE,
  });
  const years = readField(s.y, locale, {
    min: LIMITS.minYears,
    max: LIMITS.maxYears,
    required: "Enter how many years.",
    range: `Use between ${LIMITS.minYears} and ${LIMITS.maxYears} years.`,
  });
  const stepUp = readField(s.su, locale, {
    min: 0,
    max: LIMITS.maxRate,
    blank: 0,
    range: "Use a step-up between 0% and 100%.",
  });
  const inflation = readField(s.inf, locale, {
    min: LIMITS.minRate,
    max: LIMITS.maxRate,
    blank: null,
    range: RATE_RANGE,
  });

  // The first problem, worded for the result panel — including one hidden in
  // a collapsed "More options".
  const problem =
    (monthly.error && `Monthly investment: ${monthly.error}`) ||
    (rate.error && `Expected return: ${rate.error}`) ||
    (years.error && `Time period: ${years.error}`) ||
    (stepUp.error && `Annual step-up (in More options): ${stepUp.error}`) ||
    (inflation.error && `Inflation rate (in More options): ${inflation.error}`) ||
    (monthly.value === 0 ? "Enter how much you'll invest each month." : null);

  const result = problem
    ? null
    : sipGrowth({
        monthly: monthly.value!,
        returnPercent: rate.value!,
        years: years.value!,
        stepUpPercent: stepUp.value!,
        inflationPercent: inflation.value,
      });

  const months = result ? yearsToMonths(years.value!) : 0;
  const period = months === 12 ? "1 year" : `${formatNumber(months / 12, locale, 2)} years`;

  let plan = "";
  let sentence: string | null = null;
  const rows: ResultRow[] = [];
  if (result) {
    const m = monthly.value!;
    const su = stepUp.value!;
    const amount = su > 0 ? `${money(m)} a month, raised ${pc(su)} every year,` : `${money(m)} a month`;
    plan = `${amount} for ${period} at ${pc(rate.value!)} a year.`;
    sentence =
      `${amount} for ${period} at ${pc(rate.value!)} a year could grow to about ${money(result.balance)}: ` +
      `${money(result.contributed)} invested and ${money(result.interest)} in estimated returns` +
      (result.real !== null
        ? `, or ${money(result.real)} in today's money at ${pc(inflation.value!)} inflation.`
        : ".");

    rows.push(
      { label: "Amount invested", value: money(result.contributed) },
      {
        label: "Estimated returns",
        value:
          result.interest >= 0.5 ? (
            <span className="text-emerald-600 dark:text-emerald-400">+{money(result.interest)}</span>
          ) : (
            money(result.interest)
          ),
      },
      { label: "Total value", value: money(result.balance), strong: true },
    );
    if (su > 0) {
      // The instalment in the plan's last year, after every step-up.
      rows.push({
        label: "Monthly amount in the final year",
        value: money(m * (1 + su / 100) ** Math.floor((months - 1) / 12)),
      });
    }
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
    stepUp.value ? `${pc(stepUp.value)} yearly step-up` : null,
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
              label="Monthly investment"
              prefix={symbol}
              value={s.m}
              onChange={(v) => set({ m: v })}
              error={monthly.error}
            />
            <NumberField
              label="Expected return (per year)"
              suffix="%"
              value={s.r}
              onChange={(v) => set({ r: v })}
              error={rate.error}
            />
            <NumberField
              label="Time period"
              suffix="years"
              value={s.y}
              onChange={(v) => set({ y: v })}
              error={years.error}
            />
            <CurrencyField />
            <MoreOptions className="sm:col-span-2" summary={optionsSummary || "Step-up, inflation"}>
              <NumberField
                label="Annual step-up"
                suffix="%"
                value={s.su}
                onChange={(v) => set({ su: v })}
                error={stepUp.error}
                hint="Raise the monthly amount by this much each year."
              />
              <NumberField
                label="Inflation rate (per year)"
                suffix="%"
                value={s.inf}
                onChange={(v) => set({ inf: v })}
                error={inflation.error}
                hint="Shows the value in today's money. Leave blank to skip."
              />
            </MoreOptions>
          </div>
        </ToolPanel>

        <ToolPanel sticky className="space-y-5">
          {result ? (
            <>
              <ResultHero
                label={`Estimated value after ${period}`}
                value={money(result.balance)}
                sub={plan}
              />
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
        </ToolPanel>
      </ToolLayout>

      <GrowthBreakdown
        result={result}
        currency={currency}
        locale={locale}
        labels={LABELS}
        filename="sip-schedule.csv"
        empty="Fix the inputs above to see how the investment grows year by year."
      />
    </div>
  );
}
