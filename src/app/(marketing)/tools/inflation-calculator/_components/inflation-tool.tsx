"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NumberField, SelectField, type Option } from "@/components/tools/fields";
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
  clampYear,
  commonLastYear,
  compareInflation,
  countryInSentence,
  coverageNote,
  currencyTag,
  defaultCountries,
  flagEmoji,
  indexedPaths,
  MAX_COUNTRIES,
  parseCountryList,
  YEAR_RANGE,
  type CountryInflation,
  type IndexedYear,
} from "@/lib/tools/inflation";
import { cn } from "@/lib/utils";
import type { ChartSeries } from "./cpi-chart";

/**
 * What money from one year is worth in another, for several countries at
 * once — each from its own consumer price index, read in its own currency.
 * There's no currency picker: an index only means something in the money it
 * was measured in, so "100" is $100 in the US and ₹100 in India.
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
};

const DEFAULT_FROM = 2000;

/** Lines that get their own colour; any more are drawn as grey context lines. */
const MAX_COLOURED = 8;

/** Euro-area countries converted at a fixed rate in 1999 (all of ours did — Greece, in 2001, isn't one of them). */
const EURO_START = 1999;

const YEAR_OPTIONS: Option[] = Array.from({ length: YEAR_RANGE.lastYear - YEAR_RANGE.firstYear + 1 }, (_, i) => {
  const y = String(YEAR_RANGE.lastYear - i);
  return { value: y, label: y };
});

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

/** "+82.17%" / "−3.10%": a price change with its direction. */
function signedPercent(v: number, locale: string): string {
  return `${v >= 0 ? "+" : "−"}${formatPercent(Math.abs(v), locale, 2)}`;
}

/** One line of the copied result. */
function sentence(r: CountryInflation, fromYear: number, toYear: number, locale: string): string {
  const place = countryInSentence(r.series);
  if (!r.result) return `${r.series.name}: no figure for ${fromYear}–${toYear} (${r.note.toLowerCase()}).`;
  const x = r.result;
  const cur = r.series.currency;
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
  const fromYear = clampYear(parseYear(s.f), YEAR_RANGE, DEFAULT_FROM);
  const toYear = clampYear(rawTo, YEAR_RANGE, commonLastYear(selected));
  const earlier = Math.min(fromYear, toYear);

  const amount = readField(s.a, locale, {
    min: 0,
    max: 1e12,
    required: "Enter an amount.",
    range: amountRangeError,
  });

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
  const problem = (amount.error && `Amount: ${amount.error}`) || sameYear;
  const rows = problem ? null : compareInflation({ amount: amount.value!, fromYear, toYear, countries: selected });

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
              options={YEAR_OPTIONS}
            />
            <SelectField
              label="To year"
              value={String(toYear)}
              onChange={(v) => update({ t: v })}
              options={YEAR_OPTIONS}
              hint={s.t === "" ? "The latest year all your countries have." : undefined}
            />
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
            </>
          ) : (
            <ResultEmpty>{problem}</ResultEmpty>
          )}
          <ResultActions copy={copy} onReset={reset} withCurrency={false} />
        </ToolPanel>
      </ToolLayout>

      <PricePaths selected={selected} fromYear={fromYear} toYear={toYear} problem={sameYear} locale={locale} />
      <AllCountries picked={codes} fromYear={fromYear} toYear={toYear} problem={sameYear} locale={locale} />
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
  const money = (v: number) => formatCurrency(v, series.currency, locale);
  const typed = amountText(r.amount, series.currency, locale);
  return (
    <>
      <ResultHero
        label={
          <>
            <span aria-hidden>{flagEmoji(series.country)} </span>
            {series.name} · {typed} from {fromYear}, in {toYear} money
          </>
        }
        value={money(r.value)}
        sub={`What cost ${typed} in ${fromYear} cost about ${money(r.value)} in ${toYear} in ${countryInSentence(series)}.`}
      />
      <ResultRows
        rows={[
          { label: `Prices, ${r.earlierYear}–${r.laterYear}`, value: signedPercent(r.cumulativePercent, locale) },
          { label: "Average inflation per year", value: formatPercent(r.averageAnnualPercent!, locale, 2) },
          {
            label: r.purchasingPowerLossPercent >= 0 ? "Buying power lost" : "Buying power gained",
            value: formatPercent(Math.abs(r.purchasingPowerLossPercent), locale, 2),
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
                <span className="block font-medium">{formatCurrency(r.result.value, r.series.currency, locale)}</span>
                <span className="block text-xs text-muted-foreground">
                  {signedPercent(r.result.cumulativePercent, locale)} ·{" "}
                  {formatPercent(r.result.averageAnnualPercent!, locale, 2)} a year
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
  const series: ChartSeries[] = codes.map((code, i) => ({
    code,
    name: byCode.get(code)!.name,
    color: i < MAX_COLOURED ? `var(--inf-${i + 1})` : "var(--muted-foreground)",
    muted: i >= MAX_COLOURED,
  }));
  const charted = codes.map((c) => byCode.get(c)!);
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
        {problem ? "How prices moved" : `How prices moved, ${earlier}–${later}`}
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
                  {rows.map((r) => (
                    <tr key={r.year} className="border-t">
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">
                        {r.year}
                      </th>
                      {charted.map((c) => (
                        <td key={c.country} className="px-3 py-2 text-right">
                          {fixed(r[c.country]!, locale, 1)}
                        </td>
                      ))}
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

function AllCountries({
  picked,
  fromYear,
  toYear,
  problem,
  locale,
}: {
  picked: string[];
  fromYear: number;
  toYear: number;
  problem: string | null;
  locale: string;
}) {
  const earlier = Math.min(fromYear, toYear);
  const later = Math.max(fromYear, toYear);
  const rows = compareInflation({ amount: 1, fromYear: earlier, toYear: later, countries: CPI_COUNTRIES });
  const ranked = rows
    .filter((r) => r.result)
    .sort((a, b) => b.result!.averageAnnualPercent! - a.result!.averageAnnualPercent!);
  const fastest = ranked[0];
  const slowest = ranked.at(-1);
  const notes = CPI_COUNTRIES.filter((c) => c.note);

  return (
    <ToolPanel as="section" className="mt-4 lg:mt-6">
      <h2 className="text-lg font-semibold tracking-tight">
        {problem
          ? `Average inflation in all ${CPI_COUNTRIES.length} countries`
          : `Average inflation in all ${CPI_COUNTRIES.length} countries, ${earlier}–${later}`}
      </h2>

      {problem ? (
        <div className="mt-4">
          <ResultEmpty>{problem}</ResultEmpty>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            The yearly rate that compounds to each country&apos;s total rise in consumer prices between {earlier} and{" "}
            {later}.
            {fastest && slowest && fastest !== slowest && (
              <>
                {" "}
                Prices rose fastest in {countryInSentence(fastest.series)} (
                {formatPercent(fastest.result!.averageAnnualPercent!, locale, 2)} a year) and slowest in{" "}
                {countryInSentence(slowest.series)} ({formatPercent(slowest.result!.averageAnnualPercent!, locale, 2)} a
                year).
              </>
            )}{" "}
            Your countries are highlighted.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm tabular-nums">
              <caption className="sr-only">
                Average yearly inflation and total price rise from {earlier} to {later} in each of{" "}
                {CPI_COUNTRIES.length} countries, alphabetically
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
                    Prices, {earlier}–{later}
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    Data
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
                      {r.result ? (
                        <>
                          <td className="px-3 py-2 text-right font-medium">
                            {fixed(r.result.averageAnnualPercent!, locale, 2)}%
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {r.result.cumulativePercent >= 0 ? "+" : "−"}
                            {fixed(Math.abs(r.result.cumulativePercent), locale, 1)}%
                          </td>
                        </>
                      ) : (
                        <td colSpan={2} className="px-3 py-2 text-right text-muted-foreground">
                          {r.note}
                        </td>
                      )}
                      <td className="py-2 pl-3 text-right whitespace-nowrap text-muted-foreground">
                        {r.series.firstYear}–{r.series.lastYear}
                      </td>
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
