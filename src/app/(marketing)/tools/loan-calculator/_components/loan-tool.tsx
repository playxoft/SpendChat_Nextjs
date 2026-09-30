"use client";

import { Button } from "@/components/ui/button";
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
} from "@/components/tools/result";
import { useToolCurrency, useToolLocale, useUrlState } from "@/components/tools/tool-state";
import { useToday } from "@/components/tools/use-today";
import { getCurrency, isSupportedCurrency } from "@/lib/currencies";
import { formatAmountInput } from "@/lib/parse-amount";
import { formatDuration } from "@/lib/tools/card-payoff";
import { currencySymbol, formatCurrency, formatPercent, parseNumber } from "@/lib/tools/format";
import {
  LOAN_LIMITS,
  loanPlan,
  monthIndexFromIso,
  type LoanPlan,
  type MonthIndex,
  type Prepayment,
} from "@/lib/tools/loan";
import { cn } from "@/lib/utils";
import { LoanSchedule } from "./loan-schedule";
import { monthLabel } from "./month-label";

/**
 * EMI / loan / mortgage calculator. The three numbers on every loan offer —
 * amount, rate, tenure — are up front; the first payment's month and
 * prepayments, which most people skip, sit under "More options".
 */

// Short, stable keys — they're in every shared link.
const DEFAULTS = {
  a: "1000000", // loan amount
  r: "8.5", // interest rate, % a year
  t: "20", // tenure
  u: "y", // tenure in years (y) or months (m)
  d: "", // first payment date, YYYY-MM-DD; blank = next month
  o: "", // one-time prepayment
  om: "12", // … paid with this payment number
  e: "", // regular prepayment
  ef: "y", // … every month (m) or every year (y)
  x: "t", // prepayments cut the tenure (t) or the EMI (e)
};

const UNIT_OPTIONS = [
  { value: "y", label: "Years" },
  { value: "m", label: "Months" },
] as const;

const EVERY_OPTIONS = [
  { value: "m", label: "Monthly" },
  { value: "y", label: "Yearly" },
] as const;

const MODE_OPTIONS = [
  { value: "t", label: "Reduce tenure" },
  { value: "e", label: "Reduce EMI" },
] as const;

type Read = { value: number | null; error: string | null };

function readAmount(raw: string, locale: string, required: string | null): Read {
  if (!raw.trim()) return required ? { value: null, error: required } : { value: null, error: null };
  const n = parseNumber(raw, locale);
  if (n === null) return { value: null, error: "That doesn't look like a number." };
  if (n < 0) return { value: null, error: "Can't be negative." };
  if (n > LOAN_LIMITS.maxAmount) return { value: null, error: "That's more than this calculator can handle." };
  if (required && n === 0) return { value: null, error: required };
  return { value: n, error: null };
}

function readRate(raw: string, locale: string): Read {
  if (!raw.trim()) return { value: null, error: "Enter the interest rate." };
  const n = parseNumber(raw, locale);
  if (n === null) return { value: null, error: "That doesn't look like a number." };
  if (n < 0 || n > LOAN_LIMITS.maxRate) return { value: null, error: "Use a rate between 0% and 100%." };
  return { value: n, error: null };
}

/** Tenure as whole months, typed in years (decimals allowed) or months. */
function readTenure(raw: string, unit: string, locale: string): Read {
  if (!raw.trim()) return { value: null, error: "Enter how long the loan runs." };
  const n = parseNumber(raw, locale);
  if (n === null) return { value: null, error: "That doesn't look like a number." };
  if (unit === "m" && !Number.isInteger(n)) return { value: null, error: "Use whole months." };
  const months = unit === "m" ? n : Math.round(n * 12);
  if (months < 1) return { value: null, error: "At least 1 month." };
  if (months > LOAN_LIMITS.maxMonths) return { value: null, error: "Up to 50 years (600 months)." };
  return { value: months, error: null };
}

export function LoanTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency] = useToolCurrency();
  const locale = useToolLocale();
  const today = useToday();
  const symbol = currencySymbol(currency, locale);
  const decimals = isSupportedCurrency(currency) ? getCurrency(currency).decimals : 2;
  const money = (v: number) => formatCurrency(v, currency, locale);
  // An amount someone typed reads back as typed: ₹10,00,000, not ₹10,00,000.00.
  const typed = (v: number) => formatCurrency(v, currency, locale, Number.isInteger(v) ? { decimals: 0 } : {});
  const pc = (v: number) => formatPercent(v, locale, 3);

  const unit = s.u === "m" ? "m" : "y";
  const amount = readAmount(s.a, locale, "Enter the loan amount.");
  const rate = readRate(s.r, locale);
  const tenure = readTenure(s.t, unit, locale);
  const months = tenure.value;

  // The month of the first payment: the date picked, or next month. Null on
  // the server (and until hydration), so the static HTML never bakes in a date.
  const todayIndex = today ? monthIndexFromIso(today) : null;
  const start: MonthIndex | null = (s.d ? monthIndexFromIso(s.d) : null) ?? (todayIndex === null ? null : todayIndex + 1);

  const once = readAmount(s.o, locale, null);
  const onceMonthRaw = parseNumber(s.om, locale);
  const onceMonthError =
    once.value && once.value > 0
      ? onceMonthRaw === null || !Number.isInteger(onceMonthRaw) || onceMonthRaw < 1
        ? "Enter the payment number — 1 is the first."
        : months !== null && onceMonthRaw > months
          ? `The loan has ${months} payments — pick one of those.`
          : null
      : null;
  const regular = readAmount(s.e, locale, null);
  const every = s.ef === "m" ? "m" : "y";
  const mode = s.x === "e" ? "emi" : "tenure";

  const prepayments: Prepayment[] = [];
  if (once.value && once.value > 0 && !onceMonthError && onceMonthRaw !== null) {
    prepayments.push({ kind: "once", month: onceMonthRaw, amount: once.value });
  }
  if (regular.value && regular.value > 0) {
    prepayments.push({ kind: every === "m" ? "monthly" : "yearly", amount: regular.value });
  }
  const hasPrepay = prepayments.length > 0;

  const problem =
    (amount.error && `Loan amount: ${amount.error}`) ||
    (rate.error && `Interest rate: ${rate.error}`) ||
    (tenure.error && `Tenure: ${tenure.error}`) ||
    (once.error && `One-time prepayment (in More options): ${once.error}`) ||
    (onceMonthError && `One-time prepayment (in More options): ${onceMonthError}`) ||
    (regular.error && `Regular prepayment (in More options): ${regular.error}`) ||
    null;

  const plan: LoanPlan | null =
    problem || amount.value === null || rate.value === null || months === null
      ? null
      : loanPlan({
          principal: amount.value,
          ratePercent: rate.value,
          months,
          prepayments,
          mode,
          decimals,
        });

  // Without prepayments, show what one extra EMI a year would do — the most
  // common prepayment habit, and the fastest way to see why it's worth it.
  const tip =
    plan && !hasPrepay && rate.value! > 0 && months! >= 24
      ? loanPlan({
          principal: amount.value!,
          ratePercent: rate.value!,
          months: months!,
          prepayments: [{ kind: "yearly", amount: plan.emi }],
          decimals,
        })
      : null;

  const setUnit = (next: string) => {
    if (next === unit) return;
    // Keep the same loan: 20 years becomes 240 months, and back.
    if (months !== null && !tenure.error) {
      set({ u: next, t: formatAmountInput(next === "m" ? months : months / 12, locale, 2) });
    } else {
      set({ u: next });
    }
  };

  const endLabel = (count: number) => (start === null ? null : monthLabel(start + count - 1, locale));

  const prepayParts = [
    prepayments.some((p) => p.kind === "once") ? `${typed(once.value!)} with payment ${onceMonthRaw}` : null,
    regular.value && regular.value > 0 ? `${typed(regular.value)} ${every === "m" ? "a month" : "a year"}` : null,
  ].filter((p): p is string => p !== null);

  let sub = "";
  let copy: string | null = null;
  const rows: { label: string; value: string; strong?: boolean }[] = [];
  // What prepaying does, as the end of a sentence starting "Prepaying …".
  let saves: string | null = null;
  let onceTooLate = false;
  if (plan) {
    const P = amount.value!;
    const last = endLabel(plan.months);
    sub =
      `${typed(P)} at ${pc(rate.value!)} a year, ` +
      (plan.monthsSaved > 0
        ? `paid off in ${formatDuration(plan.months)} instead of ${formatDuration(months!)}`
        : `over ${formatDuration(months!)}`) +
      ` — ${plan.months} monthly ${plan.months === 1 ? "payment" : "payments"}${last ? `, the last in ${last}` : ""}.`;
    rows.push({ label: "Loan amount", value: money(P) });
    if (plan.totalPrepaid > 0) rows.push({ label: "Prepaid", value: money(plan.totalPrepaid) });
    rows.push(
      { label: "Total interest", value: money(plan.totalInterest) },
      { label: "Total paid", value: money(plan.totalPaid), strong: true },
    );

    if (hasPrepay) {
      const effects = [
        plan.monthsSaved > 0 ? `clears the loan ${formatDuration(plan.monthsSaved)} sooner` : null,
        mode === "emi" && plan.lastEmi < plan.emi ? `brings your EMI down to ${money(plan.lastEmi)}` : null,
      ].filter(Boolean);
      if (plan.interestSaved > 0) {
        saves = `saves you ${money(plan.interestSaved)} in interest${effects.length ? ` and ${effects.join(" and ")}` : ""}.`;
      } else if (effects.length) {
        saves = `${effects.join(" and ")}.`;
      }
      const onceP = prepayments.find((p) => p.kind === "once");
      onceTooLate = onceP !== undefined && onceP.month > plan.months;
    }

    const base = plan.baseline;
    copy =
      `A ${typed(P)} loan at ${pc(rate.value!)} a year over ${formatDuration(months!)} has a monthly payment (EMI) of ` +
      `${money(base.emi)}: ${money(base.totalInterest)} in interest, ${money(base.totalPaid)} paid in all.` +
      (saves ? ` Prepaying ${prepayParts.join(" plus ")} ${saves}` : "");
  }

  const optionsSummary = [
    start !== null ? `first payment ${monthLabel(start, locale)}` : null,
    prepayParts.length > 0
      ? `prepay ${prepayParts.join(" + ")} · ${mode === "emi" ? "reduce EMI" : "reduce tenure"}`
      : "add prepayments",
  ]
    .filter(Boolean)
    .join(" · ");

  const onceMonthHint = onceTooLate
    ? "The loan is paid off before then."
    : start !== null && onceMonthRaw !== null && Number.isInteger(onceMonthRaw) && onceMonthRaw >= 1
      ? `With your ${monthLabel(start + onceMonthRaw - 1, locale)} payment.`
      : "1 is your first payment.";

  return (
    <div>
      <ToolLayout>
        <ToolPanel>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Loan amount"
              prefix={symbol}
              value={s.a}
              onChange={(v) => set({ a: v })}
              error={amount.error}
            />
            <NumberField
              label="Interest rate (per year)"
              suffix="%"
              value={s.r}
              onChange={(v) => set({ r: v })}
              error={rate.error}
            />
            <div className="min-w-0 space-y-2">
              <NumberField
                label="Tenure"
                suffix={unit === "m" ? "months" : "years"}
                value={s.t}
                onChange={(v) => set({ t: v })}
                error={tenure.error}
              />
              <ChoiceChips label="In" value={unit} onChange={setUnit} options={UNIT_OPTIONS} />
            </div>
            <CurrencyField />
            <MoreOptions className="sm:col-span-2" summary={optionsSummary} bodyClassName="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <DateField
                  label="First payment"
                  value={s.d}
                  onChange={(v) => set({ d: v })}
                  placeholder="Next month"
                  hint="Only sets the dates in the schedule."
                />
              </div>

              <fieldset className="min-w-0">
                <legend className="mb-3 text-sm font-medium">One-time prepayment</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label="Amount"
                    prefix={symbol}
                    value={s.o}
                    onChange={(v) => set({ o: v })}
                    error={once.error}
                    placeholder="e.g. a bonus"
                  />
                  <NumberField
                    label="With payment number"
                    integer
                    value={s.om}
                    onChange={(v) => set({ om: v })}
                    error={onceMonthError}
                    hint={onceMonthHint}
                  />
                </div>
              </fieldset>

              <fieldset className="min-w-0">
                <legend className="mb-3 text-sm font-medium">Regular prepayment</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label="Amount"
                    prefix={symbol}
                    value={s.e}
                    onChange={(v) => set({ e: v })}
                    error={regular.error}
                    placeholder="0"
                  />
                  <Segmented label="How often" value={every} onChange={(v) => set({ ef: v })} options={EVERY_OPTIONS} />
                </div>
              </fieldset>

              <div>
                <Segmented
                  label="Use prepayments to"
                  className="sm:max-w-sm"
                  value={s.x === "e" ? "e" : "t"}
                  onChange={(v) => set({ x: v })}
                  options={MODE_OPTIONS}
                />
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Reducing the tenure keeps your EMI and ends the loan sooner — it saves the most
                  interest. Reducing the EMI keeps the end date and lowers each payment.
                </p>
              </div>
            </MoreOptions>
          </div>
        </ToolPanel>

        <ToolPanel sticky className="space-y-5">
          {plan ? (
            <>
              <ResultHero
                label={
                  mode === "emi" && plan.lastEmi < plan.emi ? "Monthly payment (EMI) at the start" : "Monthly payment (EMI)"
                }
                value={money(plan.emi)}
                sub={sub}
              />
              <SplitBar principal={amount.value!} interest={plan.totalInterest} locale={locale} />
              <ResultRows rows={rows} />
              {saves && (
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Prepaying {saves}</p>
              )}
              {hasPrepay && plan.totalPrepaid === 0 && (
                <p className="text-sm text-muted-foreground">
                  Your prepayment comes after the loan is paid off, so it changes nothing.
                </p>
              )}
              {tip && tip.monthsSaved > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border bg-muted/40 p-3">
                  <p className="min-w-0 flex-1 basis-56 text-sm leading-relaxed text-muted-foreground">
                    One extra EMI a year would clear it{" "}
                    <strong className="font-medium text-foreground">{formatDuration(tip.monthsSaved)} sooner</strong>{" "}
                    and save <strong className="font-medium text-foreground">{money(tip.interestSaved)}</strong> in
                    interest.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-lg"
                    onClick={() => set({ e: formatAmountInput(plan.emi, locale, decimals), ef: "y" })}
                  >
                    Try it
                  </Button>
                </div>
              )}
            </>
          ) : (
            <ResultEmpty>{problem}</ResultEmpty>
          )}
          <ResultActions copy={copy} onReset={reset} />
        </ToolPanel>
      </ToolLayout>

      <LoanSchedule
        plan={plan}
        start={start}
        currency={currency}
        locale={locale}
        decimals={decimals}
        empty="Fix the inputs above to see the schedule, payment by payment."
      />
    </div>
  );
}

/** Neutral grey for the loan itself; the foreground colour for what it costs. */
const SWATCH = {
  principal: "bg-muted-foreground/40",
  interest: "bg-foreground/75",
};

/** How much of everything repaid is the loan, and how much is interest. */
function SplitBar({ principal, interest, locale }: { principal: number; interest: number; locale: string }) {
  const total = principal + interest;
  if (!(total > 0)) return null;
  const share = (interest / total) * 100;
  const pct = (v: number) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(v / 100);

  return (
    <div>
      <div
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`Principal ${pct(100 - share)} of the total paid, interest ${pct(share)}`}
      >
        {share < 100 && <div className={SWATCH.principal} style={{ width: `${100 - share}%` }} />}
        {share > 0 && <div className={SWATCH.interest} style={{ width: `${share}%` }} />}
      </div>
      <div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground tabular-nums" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", SWATCH.principal)} />
          Principal {pct(100 - share)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", SWATCH.interest)} />
          Interest {pct(share)}
        </span>
      </div>
    </div>
  );
}
