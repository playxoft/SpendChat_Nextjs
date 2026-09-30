"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ChoiceChips, CurrencyField, NumberField, Segmented } from "@/components/tools/fields";
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
import { formatAmountInput } from "@/lib/parse-amount";
import { EMPTY, currencySymbol, formatCurrency, formatNumber, formatPercent, parseNumber } from "@/lib/tools/format";
import { amountRangeError, readField } from "@/lib/tools/growth";
import {
  FIRE_LIMITS,
  coastPlan,
  durationLabel,
  fireNumber,
  firePlan,
  fireVariants,
  monthAfter,
  spendingMultiple,
  type FireInput,
  type FirePlan,
  type PathRow,
} from "@/lib/tools/fire";
import { cn } from "@/lib/utils";
import type { FireChartRow, FireTarget } from "./fire-chart";
import { LazyFireChart } from "./lazy-fire-chart";

/**
 * FIRE: your FIRE number (spending ÷ withdrawal rate), when you reach it,
 * Coast FIRE, and the Lean / Fat variants — one form, four questions. Every
 * figure is in today's money, because the return is an after-inflation one.
 */

// Short, stable keys — they're in every shared link.
const DEFAULTS = {
  md: "years",
  sp: "40000",
  wr: "4",
  nw: "100000",
  sv: "2500",
  per: "m",
  r: "5",
  age: "30",
  ra: "60",
};

type Mode = "years" | "number" | "coast" | "lean";
type Key = keyof typeof DEFAULTS;

const MODES: { value: Mode; label: string }[] = [
  { value: "years", label: "Years to FIRE" },
  { value: "number", label: "FIRE number" },
  { value: "coast", label: "Coast FIRE" },
  { value: "lean", label: "Lean & Fat" },
];

/** The inputs each question needs; the rest are hidden (and kept in the link). */
const USES: Record<Mode, readonly Key[]> = {
  years: ["sp", "wr", "nw", "sv", "r", "age"],
  number: ["sp", "wr", "nw"],
  coast: ["sp", "wr", "nw", "sv", "r", "age", "ra"],
  lean: ["sp", "wr", "nw", "sv", "r", "age"],
};

/** Withdrawal rates compared in the FIRE-number table. */
const RATE_TABLE = [3, 3.5, 4, 4.5, 5];

const SWATCH = {
  contributed: "bg-muted-foreground/45",
  growth: "bg-emerald-600 dark:bg-emerald-500",
};

function isMode(v: string): v is Mode {
  return MODES.some((m) => m.value === v);
}

export function FireTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency] = useToolCurrency();
  const locale = useToolLocale();
  const today = useToday();
  const symbol = currencySymbol(currency, locale);
  const money = (v: number) => formatCurrency(Math.abs(v) < 0.5 ? 0 : v, currency, locale, { decimals: 0 });
  const pc = (v: number) => formatPercent(v, locale, 2);
  const share = (v: number) => formatPercent(v, locale, v < 10 ? 1 : 0);
  const ageText = (a: number) => formatNumber(Math.floor(a + 1e-9), locale, 0);
  const monthText = (months: number) => {
    if (!today) return null;
    const { year, month } = monthAfter(today, months);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  const mode: Mode = isMode(s.md) ? s.md : "years";
  const uses = (k: Key) => USES[mode].includes(k);
  const yearly = s.per === "y";

  // ---- inputs ------------------------------------------------------------------
  const spend = readField(s.sp, locale, {
    min: 0,
    max: FIRE_LIMITS.maxAmount,
    required: "Enter what you'd spend in a year.",
    range: amountRangeError,
  });
  const spendError = spend.error ?? (spend.value === 0 ? "Enter more than zero." : null);
  const rate = readField(s.wr, locale, {
    min: FIRE_LIMITS.minWithdrawal,
    max: FIRE_LIMITS.maxWithdrawal,
    required: "Enter a withdrawal rate.",
    range: `Use a rate between ${FIRE_LIMITS.minWithdrawal}% and ${FIRE_LIMITS.maxWithdrawal}%.`,
  });
  const invested = readField(s.nw, locale, { min: 0, max: FIRE_LIMITS.maxAmount, blank: 0, range: amountRangeError });
  const saving = readField(s.sv, locale, { min: 0, max: FIRE_LIMITS.maxAmount, blank: 0, range: amountRangeError });
  const ret = readField(s.r, locale, {
    min: FIRE_LIMITS.minReturn,
    max: FIRE_LIMITS.maxReturn,
    required: "Enter an expected return.",
    range: `Use a return between −${-FIRE_LIMITS.minReturn}% and ${FIRE_LIMITS.maxReturn}%.`,
  });
  const age = readField(s.age, locale, {
    min: FIRE_LIMITS.minAge,
    max: FIRE_LIMITS.maxAge,
    required: "Enter your age.",
    range: `Use an age up to ${FIRE_LIMITS.maxAge}.`,
  });
  const retire = readField(s.ra, locale, {
    min: 0,
    max: FIRE_LIMITS.horizonAge,
    required: "Enter the age to reach FIRE by.",
    range: `Use an age up to ${FIRE_LIMITS.horizonAge}.`,
  });
  const retireError =
    retire.error ??
    (retire.value !== null && age.value !== null && retire.value <= age.value
      ? "Make it later than your age today."
      : null);

  const problem =
    (spendError && `Yearly spending: ${spendError}`) ||
    (rate.error && `Withdrawal rate: ${rate.error}`) ||
    (uses("nw") && invested.error && `Invested so far: ${invested.error}`) ||
    (uses("sv") && saving.error && `Saving: ${saving.error}`) ||
    (uses("r") && ret.error && `Expected return: ${ret.error}`) ||
    (uses("age") && age.error && `Your age: ${age.error}`) ||
    (uses("ra") && retireError && `Coast to FIRE by: ${retireError}`) ||
    null;

  const savingValue = saving.value ?? 0;
  const monthly = yearly ? savingValue / 12 : savingValue;
  const savingText = `${money(savingValue)} a ${yearly ? "year" : "month"}`;

  const switchPeriod = (next: string) => {
    if (next === s.per) return;
    // Convert, so switching how it's entered doesn't change the answer.
    const n = parseNumber(s.sv, locale);
    set({ per: next, sv: n === null ? s.sv : formatAmountInput(next === "y" ? n * 12 : n / 12, locale, 2) });
  };

  const input: FireInput | null = problem
    ? null
    : {
        annualSpend: spend.value!,
        withdrawalPercent: rate.value!,
        invested: invested.value ?? 0,
        monthlySaving: monthly,
        returnPercent: ret.value ?? 0,
        age: age.value ?? 0,
      };

  // ---- the answer, per question ------------------------------------------------
  let body: ReactNode = null;
  let copy: string | null = null;
  let below: ReactNode = null;

  /** "age 46 (in 16 years 9 months)", "already there", "not by 100" — for one plan. */
  const reachText = (plan: FirePlan) =>
    plan.months === 0
      ? "already reached"
      : plan.months === null
        ? `not by ${FIRE_LIMITS.horizonAge}`
        : `age ${ageText(plan.fireAge!)}, in ${durationLabel(plan.months)}`;

  const pathRows = (path: PathRow[], startAge: number): FireChartRow[] =>
    path.map((r) => ({ age: startAge + r.months / 12, contributed: r.contributed, growth: r.growth, balance: r.balance }));

  if (input && mode === "years") {
    const plan = firePlan(input);
    const when = plan.months ? monthText(plan.months) : null;
    const end = plan.path.at(-1)!;
    if (plan.months === 0) {
      body = (
        <ResultHero
          label="Your FIRE number"
          value={money(plan.target)}
          sub={`You're already there: ${money(input.invested)} invested covers ${pc(input.withdrawalPercent)} withdrawals of ${money(input.annualSpend)} a year.`}
        />
      );
    } else if (plan.months === null) {
      body = (
        <ResultHero
          label="Years to FIRE"
          value={`Not by ${FIRE_LIMITS.horizonAge}`}
          sub={`At these numbers your investments don't reach your FIRE number of ${money(plan.target)} before age ${FIRE_LIMITS.horizonAge}. Save more, plan to spend less, or check the return — it's after inflation.`}
        />
      );
    } else {
      body = (
        <ResultHero
          label="You could reach FIRE at"
          value={`Age ${ageText(plan.fireAge!)}`}
          sub={`In ${durationLabel(plan.months)}${when ? ` — around ${when}` : ""} — when your investments reach your FIRE number of ${money(plan.target)}.`}
        />
      );
    }
    body = (
      <>
        {body}
        <Progress value={plan.progress} label="Invested so far, of your FIRE number" locale={locale} />
        <ResultRows
          rows={[
            { label: "FIRE number", value: money(plan.target), strong: true },
            { label: "Years to FIRE", value: plan.months === null ? EMPTY : durationLabel(plan.months) },
            ...(plan.months ? [{ label: "FIRE date", value: when ?? EMPTY }] : []),
            ...(plan.months
              ? [
                  { label: "Paid in by then", value: money(end.contributed) },
                  {
                    label: "Growth by then",
                    value:
                      end.growth >= 0.5 ? (
                        <span className="text-emerald-600 dark:text-emerald-400">+{money(end.growth)}</span>
                      ) : (
                        money(end.growth)
                      ),
                  },
                ]
              : []),
          ]}
        />
      </>
    );
    copy =
      `FIRE number: ${money(plan.target)} (spending ${money(input.annualSpend)} a year at a ${pc(input.withdrawalPercent)} withdrawal rate). ` +
      (plan.months === 0
        ? "Already reached."
        : plan.months === null
          ? `Not reached by age ${FIRE_LIMITS.horizonAge} at these numbers.`
          : `With ${money(input.invested)} invested and ${savingText} at ${pc(input.returnPercent)} after inflation, it's reached in ${durationLabel(plan.months)} — at age ${ageText(plan.fireAge!)}.`);
    if (plan.path.length > 1) {
      below = (
        <PathPanel
          title="Your path to FIRE"
          note={
            plan.months === null
              ? `Investing ${savingText} on top of ${money(input.invested)} until age ${FIRE_LIMITS.horizonAge} — it doesn't reach your FIRE number.`
              : `Investing ${savingText} on top of ${money(input.invested)}, at ${pc(input.returnPercent)} a year after inflation, until it reaches your FIRE number.`
          }
          rows={pathRows(plan.path, input.age)}
          targets={[{ label: "FIRE number", value: plan.target }]}
          reference={plan.target}
          currency={currency}
          locale={locale}
          money={money}
          share={share}
        />
      );
    }
  }

  if (input && mode === "number") {
    const target = fireNumber(input.annualSpend, input.withdrawalPercent);
    const multiple = spendingMultiple(input.withdrawalPercent);
    body = (
      <>
        <ResultHero
          label="Your FIRE number"
          value={money(target)}
          sub={`${formatNumber(multiple, locale, 1)}× your yearly spending. At a ${pc(input.withdrawalPercent)} withdrawal rate, ${money(target)} pays out ${money(input.annualSpend)} a year — about ${money(input.annualSpend / 12)} a month.`}
        />
        {input.invested > 0 && (
          <Progress value={(input.invested / target) * 100} label="Invested so far, of your FIRE number" locale={locale} />
        )}
        <ResultRows
          rows={[
            { label: "Yearly spending", value: money(input.annualSpend) },
            { label: "Withdrawal rate", value: pc(input.withdrawalPercent) },
            { label: "Multiple of spending", value: `${formatNumber(multiple, locale, 1)}×` },
            { label: "FIRE number", value: money(target), strong: true },
            { label: "Lean FIRE (70% of spending)", value: money(target * 0.7) },
            { label: "Fat FIRE (150% of spending)", value: money(target * 1.5) },
          ]}
        />
      </>
    );
    copy = `FIRE number: ${money(target)} — ${formatNumber(multiple, locale, 1)}× yearly spending of ${money(input.annualSpend)} at a ${pc(input.withdrawalPercent)} withdrawal rate.`;
    below = (
      <RateTable
        spend={input.annualSpend}
        invested={input.invested}
        current={input.withdrawalPercent}
        locale={locale}
        money={money}
        pc={pc}
        share={share}
      />
    );
  }

  if (input && mode === "coast") {
    const retireAge = retire.value!;
    const c = coastPlan({ ...input, retireAge });
    const stopAge = c.saveMonths !== null ? input.age + c.saveMonths / 12 : null;
    const status: ReactNode = c.reached ? (
      <p className="text-emerald-700 dark:text-emerald-400">
        You&apos;ve reached Coast FIRE. With no more saving, your {money(input.invested)} grows to about{" "}
        {money(c.coastingNow)} by {ageText(retireAge)}
        {c.coastMonths !== null ? ` — past your FIRE number at about ${ageText(input.age + c.coastMonths / 12)}` : ""}.
      </p>
    ) : c.saveMonths !== null && stopAge !== null ? (
      <p>
        You&apos;re {money(c.gap)} short today. Keep saving {savingText} for {durationLabel(c.saveMonths)} — until
        about age {ageText(stopAge)} — and growth alone could take it to your FIRE number by {ageText(retireAge)}.
      </p>
    ) : monthly > 0 ? (
      <p>
        You&apos;re {money(c.gap)} short today, and even saving {savingText} all the way to {ageText(retireAge)}{" "}
        doesn&apos;t reach {money(c.target)}. Save more, reach FIRE later, or plan to spend less.
      </p>
    ) : (
      <p>
        You&apos;re {money(c.gap)} short today. Add what you save each month to see how long until you can stop.
      </p>
    );
    body = (
      <>
        <ResultHero
          label="Your Coast FIRE number"
          value={money(c.coastNumber)}
          sub={`What you need invested today for growth alone — no more saving — to reach your FIRE number of ${money(c.target)} by age ${ageText(retireAge)}, at ${pc(input.returnPercent)} a year after inflation.`}
        />
        <div className="rounded-xl border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">{status}</div>
        <Progress value={c.progress} label="Invested so far, of your Coast FIRE number" locale={locale} />
        <ResultRows
          rows={[
            { label: "FIRE number", value: money(c.target) },
            { label: "Coast FIRE number", value: money(c.coastNumber), strong: true },
            { label: "Invested so far", value: money(input.invested) },
            { label: `At ${ageText(retireAge)} if you stop saving now`, value: money(c.coastingNow) },
          ]}
        />
      </>
    );
    copy =
      `Coast FIRE number: ${money(c.coastNumber)} — invested today, it grows to ${money(c.target)} by age ${ageText(retireAge)} at ${pc(input.returnPercent)} a year after inflation, with no more saving. ` +
      (c.reached
        ? "Already reached."
        : c.saveMonths !== null && stopAge !== null
          ? `Saving ${savingText} gets there by about age ${ageText(stopAge)}.`
          : `${money(c.gap)} to go.`);
    below = (
      <PathPanel
        title="Your Coast FIRE path"
        note={
          c.reached
            ? `No more saving from today — growth alone takes ${money(input.invested)} to about ${money(c.coastingNow)} by ${ageText(retireAge)}.`
            : c.saveMonths !== null && stopAge !== null
              ? `Saving ${savingText} until about age ${ageText(stopAge)}, then no more — growth takes it to your FIRE number by ${ageText(retireAge)}.`
              : `Saving ${savingText} all the way to ${ageText(retireAge)}.`
        }
        rows={pathRows(c.path, input.age)}
        targets={[{ label: "FIRE number", value: c.target }]}
        reference={c.target}
        currency={currency}
        locale={locale}
        money={money}
        share={share}
      />
    );
  }

  if (input && mode === "lean") {
    const variants = fireVariants(input);
    const regular = variants.find((v) => v.id === "regular")!;
    const fat = variants.find((v) => v.id === "fat")!;
    body = (
      <>
        <ResultHero
          label="Your FIRE number"
          value={money(regular.plan.target)}
          sub="Lean FIRE here means living on 70% of your spending, Fat FIRE on 150%. When each is in reach:"
        />
        <ul className="divide-y rounded-xl border">
          {variants.map((v) => (
            <li key={v.id} className="space-y-2 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn("text-sm", v.id === "regular" && "font-medium")}>{v.label}</span>
                <span className="font-semibold tabular-nums">{money(v.plan.target)}</span>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {money(v.annualSpend)} a year · {reachText(v.plan)}
              </p>
              <Bar value={v.plan.progress} label={`${v.label}: invested so far`} locale={locale} />
            </li>
          ))}
        </ul>
      </>
    );
    copy = variants
      .map((v) => `${v.label}: ${money(v.plan.target)} (${reachText(v.plan)})`)
      .join(" · ");
    if (fat.plan.path.length > 1) {
      below = (
        <PathPanel
          title="Your path to Lean, regular and Fat FIRE"
          note={`Investing ${savingText} on top of ${money(input.invested)}, at ${pc(input.returnPercent)} a year after inflation.`}
          rows={pathRows(fat.plan.path, input.age)}
          targets={variants.map((v) => ({ label: v.label, value: v.plan.target }))}
          reference={regular.plan.target}
          currency={currency}
          locale={locale}
          money={money}
          share={share}
        />
      );
    }
  }

  // ---- form ----------------------------------------------------------------------
  const optional = (hidden: boolean) => (hidden ? "hidden" : undefined);

  return (
    <div className="space-y-4 lg:space-y-6">
      <ToolLayout>
        <ToolPanel className="space-y-5">
          <Segmented
            label="Calculate"
            value={mode}
            onChange={(v) => set({ md: v })}
            options={MODES}
            // Keep each choice on one line: they wrap two-by-two on a phone
            // instead of breaking "Years to FIRE" across lines.
            className="[&_label]:min-w-fit [&_label]:whitespace-nowrap"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Yearly spending"
              prefix={symbol}
              value={s.sp}
              onChange={(v) => set({ sp: v })}
              error={spendError}
              hint="What you'd spend in a year once retired, in today's money."
            />
            <NumberField
              label="Withdrawal rate"
              suffix="%"
              value={s.wr}
              onChange={(v) => set({ wr: v })}
              error={rate.error}
              hint="4% is the classic rule; 3–3.5% is more cautious for a long retirement."
            />
            <NumberField
              label={mode === "number" ? "Invested so far (optional)" : "Invested so far"}
              prefix={symbol}
              value={s.nw}
              onChange={(v) => set({ nw: v })}
              error={invested.error}
              hint="Investments you'd live off — not your home."
            />
            <div className={cn("space-y-2", optional(!uses("sv")))}>
              <NumberField
                label={yearly ? "Saved each year" : "Saved each month"}
                prefix={symbol}
                value={s.sv}
                onChange={(v) => set({ sv: v })}
                error={saving.error}
              />
              <ChoiceChips
                label="Enter it"
                value={yearly ? "y" : "m"}
                onChange={switchPeriod}
                options={[
                  { value: "m", label: "per month" },
                  { value: "y", label: "per year" },
                ]}
              />
            </div>
            <NumberField
              className={optional(!uses("r"))}
              label="Expected return, after inflation"
              suffix="% a year"
              value={s.r}
              onChange={(v) => set({ r: v })}
              error={ret.error}
              hint="A 7% return with 2% inflation is about 5%."
            />
            <NumberField
              className={optional(!uses("age"))}
              label="Your age"
              suffix="years"
              value={s.age}
              onChange={(v) => set({ age: v })}
              error={age.error}
            />
            <NumberField
              className={optional(!uses("ra"))}
              label="Coast to FIRE by age"
              suffix="years"
              value={s.ra}
              onChange={(v) => set({ ra: v })}
              error={retireError}
              hint="When you'd stop working anyway — growth has until then."
            />
            <CurrencyField className="sm:col-span-2" />
          </div>
        </ToolPanel>

        <ToolPanel sticky className="space-y-5">
          {input ? body : <ResultEmpty>{problem}</ResultEmpty>}
          <ResultActions copy={copy} onReset={reset} />
        </ToolPanel>
      </ToolLayout>

      {below}
    </div>
  );
}

/** A labelled progress bar: how much of a target is already invested. */
function Progress({ value, label, locale }: { value: number; label: string; locale: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground tabular-nums">{formatPercent(value, locale, value < 10 ? 1 : 0)}</span>
      </div>
      <Bar value={value} label={label} locale={locale} className="mt-1.5" />
    </div>
  );
}

function Bar({ value, label, locale, className }: { value: number; label: string; locale: string; className?: string }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      aria-valuetext={formatPercent(value, locale, 0)}
      className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full", SWATCH.growth)} style={{ width: `${width}%` }} />
    </div>
  );
}

/**
 * The full-width panel under the calculator: the path as a chart, and the same
 * numbers as a table — which is also what crawlers and screen readers get.
 */
function PathPanel({
  title,
  note,
  rows,
  targets,
  reference,
  currency,
  locale,
  money,
  share,
}: {
  title: string;
  note: string;
  rows: FireChartRow[];
  targets: FireTarget[];
  /** The FIRE number the table's last column measures against. */
  reference: number;
  currency: string;
  locale: string;
  money: (v: number) => string;
  share: (v: number) => string;
}) {
  return (
    <ToolPanel as="section">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{note}</p>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-sm", SWATCH.contributed)} />
          Paid in
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-sm", SWATCH.growth)} />
          Growth
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0 w-3 border-t border-dashed border-foreground/70" />
          {targets.length > 1 ? "FIRE numbers" : "FIRE number"}
        </li>
      </ul>

      <div className="mt-3">
        <LazyFireChart rows={rows} targets={targets} currency={currency} locale={locale} />
      </div>

      <details open className="group mt-6 border-t pt-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
          <ChevronDown
            aria-hidden
            className="size-4 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0"
          />
          Year-by-year table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-3 text-left font-medium">
                  Age
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Paid in
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Growth
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Invested
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">
                  Of FIRE number
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.age} className="border-t">
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">
                    {formatNumber(row.age, locale, 1)}
                  </th>
                  <td className="px-3 py-2 text-right">{money(row.contributed)}</td>
                  <td className="px-3 py-2 text-right">{money(row.growth)}</td>
                  <td className="px-3 py-2 text-right font-medium">{money(row.balance)}</td>
                  <td className="py-2 pl-3 text-right text-muted-foreground">
                    {reference > 0 ? share((row.balance / reference) * 100) : EMPTY}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </ToolPanel>
  );
}

/** How the withdrawal rate moves the FIRE number — the one assumption worth testing. */
function RateTable({
  spend,
  invested,
  current,
  locale,
  money,
  pc,
  share,
}: {
  spend: number;
  invested: number;
  current: number;
  locale: string;
  money: (v: number) => string;
  pc: (v: number) => string;
  share: (v: number) => string;
}) {
  const rates = [...new Set([...RATE_TABLE, current])].sort((a, b) => a - b);
  return (
    <ToolPanel as="section">
      <h2 className="text-lg font-semibold tracking-tight">FIRE number by withdrawal rate</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        For {money(spend)} a year. A lower rate asks for a bigger pot, but it&apos;s more likely to last a
        retirement of 40 years or more.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-3 text-left font-medium">
                Withdrawal rate
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Multiple
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                FIRE number
              </th>
              {invested > 0 && (
                <th scope="col" className="py-2 pl-3 text-right font-medium">
                  Invested so far
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => {
              const target = fireNumber(spend, r);
              const mine = r === current;
              return (
                <tr key={r} className={cn("border-t", mine && "font-medium")}>
                  <th scope="row" className={cn("py-2 pr-3 text-left", mine ? "font-medium" : "font-normal text-muted-foreground")}>
                    {pc(r)}
                    {mine && <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-medium">Yours</span>}
                  </th>
                  <td className="px-3 py-2 text-right">{formatNumber(spendingMultiple(r), locale, 1)}×</td>
                  <td className="px-3 py-2 text-right">{money(target)}</td>
                  {invested > 0 && (
                    <td className="py-2 pl-3 text-right text-muted-foreground">{share((invested / target) * 100)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ToolPanel>
  );
}
