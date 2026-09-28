"use client";

import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LazyGrowthChart } from "@/components/tools/lazy-growth-chart";
import { ResultEmpty, ToolPanel } from "@/components/tools/result";
import { formatCurrency, formatNumber } from "@/lib/tools/format";
import { scheduleCsv, type GrowthResult } from "@/lib/tools/growth";
import { cn } from "@/lib/utils";

/**
 * The pieces the compound interest and SIP calculators share around the
 * growth engine: the invested-vs-growth bar in the result, and the full-width
 * year-by-year panel (chart, table, CSV).
 */

export type GrowthLabels = {
  /** What went in — "Contributed", "Invested". */
  contributed: string;
  /** What it earned — "Interest", "Returns". */
  interest: string;
  /** The total — "Balance", "Value". */
  balance: string;
};

/** Neutral grey for money put in; emerald for what it earned. Shared by chart, legend and bar. */
const SWATCH = {
  contributed: "bg-muted-foreground/45",
  interest: "bg-emerald-600 dark:bg-emerald-500",
};

/** How much of the total is money put in vs growth, as one horizontal bar. */
export function GrowthSplitBar({
  contributed,
  interest,
  labels,
  locale,
}: {
  contributed: number;
  interest: number;
  labels: GrowthLabels;
  locale: string;
}) {
  // A loss has no "growth" share to draw; the rows under it spell it out.
  const total = contributed + interest;
  if (interest < 0 || total <= 0) return null;
  const growth = (interest / total) * 100;
  const pct = (v: number) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(v / 100);

  return (
    <div>
      <div
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`${labels.contributed} ${pct(100 - growth)}, ${labels.interest} ${pct(growth)}`}
      >
        {growth < 100 && <div className={SWATCH.contributed} style={{ width: `${100 - growth}%` }} />}
        {growth > 0 && <div className={SWATCH.interest} style={{ width: `${growth}%` }} />}
      </div>
      <div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground tabular-nums" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", SWATCH.contributed)} />
          {labels.contributed} {pct(100 - growth)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", SWATCH.interest)} />
          {labels.interest} {pct(growth)}
        </span>
      </div>
    </div>
  );
}

/**
 * The full-width panel under the calculator: a stacked chart of what went in
 * vs what it earned, and the same numbers as a table that can be downloaded.
 * The table is server-rendered with the defaults, so it is also what crawlers
 * and screen readers get in place of the chart.
 */
export function GrowthBreakdown({
  result,
  currency,
  locale,
  labels,
  filename,
  empty,
}: {
  result: GrowthResult | null;
  currency: string;
  locale: string;
  labels: GrowthLabels;
  /** Download name, e.g. `sip-schedule.csv`. */
  filename: string;
  /** Shown instead of the chart and table while an input is invalid. */
  empty: string;
}) {
  const money = (v: number) => formatCurrency(v, currency, locale, { decimals: 0 });
  const withReal = result?.real != null;

  const download = () => {
    if (!result) return;
    const csv = scheduleCsv(result.rows, {
      currency,
      contributedLabel: labels.contributed,
      interestLabel: labels.interest,
      balanceLabel: labels.balance,
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <ToolPanel as="section" className="mt-4 lg:mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Year by year</h2>
        {result && (
          <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={download}>
            <Download /> Download CSV
          </Button>
        )}
      </div>

      {!result ? (
        <div className="mt-4">
          <ResultEmpty>{empty}</ResultEmpty>
        </div>
      ) : (
        <>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2.5 rounded-sm", SWATCH.contributed)} />
              {labels.contributed}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2.5 rounded-sm", SWATCH.interest)} />
              {labels.interest}
            </li>
          </ul>

          <div className="mt-3">
            <LazyGrowthChart
              rows={result.rows}
              currency={currency}
              locale={locale}
              labels={{ contributed: labels.contributed, interest: labels.interest }}
            />
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
                      Year
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {labels.contributed}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {labels.interest}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {labels.balance}
                    </th>
                    {withReal && (
                      <th scope="col" className="py-2 pl-3 text-right font-medium">
                        In today&apos;s money
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.months} className="border-t">
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">
                        {formatNumber(row.months / 12, locale, 2)}
                      </th>
                      <td className="px-3 py-2 text-right">{money(row.contributed)}</td>
                      <td className="px-3 py-2 text-right">{money(row.interest)}</td>
                      <td className="px-3 py-2 text-right font-medium">{money(row.balance)}</td>
                      {withReal && (
                        <td className="py-2 pl-3 text-right text-muted-foreground">
                          {money(row.real ?? 0)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </ToolPanel>
  );
}
