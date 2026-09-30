"use client";

import type { ReactNode } from "react";
import { Scissors } from "lucide-react";
import { CurrencyField, DateField, MoreOptions, NumberField, Segmented } from "@/components/tools/fields";
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
import { getCurrency } from "@/lib/currencies";
import { regionFromLocale } from "@/lib/geo";
import { addDays, formatDate, resolveDateInput } from "@/lib/tools/date-math";
import { EMPTY, currencySymbol, formatCurrency, formatNumber, formatPercent } from "@/lib/tools/format";
import { amountRangeError, readField } from "@/lib/tools/growth";
import {
  LIMITS,
  cutSuggestion,
  formatMonths,
  monthsFrom,
  periodsUntil,
  savingsNeeded,
  whenCanIAfford,
} from "@/lib/tools/savings-goal";

/**
 * Two questions about one goal: "when can I buy it?" (from what you save each
 * month) and "how much do I need to save?" (to buy it by a date). Price and
 * savings are shared between them, so switching modes keeps what you typed.
 *
 * "Today" is only known in the browser — the page is built ahead of time — so
 * the target month and the date-based mode fill in right after hydration.
 */

// Short, stable query keys — they're in every shared link.
const DEFAULTS = {
  mo: "when", // when | save
  p: "2000", // price
  s: "350", // already saved
  m: "150", // saving each month (when)
  d: "today+365", // buy-by date (save)
  r: "", // interest on savings, % a year (optional)
};

const RATE_RANGE = `Use a rate between ${LIMITS.minRate}% and ${LIMITS.maxRate}%.`;

/** "August 2027" from `YYYY-MM`, in English with the visitor's conventions. */
function monthYear(ym: string, locale: string): string {
  const en = /^en(?:-|$)/i.test(locale);
  const region = en ? null : regionFromLocale(locale);
  const tag = en ? locale : region ? `en-${region}` : "en-US";
  try {
    return new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${ym}-01T00:00:00Z`),
    );
  } catch {
    return ym;
  }
}

export function AffordTool() {
  const [st, set, reset] = useUrlState(DEFAULTS);
  const [currency] = useToolCurrency();
  const locale = useToolLocale();
  const today = useToday();
  const symbol = currencySymbol(currency, locale);
  const minUnit = 10 ** -getCurrency(currency).decimals;
  // Whole amounts without decimals ($2,000), anything else to the cent ($137.50).
  const money = (v: number) =>
    formatCurrency(v, currency, locale, Math.abs(v - Math.round(v)) < 0.005 ? { decimals: 0 } : {});
  const mode = st.mo === "save" ? "save" : "when";

  const priceRead = readField(st.p, locale, {
    min: 0,
    max: LIMITS.maxAmount,
    required: "Enter what it costs.",
    range: amountRangeError,
  });
  const priceError = priceRead.error ?? (priceRead.value === 0 ? "Enter a price above zero." : null);
  const saved = readField(st.s, locale, { min: 0, max: LIMITS.maxAmount, blank: 0, range: amountRangeError });
  const monthly = readField(st.m, locale, { min: 0, max: LIMITS.maxAmount, blank: 0, range: amountRangeError });
  const rate = readField(st.r, locale, { min: LIMITS.minRate, max: LIMITS.maxRate, blank: 0, range: RATE_RANGE });
  const target = resolveDateInput(st.d, today);

  const problem =
    (priceError && `Price: ${priceError}`) ||
    (saved.error && `Already saved: ${saved.error}`) ||
    (mode === "when" && monthly.error && `Saving each month: ${monthly.error}`) ||
    (rate.error && `Interest rate (in More options): ${rate.error}`) ||
    null;

  const price = priceRead.value ?? 0;
  const have = saved.value ?? 0;
  const ratePercent = rate.value ?? 0;
  const rateLabel = formatPercent(ratePercent, locale, 2);

  let body: ReactNode = null;
  let copy: string | null = null;

  // Only rendered once the inputs are valid, so the price is above zero.
  const haveFraction = price > 0 ? have / price : 0;
  const bar = (
    <HaveBar
      fraction={haveFraction}
      label={
        have > 0
          ? `You have ${formatPercent(Math.min(99, Math.max(1, Math.floor(haveFraction * 100))), locale, 0)} of it now`
          : "Nothing saved towards it yet"
      }
    />
  );

  if (problem) {
    body = <ResultEmpty>{problem}</ResultEmpty>;
  } else if (mode === "when") {
    const input = { price, saved: have, monthly: monthly.value ?? 0, ratePercent };
    const r = whenCanIAfford(input);
    if (r.status === "now") {
      body = <AffordableNow have={have} surplus={r.surplus} money={money} />;
      copy = `With ${money(have)} saved, you can already afford ${money(price)}.`;
    } else if (r.status === "never") {
      body = (
        <ResultEmpty>
          With nothing going in each month{ratePercent > 0 ? " and nothing saved to earn interest" : " and no interest"}, you
          won&apos;t get there. Enter how much you can save each month.
        </ResultEmpty>
      );
    } else if (r.status === "too-long") {
      body = <ResultEmpty>At this pace it would take more than 100 years. Try saving more each month.</ResultEmpty>;
    } else {
      const ym = today ? monthsFrom(today, r.months) : null;
      const when = ym ? monthYear(ym, locale) : null;
      const m = input.monthly;
      const pace = m > 0 ? `saving ${money(m)} a month` : `on interest alone at ${rateLabel}`;
      const cut = cutSuggestion(input, minUnit);
      const rows: ResultRow[] = [
        { label: "Target month", value: when ?? EMPTY },
        { label: "Still to save", value: money(price - have) },
        { label: "You'll put in", value: money(m * r.months) },
      ];
      if (ratePercent > 0) {
        rows.push({
          label: "Interest earned",
          value:
            r.interest >= 0.005 ? (
              <span className="text-emerald-600 dark:text-emerald-400">+{money(r.interest)}</span>
            ) : (
              money(0)
            ),
        });
      }
      rows.push({ label: "You'll have then", value: money(r.balance), strong: true });
      body = (
        <>
          <ResultHero
            label="You can buy it in"
            value={formatMonths(r.months)}
            sub={when ? `In ${when}, ${pace}.` : `${pace[0]!.toUpperCase()}${pace.slice(1)}.`}
          />
          {bar}
          <ResultRows rows={rows} />
          {cut && (
            <p className="flex gap-3 rounded-xl bg-muted/60 px-4 py-3 text-sm leading-relaxed">
              <Scissors aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                Cut <strong className="font-semibold">{money(cut.weeklyCut)} a week</strong> from your spending and
                you&apos;d get there about{" "}
                <strong className="font-semibold">
                  {cut.weeksSooner} {cut.weeksSooner === 1 ? "week" : "weeks"} sooner
                </strong>
                .
              </span>
            </p>
          )}
        </>
      );
      copy =
        (m > 0
          ? `Saving ${money(m)} a month on top of ${money(have)} already saved`
          : `With ${money(have)} saved and nothing more going in`) +
        (ratePercent > 0 ? ` (at ${rateLabel} interest)` : "") +
        `, I can afford ${money(price)} in ${formatMonths(r.months)}${when ? ` — by ${when}` : ""}.`;
    }
  } else if (target === undefined || today === null) {
    // "Today" arrives straight after hydration; until then there's nothing to count from.
    body = <PendingResult />;
  } else if (target === null) {
    body = <ResultEmpty>Pick the date you want to buy it by.</ResultEmpty>;
  } else {
    const periods = periodsUntil(today, target);
    if (!periods) {
      body = <ResultEmpty>Pick a date after today.</ResultEmpty>;
    } else {
      const r = savingsNeeded({ price, saved: have, ratePercent, periods });
      const by = formatDate(target, locale, "plain");
      if (r.status === "now") {
        body = <AffordableNow have={have} surplus={r.surplus} money={money} />;
        copy = `With ${money(have)} saved, you can already afford ${money(price)}.`;
      } else {
        const weeksText = `${formatNumber(periods.weeks, locale)} ${periods.weeks === 1 ? "week" : "weeks"}`;
        let hero: { label: string; value: string; sub: string };
        if (r.grows) {
          hero = {
            label: "Save each month",
            value: money(0),
            sub: `Interest on the ${money(have)} you have grows it to ${money(price)} by ${by}.`,
          };
        } else if (r.monthly !== null) {
          hero = {
            label: "Save each month",
            value: money(r.monthly),
            sub: `For ${formatMonths(periods.months)}, to have ${money(price)} by ${by}.`,
          };
        } else if (r.weekly !== null) {
          hero = {
            label: "Save each week",
            value: money(r.weekly),
            sub: `For ${weeksText} — ${by} is less than a month away.`,
          };
        } else {
          hero = {
            label: "Save each day",
            value: money(r.daily),
            sub: `${by} is less than a week away.`,
          };
        }
        const rows: ResultRow[] = [];
        if (r.monthly !== null && r.weekly !== null && !r.grows) {
          rows.push({ label: `Or each week, for ${weeksText}`, value: money(r.weekly) });
        }
        if (r.monthly !== null || r.weekly !== null) {
          rows.push({ label: "Roughly each day", value: money(r.daily) });
        }
        rows.push({ label: "Still to save", value: money(r.gap) });
        if (ratePercent > 0) {
          rows.push({
            label: "Interest earned",
            value:
              r.interest >= 0.005 ? (
                <span className="text-emerald-600 dark:text-emerald-400">+{money(r.interest)}</span>
              ) : (
                money(0)
              ),
          });
        }
        body = (
          <>
            <ResultHero label={hero.label} value={hero.value} sub={hero.sub} />
            {bar}
            <ResultRows rows={rows} />
          </>
        );
        copy =
          `To have ${money(price)} by ${by} (with ${money(have)} saved), I need to put aside ` +
          (r.monthly !== null
            ? `${money(r.monthly)} a month${r.weekly !== null ? ` or ${money(r.weekly)} a week` : ""}.`
            : r.weekly !== null
              ? `${money(r.weekly)} a week.`
              : `${money(r.daily)} a day.`);
      }
    }
  }

  return (
    <ToolLayout>
      <ToolPanel className="space-y-5">
        <Segmented
          label="What do you want to work out?"
          hideLabel
          value={mode}
          onChange={(v) => set({ mo: v })}
          options={[
            { value: "when", label: "When can I buy it?" },
            { value: "save", label: "How much to save?" },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="What it costs"
            prefix={symbol}
            value={st.p}
            onChange={(v) => set({ p: v })}
            error={priceError}
          />
          <NumberField
            label="Already saved"
            prefix={symbol}
            value={st.s}
            onChange={(v) => set({ s: v })}
            error={saved.error}
          />
          {mode === "when" ? (
            <NumberField
              label="Saving each month"
              prefix={symbol}
              value={st.m}
              onChange={(v) => set({ m: v })}
              error={monthly.error}
            />
          ) : (
            <DateField
              label="Buy it by"
              value={target ?? ""}
              onChange={(v) => set({ d: v })}
              min={today ? (addDays(today, 1) ?? undefined) : undefined}
            />
          )}
          <CurrencyField />
          <MoreOptions
            className="sm:col-span-2"
            summary={ratePercent > 0 ? `${rateLabel} interest` : undefined}
            bodyClassName="grid gap-4"
          >
            <NumberField
              label="Interest on savings (per year)"
              suffix="%"
              value={st.r}
              onChange={(v) => set({ r: v })}
              error={rate.error}
              placeholder="0"
              hint="If your savings earn interest, compounded monthly. Leave blank for none."
            />
          </MoreOptions>
        </div>
      </ToolPanel>

      <ToolPanel sticky className="space-y-5">
        {body}
        <ResultActions copy={copy} onReset={reset} />
      </ToolPanel>
    </ToolLayout>
  );
}

/** How much of the price is already saved — the gap the plan closes. */
function HaveBar({ fraction, label }: { fraction: number; label: string }) {
  const pct = Math.max(0, Math.min(100, fraction * 100));
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Already saved"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(pct)}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function AffordableNow({
  have,
  surplus,
  money,
}: {
  have: number;
  surplus: number;
  money: (v: number) => string;
}) {
  return (
    <>
      <ResultHero
        label="You can buy it"
        value="Now"
        sub={
          surplus >= 0.005
            ? `You have ${money(have)} — ${money(surplus)} more than it costs.`
            : `You have ${money(have)} — exactly what it costs.`
        }
      />
      <HaveBar fraction={1} label="You have all of it" />
    </>
  );
}

/** The result's shape with blanks while "today" is unknown — nothing jumps when it arrives. */
function PendingResult() {
  return (
    <>
      <ResultHero label="Save each month" value={EMPTY} />
      <ResultRows
        rows={["Or each week", "Roughly each day", "Still to save"].map((label) => ({ label, value: EMPTY }))}
      />
    </>
  );
}
