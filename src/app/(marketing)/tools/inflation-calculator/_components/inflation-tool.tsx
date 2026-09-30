"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { currencySymbol, formatCurrency, formatPercent } from "@/lib/tools/format";
import { amountRangeError, readField } from "@/lib/tools/growth";
import { adjustForInflation, clampYear, countryInSentence, type InflationResult } from "@/lib/tools/inflation";

/**
 * What money from one year is worth in another, from a country's consumer
 * price index. The currency follows the country — there's no currency picker,
 * because the index only means something in the money it was measured in.
 */

// Short, stable query keys — they're in every shared link.
const DEFAULTS = {
  a: "100",
  /** Country code. "" = the visitor's own region, else the United States. */
  c: "",
  /** From year. */
  f: "2000",
  /** To year. "" = the latest year published for the country. */
  t: "",
};

const DEFAULT_FROM = 2000;
const FALLBACK_COUNTRY = "US";

const COUNTRY_OPTIONS: Option[] = CPI_COUNTRIES.map((c) => ({ value: c.country, label: `${c.name} (${c.currency})` }));

const noopSubscribe = () => () => {};

/**
 * The visitor's country from their browser language — `null` on the server,
 * so the static HTML (and hydration) shows the United States, and the
 * visitor's own country arrives on the re-render straight after.
 */
function useVisitorRegion(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => regionFromLocale(navigator.language || ""),
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

function yearOptions(c: CpiCountry): Option[] {
  const out: Option[] = [];
  for (let y = c.lastYear; y >= c.firstYear; y--) out.push({ value: String(y), label: String(y) });
  return out;
}

/** Why a year in the link was moved: it's outside what the country has. */
function rangeHint(raw: number | null, c: CpiCountry): string | undefined {
  if (raw === null) return undefined;
  if (raw < c.firstYear) return `Figures for ${countryInSentence(c)} start in ${c.firstYear}.`;
  if (raw > c.lastYear) return `Figures for ${countryInSentence(c)} run to ${c.lastYear}.`;
  return undefined;
}

export function InflationTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const locale = useToolLocale();
  const region = useVisitorRegion();

  const series = findCpiCountry(s.c) ?? findCpiCountry(region) ?? findCpiCountry(FALLBACK_COUNTRY)!;
  const currency = series.currency;
  const symbol = currencySymbol(currency, locale);
  const money = (v: number) => formatCurrency(v, currency, locale);
  const pc = (v: number) => formatPercent(v, locale, 2);

  const rawFrom = parseYear(s.f);
  const rawTo = s.t === "" ? null : parseYear(s.t);
  const fromYear = clampYear(rawFrom, series, DEFAULT_FROM);
  const toYear = clampYear(rawTo, series, series.lastYear);

  const amount = readField(s.a, locale, {
    min: 0,
    max: 1e12,
    required: "Enter an amount.",
    range: amountRangeError,
  });

  /**
   * Any edit pins the auto-detected country into the URL, so a copied link
   * opens on the same country's prices for someone elsewhere.
   */
  const update = (patch: Partial<typeof DEFAULTS>) => set(s.c === "" ? { c: series.country, ...patch } : patch);

  const problem =
    (amount.error && `Amount: ${amount.error}`) ||
    (fromYear === toYear ? "Pick two different years to see how prices changed." : null);

  const result = problem
    ? null
    : adjustForInflation({ amount: amount.value!, fromYear, toYear, series });

  let copy: string | null = null;
  let body;
  if (!result) {
    body = <ResultEmpty>{problem ?? "There are no figures for those years — pick others."}</ResultEmpty>;
  } else {
    const rose = result.cumulativePercent >= 0;
    const typed = amountText(result.amount, currency, locale);
    const span = `${result.earlierYear}–${result.laterYear}`;
    copy =
      `${typed} in ${fromYear} is worth about ${money(result.value)} in ${toYear} in ${countryInSentence(series)}: ` +
      `prices ${rose ? "rose" : "fell"} ${pc(Math.abs(result.cumulativePercent))} over ${span} ` +
      `(${pc(result.averageAnnualPercent!)} a year on average). Source: World Bank consumer price index.`;
    body = (
      <>
        <ResultHero
          label={`${typed} from ${fromYear}, in ${toYear} money`}
          value={money(result.value)}
          sub={`What cost ${typed} in ${fromYear} cost about ${money(result.value)} in ${toYear} in ${countryInSentence(series)}.`}
        />
        <ResultRows
          rows={[
            {
              label: `Cumulative inflation, ${span}`,
              value: `${rose ? "+" : "−"}${pc(Math.abs(result.cumulativePercent))}`,
            },
            { label: "Average inflation per year", value: pc(result.averageAnnualPercent!) },
            {
              label: result.purchasingPowerLossPercent >= 0 ? "Buying power lost" : "Buying power gained",
              value: pc(Math.abs(result.purchasingPowerLossPercent)),
            },
          ]}
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Put the other way, {typed} in {toYear} had the buying power of{" "}
          <span className="font-medium text-foreground tabular-nums">{money(result.reverseValue)}</span> in{" "}
          {fromYear}.
        </p>
      </>
    );
  }

  const years = yearOptions(series);

  return (
    <div>
      <ToolLayout>
        <ToolPanel>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Amount"
              className="sm:col-span-2"
              prefix={symbol}
              value={s.a}
              onChange={(v) => update({ a: v })}
              error={amount.error}
            />
            <SelectField
              label="Country"
              className="sm:col-span-2"
              value={series.country}
              onChange={(v) => set({ c: v })}
              options={COUNTRY_OPTIONS}
              hint={
                series.note
                  ? `Prices from ${series.firstYear} to ${series.lastYear}. ${series.note}`
                  : `Prices from ${series.firstYear} to ${series.lastYear}, in ${currency}.`
              }
            />
            <SelectField
              label="From year"
              value={String(fromYear)}
              onChange={(v) => update({ f: v })}
              options={years}
              hint={rangeHint(rawFrom, series)}
            />
            <SelectField
              label="To year"
              value={String(toYear)}
              onChange={(v) => update({ t: v })}
              options={years}
              hint={rangeHint(rawTo, series) ?? (toYear === series.lastYear ? "The latest full year published." : undefined)}
            />
          </div>
        </ToolPanel>

        <ToolPanel sticky className="space-y-5">
          {body}
          <ResultActions copy={copy} onReset={reset} withCurrency={false} />
        </ToolPanel>
      </ToolLayout>

      <PricePath result={result} series={series} locale={locale} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The year-by-year panel: chart, table and the data's source
// ---------------------------------------------------------------------------

const chartPlaceholder = <Skeleton className="h-64 w-full rounded-xl" />;

const CpiChart = dynamic(() => import("./cpi-chart").then((m) => m.CpiChart), {
  ssr: false,
  loading: () => chartPlaceholder,
});

/**
 * The chart, fetched and mounted only once it scrolls near the viewport — the
 * same pattern as `LazyGrowthChart`. The placeholder reserves its height.
 */
function LazyCpiChart(props: { path: InflationResult["path"]; currency: string; locale: string }) {
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
    <div ref={ref} className="h-64" aria-hidden>
      {visible ? <CpiChart {...props} /> : chartPlaceholder}
    </div>
  );
}

const fetchedOn = new Date(`${CPI_FETCHED_ON}T00:00:00Z`);

/** A table figure with a fixed number of decimals, so the column lines up ("8.0%", not "8%"). */
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

function PricePath({
  result,
  series,
  locale,
}: {
  result: InflationResult | null;
  series: CpiCountry;
  locale: string;
}) {
  const money = (v: number) => formatCurrency(v, series.currency, locale);
  const typed = result ? amountText(result.amount, series.currency, locale) : "";
  const retrieved = fetchedOn.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <ToolPanel as="section" className="mt-4 lg:mt-6">
      <h2 className="text-lg font-semibold tracking-tight">
        {result
          ? `How prices moved in ${countryInSentence(series)}, ${result.earlierYear}–${result.laterYear}`
          : `How prices moved in ${countryInSentence(series)}`}
      </h2>

      {!result ? (
        <div className="mt-4">
          <ResultEmpty>Fix the inputs above to see prices year by year.</ResultEmpty>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {typed} from {result.fromYear}, in each year&apos;s money.
          </p>
          <div className="mt-4">
            <LazyCpiChart path={result.path} currency={series.currency} locale={locale} />
          </div>

          <details className="group mt-6 border-t pt-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
              <ChevronDown
                aria-hidden
                className="size-4 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0"
              />
              Year-by-year table
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[26rem] text-sm tabular-nums">
                <caption className="sr-only">
                  The consumer price index and what {typed} from {result.fromYear} is worth in
                  each year from {result.earlierYear} to {result.laterYear}
                </caption>
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 text-left font-medium">
                      Year
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Price index
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Inflation that year
                    </th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium">
                      {typed} from {result.fromYear}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.path.map((p) => (
                    <tr key={p.year} className="border-t">
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">
                        {p.year}
                      </th>
                      <td className="px-3 py-2 text-right">{fixed(p.index, locale, 2)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {p.yearlyPercent === null ? "—" : `${fixed(p.yearlyPercent, locale, 1)}%`}
                      </td>
                      <td className="py-2 pl-3 text-right font-medium">{money(p.value)}</td>
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
        <a href={series.source} className="underline underline-offset-2 hover:text-foreground">
          World Bank, consumer price index (2010 = 100)
        </a>
        , licensed{" "}
        <a href={CPI_SOURCE.licenseUrl} className="underline underline-offset-2 hover:text-foreground" rel="license">
          {CPI_SOURCE.license}
        </a>
        . Figures for {countryInSentence(series)} run to {series.lastYear}, the last full year the World Bank has
        published; retrieved {retrieved}.
      </p>
    </ToolPanel>
  );
}
