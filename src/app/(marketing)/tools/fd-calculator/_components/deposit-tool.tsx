"use client";

import {
  CurrencyField,
  DateField,
  MoreOptions,
  NumberField,
  Segmented,
  SelectField,
} from "@/components/tools/fields";
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
import { useToday } from "@/components/tools/use-today";
import { daysBetween, formatDate, resolveDateInput } from "@/lib/tools/date-math";
import {
  addMonths,
  DEPOSIT_LIMITS,
  fixedDeposit,
  recurringDeposit,
  SHORT_TENURE_MONTHS,
  tenureLabel,
  type DepositCompounding,
} from "@/lib/tools/deposits";
import { currencySymbol, EMPTY, formatCurrency, formatNumber, formatPercent } from "@/lib/tools/format";
import { amountRangeError, readField } from "@/lib/tools/growth";

/**
 * Fixed and recurring deposits, the Indian way by default: quarterly
 * compounding, simple interest under six months, the IBA formula for RDs, and
 * an optional TDS estimate. Works in any currency — the maths is the same
 * wherever a bank compounds quarterly.
 */

// Short, stable query keys — they're in every shared link. FD and RD keep
// their own amount, so flipping between them shows a sensible default for each.
const DEFAULTS = {
  k: "fd", // fd | rd
  a: "100000", // FD deposit
  m: "5000", // RD monthly instalment
  r: "7",
  y: "5",
  mo: "0",
  c: "quarterly",
  d: "today", // start date
  tx: "off", // TDS off | on
  tr: "10", // TDS rate
};

const COMPOUNDING_OPTIONS: { value: DepositCompounding; label: string }[] = [
  { value: "quarterly", label: "Quarterly (Indian banks)" },
  { value: "monthly", label: "Monthly" },
  { value: "half-yearly", label: "Half-yearly" },
  { value: "yearly", label: "Yearly" },
  { value: "simple", label: "None — simple interest" },
];

const FREQ_WORD: Record<DepositCompounding, string> = {
  quarterly: "compounded quarterly",
  monthly: "compounded monthly",
  "half-yearly": "compounded half-yearly",
  yearly: "compounded yearly",
  simple: "simple interest",
};

const LABELS: GrowthLabels = { contributed: "Deposited", interest: "Interest", balance: "Value" };

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isCompounding(v: string): v is DepositCompounding {
  return COMPOUNDING_OPTIONS.some((o) => o.value === v);
}

export function DepositTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency] = useToolCurrency();
  const locale = useToolLocale();
  const today = useToday();
  const symbol = currencySymbol(currency, locale);
  const money = (v: number) => formatCurrency(Math.abs(v) < 0.5 ? 0 : v, currency, locale, { decimals: 0 });
  const pc = (v: number) => formatPercent(v, locale, 2);

  const kind = s.k === "rd" ? "rd" : "fd";
  const compounding: DepositCompounding = isCompounding(s.c) ? s.c : "quarterly";
  const tdsOn = s.tx === "on";

  const amount = readField(kind === "fd" ? s.a : s.m, locale, {
    min: 0,
    max: DEPOSIT_LIMITS.maxAmount,
    required: kind === "fd" ? "Enter the deposit amount." : "Enter the monthly deposit.",
    range: amountRangeError,
  });
  const amountError = amount.value === 0 ? "Enter an amount above 0." : amount.error;
  const rate = readField(s.r, locale, {
    min: 0,
    max: DEPOSIT_LIMITS.maxRate,
    required: "Enter an interest rate.",
    range: `Use a rate between 0% and ${DEPOSIT_LIMITS.maxRate}%.`,
  });
  const years = readField(s.y, locale, { min: 0, max: 50, blank: 0, range: "Use between 0 and 50 years." });
  const monthsRead = readField(s.mo, locale, {
    min: 0,
    max: DEPOSIT_LIMITS.maxMonths,
    blank: 0,
    range: "Use between 0 and 600 months.",
  });
  const monthsError =
    monthsRead.error ?? (monthsRead.value !== null && !Number.isInteger(monthsRead.value) ? "Use whole months." : null);
  const tdsRate = tdsOn
    ? readField(s.tr, locale, { min: 0, max: 100, required: "Enter the TDS rate.", range: "Use a rate between 0% and 100%." })
    : null;

  const totalMonths =
    years.value !== null && monthsRead.value !== null && !monthsError
      ? Math.round(years.value * 12) + monthsRead.value
      : null;

  const amountLabel = kind === "fd" ? "Deposit amount" : "Monthly deposit";
  const problem =
    (amountError && `${amountLabel}: ${amountError}`) ||
    (rate.error && `Interest rate: ${rate.error}`) ||
    (years.error && `Years: ${years.error}`) ||
    (monthsError && `Months: ${monthsError}`) ||
    (tdsRate?.error && `TDS rate (in More options): ${tdsRate.error}`) ||
    (totalMonths !== null && totalMonths < 1 ? "Enter a tenure of at least 1 month." : null) ||
    (totalMonths !== null && totalMonths > DEPOSIT_LIMITS.maxMonths ? "Keep the tenure to 50 years or less." : null);

  const tdsPercent = tdsRate?.value ?? null;
  const result =
    problem || totalMonths === null
      ? null
      : kind === "fd"
        ? fixedDeposit({
            principal: amount.value!,
            ratePercent: rate.value!,
            months: totalMonths,
            compounding,
            tdsPercent,
          })
        : recurringDeposit({
            monthly: amount.value!,
            ratePercent: rate.value!,
            months: totalMonths,
            compounding,
            tdsPercent,
          });

  // Dates: "today" is only known in the browser, so the maturity date fills in after load.
  const start = resolveDateInput(s.d, today);
  const maturity = result && start ? addMonths(start, result.months) : null;

  let plan = "";
  let sentence: string | null = null;
  const rows: ResultRow[] = [];
  if (result) {
    const tenure = tenureLabel(result.months);
    const how = FREQ_WORD[result.compounding];
    const paid = kind === "fd" ? money(amount.value!) : `${money(amount.value!)} a month`;
    plan = `${paid} for ${tenure} at ${pc(rate.value!)} a year, ${how}.`;
    const what = kind === "fd" ? "A fixed deposit" : "A recurring deposit";
    sentence =
      `${what} of ${paid} at ${pc(rate.value!)} for ${tenure} (${how}) matures at ${money(result.balance)}` +
      (maturity ? ` on ${formatDate(maturity, locale, "plain")}` : "") +
      `: ${money(result.contributed)} deposited and ${money(result.interest)} interest.`;

    rows.push(
      { label: "Total deposited", value: money(result.contributed) },
      {
        label: "Interest earned",
        value:
          result.interest >= 0.5 ? (
            <span className="text-emerald-600 dark:text-emerald-400">+{money(result.interest)}</span>
          ) : (
            money(result.interest)
          ),
      },
      { label: "Maturity amount", value: money(result.balance), strong: true },
      { label: "Effective annual yield", value: pc(result.annualYieldPercent) },
      {
        label: "Matures on",
        value: maturity ? (
          <>
            {formatDate(maturity, locale, "short")}
            <span className="block text-xs text-muted-foreground">
              {formatNumber(daysBetween(start!, maturity), locale)} days
            </span>
          </>
        ) : (
          EMPTY
        ),
      },
    );
    if (result.tds !== null && result.afterTds !== null) {
      rows.push(
        {
          label: (
            <>
              TDS <span className="text-xs">({pc(tdsPercent!)} of interest, estimate)</span>
            </>
          ),
          value: `−${money(result.tds)}`,
        },
        { label: "Maturity after TDS", value: money(result.afterTds), strong: true },
      );
    }
  }

  const optionsSummary = [
    compounding === "simple" ? "Simple interest" : `${capitalise(FREQ_WORD[compounding].replace("compounded ", ""))} compounding`,
    tdsOn && tdsRate?.value != null ? `${pc(tdsRate.value)} TDS` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <ToolLayout>
        <ToolPanel>
          <div className="grid gap-4 sm:grid-cols-2">
            <Segmented
              label="Deposit type"
              hideLabel
              className="sm:col-span-2"
              value={kind}
              onChange={(v) => set({ k: v })}
              options={[
                { value: "fd", label: "Fixed deposit" },
                { value: "rd", label: "Recurring deposit" },
              ]}
            />
            {kind === "fd" ? (
              <NumberField
                label={amountLabel}
                prefix={symbol}
                value={s.a}
                onChange={(v) => set({ a: v })}
                error={amountError}
              />
            ) : (
              <NumberField
                label={amountLabel}
                prefix={symbol}
                value={s.m}
                onChange={(v) => set({ m: v })}
                error={amountError}
              />
            )}
            <NumberField
              label="Interest rate (per year)"
              suffix="%"
              value={s.r}
              onChange={(v) => set({ r: v })}
              error={rate.error}
            />
            <div className="grid grid-cols-2 gap-4 sm:col-span-2">
              <NumberField
                label="Years"
                suffix="years"
                value={s.y}
                onChange={(v) => set({ y: v })}
                error={years.error}
              />
              <NumberField
                label="Months"
                suffix="months"
                integer
                value={s.mo}
                onChange={(v) => set({ mo: v })}
                error={monthsError}
              />
            </div>
            <DateField
              label="Start date"
              value={start ?? ""}
              onChange={(v) => set({ d: v })}
              placeholder="Today"
            />
            <CurrencyField />
            <MoreOptions className="sm:col-span-2" summary={optionsSummary}>
              <SelectField
                label="Compounding"
                className="sm:col-span-2"
                value={compounding}
                onChange={(v) => set({ c: v })}
                options={COMPOUNDING_OPTIONS}
                hint={
                  kind === "fd"
                    ? "Deposits under 6 months earn simple interest, whatever you pick — Indian banks don't compound them."
                    : "Recurring deposits in India compound quarterly."
                }
              />
              <Segmented
                label="TDS (India)"
                value={tdsOn ? "on" : "off"}
                onChange={(v) => set({ tx: v })}
                options={[
                  { value: "off", label: "Don't deduct" },
                  { value: "on", label: "Deduct TDS" },
                ]}
              />
              {tdsOn && (
                <NumberField
                  label="TDS rate"
                  suffix="%"
                  value={s.tr}
                  onChange={(v) => set({ tr: v })}
                  error={tdsRate?.error}
                  hint="10% with a PAN, 20% without."
                />
              )}
            </MoreOptions>
          </div>
        </ToolPanel>

        <ToolPanel sticky className="space-y-5">
          {result ? (
            <>
              <ResultHero label="Maturity amount" value={money(result.balance)} sub={plan} />
              <GrowthSplitBar
                contributed={result.contributed}
                interest={result.interest}
                labels={LABELS}
                locale={locale}
              />
              <ResultRows rows={rows} />
              {result.shortTenure && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Under {SHORT_TENURE_MONTHS} months, banks pay simple interest at maturity instead of compounding
                  it, so that&apos;s what&apos;s shown.
                </p>
              )}
              {result.tds !== null && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  TDS is only deducted when one bank&apos;s interest to you passes ₹50,000 in a financial year
                  (₹1 lakh for senior citizens), and it counts towards your income tax.
                </p>
              )}
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
        filename={kind === "fd" ? "fixed-deposit-schedule.csv" : "recurring-deposit-schedule.csv"}
        empty="Fix the inputs above to see how the deposit grows year by year."
      />
    </div>
  );
}
