"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ChoiceChips, NumberField, SelectField, type Option, type OptionGroup } from "@/components/tools/fields";
import {
  ResultActions,
  ResultEmpty,
  ResultHero,
  ResultRows,
  ToolLayout,
  ToolPanel,
} from "@/components/tools/result";
import { useToolLocale, useUrlState } from "@/components/tools/tool-state";
import { regionFromLocale } from "@/lib/geo";
import { CPI_COUNTRIES, CPI_FETCHED_ON, CPI_SOURCE, findCpiCountry, type CpiCountry } from "@/lib/tools/data/cpi";
import { formatCurrency, formatPercent } from "@/lib/tools/format";
import { amountRangeError, readField } from "@/lib/tools/growth";
import {
  ALL_YEARS,
  AVERAGE_YEARS,
  clampYear,
  commonLastYear,
  compareInflation,
  countryInSentence,
  coverageNote,
  cpiFor,
  currencyTag,
  CUSTOM_RATE_RANGE,
  defaultCountries,
  extendSeries,
  flagEmoji,
  FUTURE_LAST_YEAR,
  indexedPaths,
  MAX_COUNTRIES,
  parseCountryList,
  RANGE_POINTS,
  recentAverage,
  scientificParts,
  superscript,
  YEAR_RANGE,
  type CountryInflation,
  type Estimate,
  type FutureRate,
  type IndexedYear,
} from "@/lib/tools/inflation";
import { cn } from "@/lib/utils";
import type { ChartSeries } from "./cpi-chart";

/**
 * What money from one year is worth in another, for several countries at
 * once — each from its own consumer price index, read in its own currency.
 * There's no currency picker: an index only means something in the money it
 * was measured in, so "100" is $100 in the US and ₹100 in India.
 *
 * Either year can be in the future. Past a country's last published figure
 * its prices are carried on at a steady rate — its own 20-year average, or
 * one the visitor sets — and everything that leans on those years says it's
 * an estimate: "≈" on the figure, a dashed line on the chart, italics in the
 * table, a range for a point less or more inflation, and a plain warning.
 */

// Short, stable query keys — they're in every shared link.
const DEFAULTS = {
  a: "100",
  /** Countries, comma-separated ("IN,US,GB"). "" = the visitor's own country, then the US and the UK. */
  c: "",
  /** From year. */
  f: "2000",
  /** To year. "" = the latest year every picked country has. */
  t: "",
  /** Future inflation: "avg" = each country's own 20-year average, "own" = the rate in `r`. */
  e: "avg",
  /** The visitor's own future rate, percent a year. */
  r: "3",
};

const DEFAULT_FROM = 2000;

/** Lines that get their own colour; any more are drawn as grey context lines. */
const MAX_COLOURED = 8;

/** Euro-area countries converted at a fixed rate in 1999 (all of ours did — Greece, in 2001, isn't one of them). */
const EURO_START = 1999;

/** Past this, a figure is written in powers of ten ("₺1.07 × 10³⁶"): its digits would be unreadable, and falsely precise. */
const HUGE = 1e15;

const yearOption = (y: number): Option => ({ value: String(y), label: String(y) });

/** Published years, newest first. */
const PAST_YEARS = Array.from({ length: YEAR_RANGE.lastYear - YEAR_RANGE.firstYear + 1 }, (_, i) => YEAR_RANGE.lastYear - i);

/** Years to estimate: every one to 2100, then every 10 to 2200, then every 50. Newest first, like the past ones. */
const FUTURE_YEARS = (() => {
  const years: number[] = [];
  for (let y = YEAR_RANGE.lastYear + 1; y <= 2100; y++) years.push(y);
  for (let y = 2110; y <= 2200; y += 10) years.push(y);
  for (let y = 2250; y <= FUTURE_LAST_YEAR; y += 50) years.push(y);
  return years.reverse();
})();

/**
 * The year picker's list: estimates on top (the picker opens on the chosen
 * year, so the next years are just above it), then the published years. A
 * year from a link that isn't on the list — 2137 — is slotted in.
 */
function yearOptions(selected: number): OptionGroup[] {
  const future = FUTURE_YEARS.includes(selected) || selected <= YEAR_RANGE.lastYear
    ? FUTURE_YEARS
    : [...FUTURE_YEARS, selected].sort((a, b) => b - a);
  return [
    { label: "Estimates", options: future.map(yearOption) },
    { label: "Published data", options: PAST_YEARS.map(yearOption) },
  ];
}

const noopSubscribe = () => () => {};

/**
 * The visitor's country from their browser language: null on the server and
 * in the hydrating render (which get the fixed default countries), "" when
 * the browser names no region.
 */
function useVisitorRegion(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => regionFromLocale(navigator.language || "") ?? "",
    () => null,
  );
}

/** A four-digit year from the URL, or null. */
function parseYear(raw: string): number | null {
  return /^\d{4}$/.test(raw.trim()) ? Number(raw.trim()) : null;
}

/** The typed amount: "$100" when it's whole, "$99.50" when it isn't. */
function amountText(v: number, currency: string, locale: string): string {
  return formatCurrency(v, currency, locale, Number.isInteger(v) ? { decimals: 0 } : {});
}

/** A figure with a fixed number of decimals, so a column lines up ("8.00%", not "8%"). */
function fixed(v: number, locale: string, decimals: number): string {
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(v);
  } catch {
    return v.toFixed(decimals);
  }
}

/** "7.12 × 10³³" — the mantissa with `decimals` decimals, in the visitor's number format. */
function powerOfTen(v: number, locale: string, decimals = 2): string {
  const { mantissa, exponent } = scientificParts(v, decimals);
  return `${fixed(mantissa, locale, decimals)} × 10${superscript(exponent)}`;
}

/** Money as usual, or in powers of ten once it's astronomically large. */
function money(v: number, currency: string, locale: string): string {
  if (Math.abs(v) < HUGE) return formatCurrency(v, currency, locale);
  const { mantissa, exponent } = scientificParts(v);
  return `${formatCurrency(mantissa, currency, locale, { decimals: 2 })} × 10${superscript(exponent)}`;
}

/** A percentage as usual, or in powers of ten once it's astronomically large. */
function percent(v: number, locale: string): string {
  return Math.abs(v) < HUGE ? formatPercent(v, locale, 2) : `${powerOfTen(v, locale)}%`;
}

/** "+82.17%" / "−3.10%": a price change with its direction. */
function signedPercent(v: number, locale: string): string {
  return `${v >= 0 ? "+" : "−"}${percent(Math.abs(v), locale)}`;
}

/** An index figure for the tables: one decimal, or powers of ten once it's too long. */
function indexText(v: number, locale: string): string {
  return Math.abs(v) < 1e9 ? fixed(v, locale, 1) : powerOfTen(v, locale, 1);
}

/** "2.57% a year (its 2004–2024 average)": the assumed rate and where it came from. */
function rateText(e: FutureRate, locale: string): string {
  const pct = `${formatPercent(e.percent, locale, 2)} a year`;
  return e.window ? `${pct} (its ${e.window.from}–${e.window.to} average)` : `${pct} (the rate you set)`;
}

/** One line of the copied result. */
function sentence(r: CountryInflation, fromYear: number, toYear: number, locale: string): string {
  const place = countryInSentence(r.series);
  if (!r.result) return `${r.series.name}: no figure for ${fromYear}–${toYear} (${r.note.toLowerCase()}).`;
  const x = r.result;
  const cur = r.series.currency;
  if (r.estimate) {
    const e = r.estimate;
    return (
      `${amountText(x.amount, cur, locale)} in ${fromYear} is estimated at about ${money(x.value, cur, locale)} ` +
      `in ${toYear} in ${place}, assuming prices rise ${rateText(e, locale)} after ${e.dataLastYear} ` +
      `(${money(e.range[0], cur, locale)} to ${money(e.range[1], cur, locale)} with ${RANGE_POINTS} point less or ` +
      `more a year). An estimate, not a forecast.`
    );
  }
  return (
    `${amountText(x.amount, cur, locale)} in ${fromYear} is worth about ${formatCurrency(x.value, cur, locale)} ` +
    `in ${toYear} in ${place}: prices ${x.cumulativePercent >= 0 ? "rose" : "fell"} ` +
    `${formatPercent(Math.abs(x.cumulativePercent), locale, 2)} over ${x.earlierYear}–${x.laterYear} ` +
    `(${formatPercent(x.averageAnnualPercent!, locale, 2)} a year on average).`
  );
}

/** "France and Germany", "France, Germany and Italy". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function InflationTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const locale = useToolLocale();
  const region = useVisitorRegion();

  const fromLink = parseCountryList(s.c);
  const codes = fromLink.length ? fromLink : defaultCountries(region);
  const selected = codes.map((c) => findCpiCountry(c)).filter((c): c is CpiCountry => c !== null);

  const rawTo = s.t === "" ? null : parseYear(s.t);
  const fromYear = clampYear(parseYear(s.f), ALL_YEARS, DEFAULT_FROM);
  const toYear = clampYear(rawTo, ALL_YEARS, commonLastYear(selected));
  const earlier = Math.min(fromYear, toYear);
  const later = Math.max(fromYear, toYear);

  const amount = readField(s.a, locale, {
    min: 0,
    max: 1e12,
    required: "Enter an amount.",
    range: amountRangeError,
  });

  // Future years: shown only when a picked country needs one estimated.
  const estimating = selected.some((c) => later > c.lastYear);
  const customRate = s.e === "own";
  const rate = readField(s.r, locale, {
    min: CUSTOM_RATE_RANGE.min,
    max: CUSTOM_RATE_RANGE.max,
    required: "Enter a yearly rate.",
    range: `Enter a rate from ${CUSTOM_RATE_RANGE.min}% to ${CUSTOM_RATE_RANGE.max}% a year.`,
  });
  const rateFor = (c: CpiCountry): FutureRate =>
    customRate && rate.value !== null ? { percent: rate.value, window: null } : recentAverage(c)!;

  /**
   * Any edit pins the auto-picked countries into the URL, so a copied link
   * opens on the same comparison for someone elsewhere.
   */
  const update = (patch: Partial<typeof DEFAULTS>) => set(s.c === "" ? { c: codes.join(","), ...patch } : patch);

  const toggle = (code: string) => {
    const next = codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
    if (next.length === 0 || next.length > MAX_COUNTRIES) return;
    set({ c: next.join(",") });
  };

  const sameYear = fromYear === toYear ? "Pick two different years to see how prices changed." : null;
  const rateProblem = estimating && customRate && rate.error ? `Future inflation: ${rate.error}` : null;
  const problem = (amount.error && `Amount: ${amount.error}`) || sameYear || rateProblem;
  const rows = problem
    ? null
    : compareInflation({ amount: amount.value!, fromYear, toYear, countries: selected, rateFor });
  const estimates = rows?.flatMap((r) => (r.estimate ? [r.estimate] : [])) ?? [];

  const copy = rows
    ? `${rows.map((r) => sentence(r, fromYear, toYear, locale)).join("\n")}\nSource: World Bank consumer price index.`
    : null;

  const euroNames = selected.filter((c) => c.currency === "EUR").map((c) => c.name);
  const amountHint =
    amount.value === null
      ? undefined
      : `Read in each country's own currency: ${selected
          .slice(0, 3)
          .map((c) => amountText(amount.value!, c.currency, locale))
          .join(", ")}${selected.length > 3 ? "…" : "."}`;

  // The chart draws each country carried on to the later year where it needs estimating.
  const charted = rateProblem
    ? selected
    : selected.map((c) => (later > c.lastYear ? extendSeries(c, rateFor(c).percent, later) : c));

  return (
    <div>
      <ToolLayout>
        <ToolPanel>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Amount"
              className="sm:col-span-2"
              value={s.a}
              onChange={(v) => update({ a: v })}
              error={amount.error}
              hint={amountHint}
            />
            <SelectField
              label="From year"
              value={String(fromYear)}
              onChange={(v) => update({ f: v })}
              options={yearOptions(fromYear)}
            />
            <SelectField
              label="To year"
              value={String(toYear)}
              onChange={(v) => update({ t: v })}
              options={yearOptions(toYear)}
            />
            {estimating && (
              <FutureRateField
                own={customRate}
                value={s.r}
                error={rate.error}
                locale={locale}
                onMode={(own) => update({ e: own ? "own" : "avg" })}
                onChange={(v) => update({ r: v })}
                className="sm:col-span-2"
              />
            )}
            {earlier < EURO_START && euroNames.length > 0 && (
              <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
                Before {EURO_START}, enter amounts for {listNames(euroNames)} in euros, converted at the old
                currency&apos;s fixed rate — the notes under the country table give each one.
              </p>
            )}
            <CountryPicker codes={codes} locale={locale} onToggle={toggle} className="sm:col-span-2" />
          </div>
        </ToolPanel>

        <ToolPanel sticky className="space-y-5">
          {rows ? (
            <>
              <LeadResult row={rows[0]!} fromYear={fromYear} toYear={toYear} locale={locale} />
              {rows.length > 1 && (
                <Comparison rows={rows} amount={amount.value!} fromYear={fromYear} toYear={toYear} locale={locale} />
              )}
              {estimates.length > 0 && <EstimateNotice estimates={estimates} own={customRate} later={later} />}
            </>
          ) : (
            <ResultEmpty>{problem}</ResultEmpty>
          )}
          <ResultActions copy={copy} onReset={reset} withCurrency={false} />
        </ToolPanel>
      </ToolLayout>

      <PricePaths
        selected={charted}
        fromYear={fromYear}
        toYear={toYear}
        problem={sameYear ?? rateProblem}
        locale={locale}
      />
      <AllCountries
        picked={codes}
        fromYear={fromYear}
        toYear={toYear}
        problem={sameYear}
        ownRate={customRate && rate.value !== null ? rate.value : null}
        locale={locale}
      />
    </div>
  );
}

/**
 * Where the future rate comes from: each country's own recent average (the
 * default), or one rate the visitor sets for every country.
 */
function FutureRateField({
  own,
  value,
  error,
  locale,
  onMode,
  onChange,
  className,
}: {
  own: boolean;
  value: string;
  error: string | null;
  locale: string;
  onMode: (own: boolean) => void;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 rounded-xl border bg-muted/30 p-3", className)}>
      <ChoiceChips
        label="Future inflation"
        value={own ? "own" : "avg"}
        onChange={(v) => onMode(v === "own")}
        options={[
          { value: "avg", label: `${AVERAGE_YEARS}-year average` },
          { value: "own", label: "My own rate" },
        ]}
      />
      {own ? (
        <NumberField
          label="Inflation per year, for every country"
          suffix="%"
          value={value}
          onChange={onChange}
          error={error}
          hint={`Central banks in many countries aim for about ${formatPercent(2, locale, 0)}.`}
        />
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Years after a country&apos;s latest published figure assume its prices keep rising at its own average rate
          over its last {AVERAGE_YEARS} years of data.
        </p>
      )}
    </div>
  );
}

/**
 * The plain warning that goes with any estimated figure: what was assumed,
 * that real inflation won't follow it, and — far out — that the figure is an
 * illustration of compounding rather than a number to plan on.
 */
function EstimateNotice({ estimates, own, later }: { estimates: Estimate[]; own: boolean; later: number }) {
  const ends = [...new Set(estimates.map((e) => e.dataLastYear))].sort((a, b) => a - b);
  const since = ends.length === 1 ? `after ${ends[0]}` : "after each country's latest published year";
  const years = later - ends[0]!;
  return (
    <div role="note" className="flex gap-2.5 rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
      <div className="min-w-0 text-muted-foreground">
        <p className="font-medium text-foreground">An estimate, not a forecast</p>
        <p className="mt-1">
          There are no price figures {since}, so the calculator assumes prices rise at one steady rate —{" "}
          {own ? "the rate you set" : `each country's average over its last ${AVERAGE_YEARS} years`} — every year.
          Real inflation changes from year to year and can&apos;t be predicted, so real prices will be different.
          The range shows what just {RANGE_POINTS} point less or more a year does.
        </p>
        {years > 50 && (
          <p className="mt-1">
            Over {years} years small differences compound into enormous ones: read figures this far out as an
            illustration of how inflation adds up, not as a prediction.
          </p>
        )}
        <p className="mt-1">For rough planning only — not financial advice.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inputs: the country chips
// ---------------------------------------------------------------------------

/**
 * Every country as a toggle chip — real checkboxes, so Tab, Space and screen
 * readers work as they would on any form. A picked chip carries its place in
 * the results (1 is the headline), so the order isn't a hidden rule.
 */
function CountryPicker({
  codes,
  locale,
  onToggle,
  className,
}: {
  codes: string[];
  locale: string;
  onToggle: (code: string) => void;
  className?: string;
}) {
  const hintId = useId();
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-1.5 text-sm font-medium">
        Countries{" "}
        <span className="font-normal text-muted-foreground">
          · {codes.length} of {MAX_COUNTRIES} picked
        </span>
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {CPI_COUNTRIES.map((c) => {
          const place = codes.indexOf(c.country);
          const on = place !== -1;
          return (
            <label
              key={c.country}
              className="relative flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border bg-background py-1.5 pr-6 pl-2.5 transition-colors select-none hover:bg-muted/60 has-checked:border-foreground/60 has-checked:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/40 has-disabled:cursor-default dark:bg-input/30 dark:has-checked:bg-muted"
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                // The last picked country stays: a comparison of none has nothing to show.
                disabled={on && codes.length === 1}
                onChange={() => onToggle(c.country)}
                aria-describedby={hintId}
              />
              <span aria-hidden className="text-lg leading-none">
                {flagEmoji(c.country)}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-sm">{c.name}</span>
                <span className="block text-xs text-muted-foreground">{currencyTag(c.currency, locale)}</span>
              </span>
              {on && (
                <span
                  aria-hidden
                  className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background tabular-nums"
                >
                  {place + 1}
                </span>
              )}
            </label>
          );
        })}
      </div>
      <p id={hintId} className="mt-1.5 text-xs text-muted-foreground">
        {codes.length === 1
          ? "Pick more countries to compare them. One always stays picked."
          : "The numbers are the order of the results; the first is the headline figure."}
      </p>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Results: the headline country, then every picked country
// ---------------------------------------------------------------------------

function LeadResult({
  row,
  fromYear,
  toYear,
  locale,
}: {
  row: CountryInflation;
  fromYear: number;
  toYear: number;
  locale: string;
}) {
  const { series } = row;
  if (!row.result) {
    return (
      <ResultEmpty>
        {row.note} for {countryInSentence(series)} — pick years from {series.firstYear} to {series.lastYear} to see
        its figure here.
      </ResultEmpty>
    );
  }
  const r = row.result;
  const e = row.estimate;
  const cash = (v: number) => money(v, series.currency, locale);
  const typed = amountText(r.amount, series.currency, locale);
  const place = countryInSentence(series);
  const label = (
    <>
      <span aria-hidden>{flagEmoji(series.country)} </span>
      {series.name} · {typed} from {fromYear}, in {toYear} money
    </>
  );

  if (!e) {
    return (
      <>
        <ResultHero
          label={label}
          value={cash(r.value)}
          sub={`What cost ${typed} in ${fromYear} cost about ${cash(r.value)} in ${toYear} in ${place}.`}
        />
        <ResultRows
          rows={[
            { label: `Prices, ${r.earlierYear}–${r.laterYear}`, value: signedPercent(r.cumulativePercent, locale) },
            { label: "Average inflation per year", value: formatPercent(r.averageAnnualPercent!, locale, 2) },
            {
              label: r.purchasingPowerLossPercent >= 0 ? "Buying power lost" : "Buying power gained",
              value: percent(Math.abs(r.purchasingPowerLossPercent), locale),
            },
          ]}
        />
      </>
    );
  }

  // The most asked future question — "what will today's money be worth?" —
  // answered alongside when the from-year is further back than the data's end.
  const indexIn = (year: number) => r.path.find((p) => p.year === year)!.index;
  const today =
    fromYear < e.dataLastYear && toYear > e.dataLastYear
      ? (r.amount * indexIn(toYear)) / indexIn(e.dataLastYear)
      : null;

  return (
    <>
      <ResultHero
        label={
          <>
            {label}{" "}
            <span className="ml-1 inline-flex rounded-full border px-1.5 text-[11px] font-medium text-foreground">
              Estimate
            </span>
          </>
        }
        value={`≈ ${cash(r.value)}`}
        sub={
          `${typed} in ${fromYear} is roughly ${cash(r.value)} in ${toYear} money in ${place}, assuming prices ` +
          `rise ${rateText(e, locale)} after ${e.dataLastYear}.`
        }
      />
      <ResultRows
        rows={[
          {
            label: `With ${RANGE_POINTS} point less or more inflation a year`,
            value: `${cash(e.range[0])} – ${cash(e.range[1])}`,
          },
          ...(today !== null
            ? [{ label: `${typed} in ${e.dataLastYear}, in ${toYear} money`, value: `≈ ${cash(today)}` }]
            : []),
          {
            label: `Prices, ${r.earlierYear}–${r.laterYear} (estimated)`,
            value: signedPercent(r.cumulativePercent, locale),
          },
          { label: "Average inflation per year", value: formatPercent(r.averageAnnualPercent!, locale, 2) },
          {
            label: r.purchasingPowerLossPercent >= 0 ? "Buying power lost" : "Buying power gained",
            value: percent(Math.abs(r.purchasingPowerLossPercent), locale),
          },
        ]}
      />
    </>
  );
}


function Comparison({
  rows,
  amount,
  fromYear,
  toYear,
  locale,
}: {
  rows: CountryInflation[];
  amount: number;
  fromYear: number;
  toYear: number;
  locale: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-sm font-medium">
        {fixedAmount(amount, locale)} from {fromYear}, in {toYear} money, in each country&apos;s currency
      </h2>
      <ul className="mt-2 divide-y border-y text-sm">
        {rows.map((r) => (
          <li key={r.series.country} className="flex items-start justify-between gap-3 py-2.5">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="text-base leading-none">
                {flagEmoji(r.series.country)}
              </span>
              <span className="min-w-0">{r.series.name}</span>
            </span>
            {r.result ? (
              <span className="shrink-0 text-right tabular-nums">
                <span className="block font-medium">
                  {r.estimate && "≈ "}
                  {money(r.result.value, r.series.currency, locale)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {signedPercent(r.result.cumulativePercent, locale)} ·{" "}
                  {formatPercent(r.result.averageAnnualPercent!, locale, 2)} a year
                  {r.estimate && " · estimate"}
                </span>
              </span>
            ) : (
              <span className="shrink-0 text-right text-xs text-muted-foreground">{r.note}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The amount as a plain number ("100", "1,250.5") — it's in a different currency on every row. */
function fixedAmount(v: number, locale: string): string {
  return Number.isInteger(v) ? fixed(v, locale, 0) : fixed(v, locale, 2);
}

// ---------------------------------------------------------------------------
// The chart panel: one line per country, the year-by-year table, the source
// ---------------------------------------------------------------------------

/**
 * The categorical line colours, light and dark — a palette checked for
 * colour-blind separation on both card surfaces. Colour follows the country's
 * place among the charted ones; the legend and the table carry the names.
 */
const SERIES_COLOURS =
  "[--inf-1:#2a78d6] [--inf-2:#eb6834] [--inf-3:#1baf7a] [--inf-4:#eda100] [--inf-5:#e87ba4] [--inf-6:#008300] [--inf-7:#4a3aa7] [--inf-8:#e34948] " +
  "dark:[--inf-1:#3987e5] dark:[--inf-2:#d95926] dark:[--inf-3:#199e70] dark:[--inf-4:#c98500] dark:[--inf-5:#d55181] dark:[--inf-6:#008300] dark:[--inf-7:#9085e9] dark:[--inf-8:#e66767]";

const chartPlaceholder = <Skeleton className="h-72 w-full rounded-xl" />;

const CpiChart = dynamic(() => import("./cpi-chart").then((m) => m.CpiChart), {
  ssr: false,
  loading: () => chartPlaceholder,
});

/**
 * The chart, fetched and mounted only once it scrolls near the viewport — the
 * same pattern as `LazyGrowthChart`. The placeholder reserves its height.
 */
function LazyCpiChart(props: { rows: IndexedYear[]; series: ChartSeries[]; fromYear: number; locale: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // Decorative for assistive tech: the table under it has every figure.
    <div ref={ref} className="h-72" aria-hidden>
      {visible ? <CpiChart {...props} /> : chartPlaceholder}
    </div>
  );
}

/**
 * Whether the year-by-year table lists `year`: every year over a short span;
 * over a long one (1960–2500 is 541 rows), round years at a step that keeps
 * it readable — plus the ends and the years the data stops.
 */
function keepYear(year: number, earlier: number, later: number, marks: number[]): boolean {
  const span = later - earlier;
  const step = span <= 60 ? 1 : span <= 150 ? 5 : span <= 300 ? 10 : 25;
  return year % step === 0 || year === earlier || year === later || marks.includes(year);
}

const fetchedOn = new Date(`${CPI_FETCHED_ON}T00:00:00Z`);
const LATEST = Math.max(...CPI_COUNTRIES.map((c) => c.lastYear));
const BEHIND = CPI_COUNTRIES.filter((c) => c.lastYear < LATEST);

function PricePaths({
  selected,
  fromYear,
  toYear,
  problem,
  locale,
}: {
  selected: CpiCountry[];
  fromYear: number;
  toYear: number;
  problem: string | null;
  locale: string;
}) {
  const earlier = Math.min(fromYear, toYear);
  const later = Math.max(fromYear, toYear);
  const { codes, rows } = problem ? { codes: [], rows: [] } : indexedPaths(selected, fromYear, toYear);
  const byCode = new Map(selected.map((c) => [c.country, c]));
  /** The last published year for each country whose line runs past it; estimated years come after. */
  const dataEnds = new Map(
    codes.flatMap((code) => {
      const last = findCpiCountry(code)!.lastYear;
      return later > last ? [[code, last] as const] : [];
    }),
  );
  const series: ChartSeries[] = codes.map((code, i) => ({
    code,
    name: byCode.get(code)!.name,
    color: i < MAX_COLOURED ? `var(--inf-${i + 1})` : "var(--muted-foreground)",
    muted: i >= MAX_COLOURED,
    dataLastYear: dataEnds.get(code) ?? null,
  }));
  const charted = codes.map((c) => byCode.get(c)!);
  const estimated = (code: string, year: number) => year > (dataEnds.get(code) ?? Infinity);
  const tableRows = rows.filter((r) => keepYear(r.year, earlier, later, [...dataEnds.values()]));
  const missing = selected.filter((c) => !codes.includes(c.country));
  const retrieved = fetchedOn.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <ToolPanel as="section" className={cn("mt-4 lg:mt-6", SERIES_COLOURS)}>
      <h2 className="text-lg font-semibold tracking-tight">
        {problem
          ? "How prices moved"
          : dataEnds.size
            ? `Prices from ${earlier} to ${later}`
            : `How prices moved, ${earlier}–${later}`}
      </h2>

      {problem ? (
        <div className="mt-4">
          <ResultEmpty>{problem}</ResultEmpty>
        </div>
      ) : codes.length === 0 ? (
        <div className="mt-4">
          <ResultEmpty>None of your countries has figures for every year from {earlier} to {later} — pick other years.</ResultEmpty>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Each country&apos;s prices with {fromYear} = 100, so they all start from the same point: 150 means
            prices half as high again.
            {dataEnds.size > 0 &&
              " Dashed lines and figures in italics are estimates, from the rate above — not published data."}
          </p>

          <ul aria-hidden className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {series.map((s) => (
              <li key={s.code} className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-4 rounded-full"
                  style={{ background: s.color, opacity: s.muted ? 0.45 : 1 }}
                />
                {s.name}
              </li>
            ))}
            {dataEnds.size > 0 && (
              <li className="flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-muted-foreground" />
                Estimate
              </li>
            )}
          </ul>

          <div className="mt-3">
            <LazyCpiChart rows={rows} series={series} fromYear={fromYear} locale={locale} />
          </div>

          {(codes.length > MAX_COLOURED || missing.length > 0) && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {codes.length > MAX_COLOURED &&
                `Countries after the ${MAX_COLOURED}th are drawn in grey — hover the chart or open the table for their figures. `}
              {missing.length > 0 &&
                `Not on the chart: ${missing
                  .map((c) => `${c.name} (${(coverageNote(c, fromYear, toYear) ?? "no figures").toLowerCase()})`)
                  .join(", ")}.`}
            </p>
          )}

          <details className="group mt-6 border-t pt-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
              <ChevronDown
                aria-hidden
                className="size-4 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0"
              />
              Year-by-year table
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm tabular-nums" style={{ minWidth: `${4 + charted.length * 7}rem` }}>
                <caption className="sr-only">
                  Consumer prices in each year from {earlier} to {later}, with {fromYear} = 100, for{" "}
                  {listNames(charted.map((c) => c.name))}
                  {tableRows.length < rows.length && ", every few years"}
                  {dataEnds.size > 0 && "; figures after a country's published data are estimates"}
                </caption>
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 text-left font-medium">
                      Year
                    </th>
                    {charted.map((c) => (
                      <th key={c.country} scope="col" className="px-3 py-2 text-right font-medium">
                        <span aria-hidden>{flagEmoji(c.country)} </span>
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r) => (
                    <tr key={r.year} className="border-t">
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">
                        {r.year}
                      </th>
                      {charted.map((c) => {
                        const est = estimated(c.country, r.year);
                        return (
                          <td
                            key={c.country}
                            className={cn("px-3 py-2 text-right", est && "text-muted-foreground italic")}
                          >
                            {indexText(r[c.country]!, locale)}
                            {est && <span className="sr-only"> (estimate)</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}

      <p className="mt-4 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
        Source:{" "}
        <a href={CPI_SOURCE.url} className="underline underline-offset-2 hover:text-foreground">
          World Bank, consumer price index (2010 = 100)
        </a>
        , licensed{" "}
        <a href={CPI_SOURCE.licenseUrl} className="underline underline-offset-2 hover:text-foreground" rel="license">
          {CPI_SOURCE.license}
        </a>
        . Figures run to {LATEST}, the last full year the World Bank has published
        {BEHIND.length ? ` (${BEHIND.map((c) => `${countryInSentence(c)} to ${c.lastYear}`).join(", ")})` : ""};
        retrieved {retrieved}.
      </p>
    </ToolPanel>
  );
}

// ---------------------------------------------------------------------------
// Every country's average inflation for the chosen years
// ---------------------------------------------------------------------------

/** One line of the all-countries table. */
type AverageRow = {
  series: CpiCountry;
  /** Average inflation a year, and the total rise, in percent — null with a `note` when there's no figure. */
  average: number | null;
  total: number | null;
  note: string | null;
  /** The years the figures cover. */
  span: string;
};

/**
 * Every country's average inflation, alphabetically. For published years it's
 * the chosen span; once the years reach into the future it's each country's
 * last 20 years instead — the rates its estimates use — since an "average" over
 * years that are themselves estimated would only read the assumption back.
 */
function AllCountries({
  picked,
  fromYear,
  toYear,
  problem,
  ownRate,
  locale,
}: {
  picked: string[];
  fromYear: number;
  toYear: number;
  problem: string | null;
  /** The visitor's own future rate, when they set one. */
  ownRate: number | null;
  locale: string;
}) {
  const earlier = Math.min(fromYear, toYear);
  const later = Math.max(fromYear, toYear);
  const future = later > LATEST;

  const rows: AverageRow[] = future
    ? CPI_COUNTRIES.map((series) => {
        const avg = recentAverage(series)!;
        const { from, to } = avg.window!;
        return {
          series,
          average: avg.percent,
          total: (cpiFor(series, to)! / cpiFor(series, from)! - 1) * 100,
          note: null,
          span: `${from}–${to}`,
        };
      })
    : compareInflation({ amount: 1, fromYear: earlier, toYear: later, countries: CPI_COUNTRIES }).map((r) => ({
        series: r.series,
        average: r.result ? r.result.averageAnnualPercent! : null,
        total: r.result ? r.result.cumulativePercent : null,
        note: r.note,
        span: `${r.series.firstYear}–${r.series.lastYear}`,
      }));
  const ranked = rows.filter((r) => r.average !== null).sort((a, b) => b.average! - a.average!);
  const fastest = ranked[0];
  const slowest = ranked.at(-1);
  const notes = CPI_COUNTRIES.filter((c) => c.note);
  const span = future ? `last ${AVERAGE_YEARS} years` : `${earlier}–${later}`;

  return (
    <ToolPanel as="section" className="mt-4 lg:mt-6">
      <h2 className="text-lg font-semibold tracking-tight">
        {problem
          ? `Average inflation in all ${CPI_COUNTRIES.length} countries`
          : `Average inflation in all ${CPI_COUNTRIES.length} countries, ${span}`}
      </h2>

      {problem ? (
        <div className="mt-4">
          <ResultEmpty>{problem}</ResultEmpty>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {future ? (
              <>
                Published figures only: each country&apos;s compound average over its last {AVERAGE_YEARS} years of
                data, or since its series starts.{" "}
                {ownRate === null
                  ? "These are the rates the estimates above carry forward."
                  : `The estimates above use the ${formatPercent(ownRate, locale, 2)} a year you set instead.`}
              </>
            ) : (
              <>
                The yearly rate that compounds to each country&apos;s total rise in consumer prices between {earlier}{" "}
                and {later}.
              </>
            )}
            {fastest && slowest && fastest !== slowest && (
              <>
                {" "}
                Prices rose fastest in {countryInSentence(fastest.series)} (
                {formatPercent(fastest.average!, locale, 2)} a year) and slowest in {countryInSentence(slowest.series)}{" "}
                ({formatPercent(slowest.average!, locale, 2)} a year).
              </>
            )}{" "}
            Your countries are highlighted.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm tabular-nums">
              <caption className="sr-only">
                Average yearly inflation and total price rise{" "}
                {future ? `over each country's last ${AVERAGE_YEARS} years of data` : `from ${earlier} to ${later}`} in
                each of {CPI_COUNTRIES.length} countries, alphabetically
              </caption>
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">
                    Country
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Average a year
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {future ? "Total rise" : `Prices, ${earlier}–${later}`}
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    {future ? "Years" : "Data"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const on = picked.includes(r.series.country);
                  return (
                    <tr key={r.series.country} className={cn("border-t", on && "bg-muted/50")}>
                      <th scope="row" className="py-2 pr-3 text-left font-normal">
                        <span className="flex items-center gap-2">
                          <span aria-hidden className="text-base leading-none">
                            {flagEmoji(r.series.country)}
                          </span>
                          <span className="min-w-0">
                            <span className={cn(on && "font-medium")}>{r.series.name}</span>
                            {on && <span className="sr-only"> (in your comparison)</span>}
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              · {currencyTag(r.series.currency, locale)}
                            </span>
                          </span>
                        </span>
                      </th>
                      {r.average !== null && r.total !== null ? (
                        <>
                          <td className="px-3 py-2 text-right font-medium">{fixed(r.average, locale, 2)}%</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {r.total >= 0 ? "+" : "−"}
                            {fixed(Math.abs(r.total), locale, 1)}%
                          </td>
                        </>
                      ) : (
                        <td colSpan={2} className="px-3 py-2 text-right text-muted-foreground">
                          {r.note}
                        </td>
                      )}
                      <td className="py-2 pl-3 text-right whitespace-nowrap text-muted-foreground">{r.span}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {notes.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <h3 className="text-sm font-medium">Notes on the data</h3>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
            {notes.map((c) => (
              <li key={c.country}>
                <span className="font-medium text-foreground">{c.name}:</span> {c.note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </ToolPanel>
  );
}
