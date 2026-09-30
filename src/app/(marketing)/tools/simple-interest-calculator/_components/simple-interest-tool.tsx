"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  ChoiceChips,
  CurrencyField,
  DateField,
  MoreOptions,
  NumberField,
  Segmented,
} from "@/components/tools/fields";
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
import { getCurrency, isSupportedCurrency } from "@/lib/currencies";
import { formatAmountInput } from "@/lib/parse-amount";
import { daysBetween, formatDate, resolveDateInput } from "@/lib/tools/date-math";
import {
  compoundedYearly,
  simpleInterest,
  toPeriod,
  type DayBasis,
  type Known,
  type NumberFormatter,
  type SimpleInterestResult,
  type SolveFor,
  type Step,
  type TimeUnit,
} from "@/lib/tools/deposits";
import { currencySymbol, formatCurrency, formatNumber, formatPercent } from "@/lib/tools/format";
import { amountRangeError, readField, type FieldRead } from "@/lib/tools/growth";

/**
 * Simple interest, SI = P × R × T ÷ 100, solved for whichever of the four is
 * missing — with the working written out underneath, because the people who
 * search for this are as often checking homework as checking a loan.
 */

// Short, stable query keys — they're in every shared link. The defaults are
// one scenario seen from every side (10,000 at 7% for 3 years earns 2,100),
// so switching what to solve for shows a consistent answer.
const DEFAULTS = {
  f: "interest", // solve for
  p: "10000",
  r: "7",
  t: "3",
  u: "years", // years | months | days | dates
  s: "2100", // known interest
  a: "12100", // known final amount
  k: "interest", // which one is known
  d1: "today",
  d2: "today+180",
  rp: "year", // rate per year | month
  b: "365", // days in a year
};

type Unit = TimeUnit | "dates";

const SOLVE_OPTIONS: { value: SolveFor; label: string }[] = [
  { value: "interest", label: "Interest" },
  { value: "principal", label: "Principal" },
  { value: "rate", label: "Rate" },
  { value: "time", label: "Time" },
];

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: "years", label: "Years" },
  { value: "months", label: "Months" },
  { value: "days", label: "Days" },
  { value: "dates", label: "Dates" },
];

const UNIT_LIMITS: Record<TimeUnit, number> = { years: 100, months: 1200, days: 36_500 };

const MAX_AMOUNT = 1e12;

function isSolveFor(v: string): v is SolveFor {
  return SOLVE_OPTIONS.some((o) => o.value === v);
}

function isUnit(v: string): v is Unit {
  return UNIT_OPTIONS.some((o) => o.value === v);
}

/** "1 year", "18 months", "90 days" — English plurals by adding "s". */
function countLabel(n: number, unit: TimeUnit, locale: string): string {
  const word = unit.slice(0, -1);
  return `${formatNumber(n, locale, 2)} ${n === 1 ? word : unit}`;
}

/** A money field that must be above zero. */
function readMoney(raw: string, locale: string, required: string): FieldRead {
  const read = readField(raw, locale, { min: 0, max: MAX_AMOUNT, required, range: amountRangeError });
  return read.value === 0 ? { value: null, error: "Enter an amount above 0." } : read;
}

export function SimpleInterestTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency] = useToolCurrency();
  const locale = useToolLocale();
  const today = useToday();
  const symbol = currencySymbol(currency, locale);

  const solveFor: SolveFor = isSolveFor(s.f) ? s.f : "interest";
  const known: Known = s.k === "amount" ? "amount" : "interest";
  const ratePer = s.rp === "month" ? "month" : "year";
  const basis: DayBasis = s.b === "360" ? 360 : 365;
  const rawUnit: Unit = isUnit(s.u) ? s.u : "years";
  // Solving for time, the unit is the answer's — and "between two dates" isn't one.
  const unit: Unit = solveFor === "time" && rawUnit === "dates" ? "days" : rawUnit;

  // Cents only when there are any: "2,100", but "172.60" (and never more than the currency has: ¥173).
  const minorDigits = Math.min(2, isSupportedCurrency(currency) ? getCurrency(currency).decimals : 2);
  const money = (v: number) => {
    const rounded = Math.round(v * 10 ** minorDigits) / 10 ** minorDigits;
    return formatCurrency(rounded, currency, locale, { decimals: Number.isInteger(rounded) ? 0 : minorDigits });
  };
  const pc = (v: number) => formatPercent(v, locale, 4);
  const fmt: NumberFormatter = (v, d) => {
    if (d === 2) {
      const cents = Math.round(v * 100) / 100;
      if (!Number.isInteger(cents)) {
        return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents);
      }
    }
    return formatNumber(v, locale, d);
  };

  // ---- Read only the fields this mode uses --------------------------------
  const needPrincipal = solveFor !== "principal";
  const needRate = solveFor !== "rate";
  const needTime = solveFor !== "time";
  const needKnown = solveFor !== "interest";

  const principal = needPrincipal ? readMoney(s.p, locale, "Enter the principal.") : null;
  const rate = needRate
    ? readField(s.r, locale, {
        min: 0,
        max: 100,
        required: "Enter an interest rate.",
        range: "Use a rate between 0% and 100%.",
      })
    : null;
  const knownField = needKnown
    ? known === "amount"
      ? readMoney(s.a, locale, "Enter the final amount.")
      : readMoney(s.s, locale, "Enter the interest.")
    : null;

  let timeField: FieldRead | null = null;
  let dateProblem: string | null = null;
  let datesPending = false;
  let from: string | null | undefined;
  let to: string | null | undefined;
  let days: number | null = null;
  if (needTime && unit !== "dates") {
    timeField = readField(s.t, locale, {
      min: 0,
      max: UNIT_LIMITS[unit],
      required: "Enter the time.",
      range: `Use between 0 and ${formatNumber(UNIT_LIMITS[unit], locale)} ${unit}.`,
    });
  } else if (needTime) {
    from = resolveDateInput(s.d1, today);
    to = resolveDateInput(s.d2, today);
    if (from === undefined || to === undefined) datesPending = true;
    else if (!from) dateProblem = "Pick the start date.";
    else if (!to) dateProblem = "Pick the end date.";
    else {
      days = daysBetween(from, to);
      if (days <= 0) dateProblem = "The end date has to be after the start date.";
      else if (days > UNIT_LIMITS.days) dateProblem = "Keep the dates within 100 years of each other.";
    }
  }

  const rateLabel = ratePer === "month" ? "Interest rate (per month)" : "Interest rate (per year)";
  const knownLabel = known === "amount" ? "Final amount (principal + interest)" : "Interest earned";

  const problem =
    (principal?.error && `Principal: ${principal.error}`) ||
    (knownField?.error && `${knownLabel}: ${knownField.error}`) ||
    (rate?.error && `Rate: ${rate.error}`) ||
    (timeField?.error && `Time: ${timeField.error}`) ||
    dateProblem ||
    null;

  const period =
    unit === "dates" ? (days !== null ? toPeriod(days, "days", basis) : null) : toPeriod(timeField?.value ?? 1, unit, basis);

  const answer =
    problem || datesPending || !period
      ? null
      : simpleInterest(
          {
            solveFor,
            known,
            principal: principal?.value ?? undefined,
            rate: rate?.value ?? undefined,
            ratePer,
            period,
            interest: known === "interest" ? (knownField?.value ?? undefined) : undefined,
            amount: known === "amount" ? (knownField?.value ?? undefined) : undefined,
          },
          fmt,
        );

  const result: SimpleInterestResult | null = answer?.ok ? answer.result : null;
  const empty = problem ?? (answer && !answer.ok ? answer.error : datesPending ? "Counting the days…" : null);

  // The time, read back in the unit it was asked in.
  const timeUnit: TimeUnit = unit === "dates" ? "days" : unit;
  const perUnit = timeUnit === "years" ? 1 : timeUnit === "months" ? 12 : basis;
  const timeText = result ? countLabel(Math.round(result.years * perUnit * 100) / 100, timeUnit, locale) : "";
  const rateText = result
    ? ratePer === "month"
      ? `${pc(result.ratePercent / 12)} a month`
      : `${pc(result.ratePercent)} a year`
    : "";

  // The working, with the day count first when the time came from two dates.
  const steps: Step[] = answer?.ok ? [...answer.steps] : [];
  if (answer?.ok && unit === "dates" && from && to && days !== null) {
    steps.unshift({
      title: "Count the days (the first day isn't counted, the last one is)",
      lines: [`${formatDate(from, locale, "short")} → ${formatDate(to, locale, "short")} = ${formatNumber(days, locale)} days`],
    });
  }

  // ---- Result panel --------------------------------------------------------
  let hero: { label: string; value: string; sub: string } | null = null;
  let sentence: string | null = null;
  const rows: ResultRow[] = [];
  if (result) {
    const scenario = `${money(result.principal)} at ${rateText} for ${timeText}`;
    switch (solveFor) {
      case "interest":
        hero = { label: "Simple interest", value: money(result.interest), sub: `Total after ${timeText}: ${money(result.amount)}.` };
        sentence = `Simple interest on ${scenario} is ${money(result.interest)}, making ${money(result.amount)} in all.`;
        break;
      case "principal":
        hero = { label: "Principal", value: money(result.principal), sub: `It earns ${money(result.interest)} in ${timeText}.` };
        sentence = `To earn ${money(result.interest)} at ${rateText} in ${timeText}, the principal is ${money(result.principal)}.`;
        break;
      case "rate":
        hero = {
          label: "Interest rate",
          value: rateText,
          sub: ratePer === "month" ? `That's ${pc(result.ratePercent)} a year.` : `That's ${pc(result.ratePercent / 12)} a month.`,
        };
        sentence = `${money(result.principal)} earning ${money(result.interest)} in ${timeText} is a simple interest rate of ${pc(result.ratePercent)} a year.`;
        break;
      case "time": {
        const y = result.years;
        hero = {
          label: "Time",
          value: timeText,
          sub: [
            timeUnit !== "years" ? countLabel(Math.round(y * 100) / 100, "years", locale) : null,
            timeUnit !== "months" ? countLabel(Math.round(y * 12 * 100) / 100, "months", locale) : null,
            timeUnit !== "days" ? countLabel(Math.round(y * basis * 100) / 100, "days", locale) : null,
          ]
            .filter(Boolean)
            .join(" · "),
        };
        sentence = `${money(result.principal)} at ${rateText} takes ${timeText} to earn ${money(result.interest)} in simple interest.`;
        break;
      }
    }

    rows.push(
      { label: "Principal", value: money(result.principal) },
      { label: "Rate", value: rateText },
      { label: "Time", value: timeText },
      {
        label: "Interest",
        value:
          result.interest >= 0.005 ? (
            <span className="text-emerald-600 dark:text-emerald-400">+{money(result.interest)}</span>
          ) : (
            money(result.interest)
          ),
      },
      { label: "Total amount", value: money(result.amount), strong: true },
    );
  }

  // Same money, same rate, compounded once a year.
  let compare: { text: string; href: string | null } | null = null;
  if (result && result.ratePercent > 0 && result.years > 0) {
    const ci = compoundedYearly(result.principal, result.ratePercent, result.years) - result.principal;
    const gap = ci - result.interest;
    const text =
      gap < 0.005
        ? `Compounded yearly at the same rate it would earn the same ${money(ci)} — compounding only pulls ahead after the first year.`
        : `Compounded yearly at the same rate it would earn ${money(ci)} — ${money(gap)} more.`;
    const canLink = result.years >= 1 && result.years <= 100 && result.ratePercent <= 100 && result.principal <= MAX_AMOUNT;
    const fragment = new URLSearchParams({
      p: String(Math.round(result.principal * 100) / 100),
      m: "0",
      r: String(Math.round(result.ratePercent * 10_000) / 10_000),
      y: String(Math.round(result.years * 100) / 100),
      c: "yearly",
    });
    compare = { text, href: canLink ? `/tools/compound-interest-calculator#${fragment}` : null };
  }

  // ---- Switching what to solve for keeps the scenario ---------------------
  const switchMode = (next: string) => {
    if (!result) {
      set({ f: next });
      return;
    }
    const n = (v: number, d: number) => formatAmountInput(v, locale, d);
    const patch: Partial<typeof DEFAULTS> = {
      f: next,
      p: n(result.principal, 2),
      s: n(result.interest, 2),
      a: n(result.amount, 2),
      r: n(ratePer === "month" ? result.ratePercent / 12 : result.ratePercent, 4),
    };
    if (rawUnit !== "dates") patch.t = n(result.years * perUnit, 4);
    else if (solveFor === "time") {
      // "Dates" was answering in days; carry the answer over as a number of days.
      patch.u = "days";
      patch.t = n(result.years * basis, 4);
    }
    set(patch);
  };

  const optionsSummary = [
    ratePer === "month" ? "Rate per month" : null,
    timeUnit === "days" ? `${basis}-day year` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <ToolLayout>
        <ToolPanel>
          <div className="grid gap-4 sm:grid-cols-2">
            <Segmented
              label="Solve for"
              className="sm:col-span-2"
              value={solveFor}
              onChange={switchMode}
              options={SOLVE_OPTIONS}
            />

            {needKnown && (
              <ChoiceChips
                label="You know the"
                className="sm:col-span-2"
                value={known}
                onChange={(v) => set({ k: v })}
                options={[
                  { value: "interest", label: "Interest" },
                  { value: "amount", label: "Final amount" },
                ]}
              />
            )}

            {needPrincipal && (
              <NumberField
                label="Principal"
                prefix={symbol}
                value={s.p}
                onChange={(v) => set({ p: v })}
                error={principal?.error}
              />
            )}
            {needKnown &&
              (known === "amount" ? (
                <NumberField
                  label={knownLabel}
                  prefix={symbol}
                  value={s.a}
                  onChange={(v) => set({ a: v })}
                  error={knownField?.error}
                />
              ) : (
                <NumberField
                  label={knownLabel}
                  prefix={symbol}
                  value={s.s}
                  onChange={(v) => set({ s: v })}
                  error={knownField?.error}
                />
              ))}
            {needRate && (
              <NumberField
                label={rateLabel}
                suffix="%"
                value={s.r}
                onChange={(v) => set({ r: v })}
                error={rate?.error}
              />
            )}

            <Segmented
              label={needTime ? "Time in" : "Answer in"}
              className="sm:col-span-2"
              value={unit}
              onChange={(v) => set({ u: v })}
              options={needTime ? UNIT_OPTIONS : UNIT_OPTIONS.filter((o) => o.value !== "dates")}
            />
            {needTime &&
              (unit === "dates" ? (
                <>
                  <DateField label="From" value={from ?? ""} onChange={(v) => set({ d1: v })} />
                  <DateField label="To" value={to ?? ""} onChange={(v) => set({ d2: v })} />
                </>
              ) : (
                <NumberField
                  label="Time"
                  suffix={unit}
                  value={s.t}
                  onChange={(v) => set({ t: v })}
                  error={timeField?.error}
                />
              ))}

            <CurrencyField className="sm:col-span-2" />
            <MoreOptions className="sm:col-span-2" summary={optionsSummary}>
              <Segmented
                label="Rate is quoted"
                value={ratePer}
                onChange={(v) => set({ rp: v })}
                options={[
                  { value: "year", label: "Per year" },
                  { value: "month", label: "Per month" },
                ]}
              />
              <Segmented
                label="Days in a year"
                value={String(basis)}
                onChange={(v) => set({ b: v })}
                options={[
                  { value: "365", label: "365" },
                  { value: "360", label: "360 (banker's)" },
                ]}
              />
              <p className="text-xs text-muted-foreground sm:col-span-2">
                The day count only matters for a time in days. 365 is the usual rule; some loans use a 360-day
                year, which charges a little more.
              </p>
            </MoreOptions>
          </div>
        </ToolPanel>

        <ToolPanel sticky className="space-y-5">
          {result && hero ? (
            <>
              <ResultHero label={hero.label} value={hero.value} sub={hero.sub} />
              <ResultRows rows={rows} />
              {compare && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {compare.text}{" "}
                  {compare.href && (
                    <Link
                      href={compare.href}
                      className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4"
                    >
                      Compare with compound interest <ArrowRight aria-hidden className="size-3.5" />
                    </Link>
                  )}
                </p>
              )}
            </>
          ) : (
            <ResultEmpty>{empty}</ResultEmpty>
          )}
          <ResultActions copy={sentence} onReset={reset} />
        </ToolPanel>
      </ToolLayout>

      <ToolPanel as="section" className="mt-4 lg:mt-6">
        <h2 className="text-lg font-semibold tracking-tight">Step-by-step working</h2>
        {steps.length > 0 ? (
          <ol className="mt-4 space-y-4">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums text-muted-foreground"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{step.title}</p>
                  <div className="mt-2 overflow-x-auto rounded-xl border bg-muted/40 px-4 py-3 font-mono text-sm leading-relaxed tabular-nums">
                    {step.lines.map((line, j) => (
                      <p key={j} className="whitespace-nowrap">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-4">
            <ResultEmpty>{datesPending ? "Counting the days…" : "Fix the inputs above to see the working."}</ResultEmpty>
          </div>
        )}
      </ToolPanel>
    </div>
  );
}
