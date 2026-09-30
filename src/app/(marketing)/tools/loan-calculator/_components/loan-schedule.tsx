"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/tools/fields";
import { ResultEmpty, ToolPanel } from "@/components/tools/result";
import { formatCurrency } from "@/lib/tools/format";
import {
  monthlyCsv,
  yearlyCsv,
  yearlySchedule,
  type LoanPlan,
  type MonthIndex,
} from "@/lib/tools/loan";
import { cn } from "@/lib/utils";
import type { BalancePoint } from "./balance-chart";
import { LazyBalanceChart } from "./lazy-balance-chart";
import { monthLabel } from "./month-label";

/**
 * The full-width panel under the calculator: the balance falling over time,
 * and the amortization schedule itself — by year or by month — as a table
 * that downloads as CSV. The yearly table is server-rendered with the
 * defaults, so it is also what crawlers and screen readers get in place of
 * the chart.
 */

type View = "yearly" | "monthly";

const VIEW_OPTIONS = [
  { value: "yearly", label: "Yearly" },
  { value: "monthly", label: "Monthly" },
] as const;

export function LoanSchedule({
  plan,
  start,
  currency,
  locale,
  decimals,
  empty,
}: {
  plan: LoanPlan | null;
  /** Month of the first payment; null until the browser knows today's date. */
  start: MonthIndex | null;
  currency: string;
  locale: string;
  decimals: number;
  empty: string;
}) {
  const [view, setView] = useState<View>("yearly");
  const money = (v: number) => formatCurrency(v, currency, locale);

  const years = plan ? yearlySchedule(plan.rows, start, decimals) : [];
  const withPrepay = (plan?.totalPrepaid ?? 0) > 0;

  const download = () => {
    if (!plan) return;
    const csv =
      view === "yearly"
        ? yearlyCsv(years, { currency, calendar: start !== null, decimals })
        : monthlyCsv(plan.rows, { currency, start, decimals });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `loan-amortization-schedule-${view}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <ToolPanel as="section" className="mt-4 lg:mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Amortization schedule</h2>
        {plan && (
          <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={download}>
            <Download /> Download CSV
          </Button>
        )}
      </div>

      {!plan ? (
        <div className="mt-4">
          <ResultEmpty>{empty}</ResultEmpty>
        </div>
      ) : (
        <>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-foreground" />
              Balance left
            </li>
            {withPrepay && (
              <li className="inline-flex items-center gap-1.5">
                <span aria-hidden className="w-3.5 border-t-2 border-dashed border-muted-foreground" />
                Without prepayments
              </li>
            )}
          </ul>

          <div className="mt-3">
            <LazyBalanceChart
              points={balancePoints(plan, withPrepay)}
              start={start}
              withBaseline={withPrepay}
              currency={currency}
              locale={locale}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              {view === "yearly"
                ? start === null
                  ? "Totals for each year of the loan."
                  : "Totals for each calendar year."
                : "Every payment, split into interest and principal."}
            </p>
            <Segmented
              label="Show the schedule"
              hideLabel
              className="w-full sm:w-56"
              value={view}
              onChange={(v) => setView(v === "monthly" ? "monthly" : "yearly")}
              options={VIEW_OPTIONS}
            />
          </div>

          <div
            className={cn(
              "mt-3 overflow-x-auto",
              view === "monthly" && "max-h-[32rem] overflow-y-auto overscroll-contain",
            )}
            // Scrollable regions need to be reachable by keyboard.
            tabIndex={view === "monthly" ? 0 : undefined}
            role={view === "monthly" ? "region" : undefined}
            aria-label={view === "monthly" ? "Monthly schedule" : undefined}
          >
            <table className="w-full min-w-[34rem] text-sm tabular-nums">
              <caption className="sr-only">
                {view === "yearly" ? "Yearly" : "Monthly"} loan amortization schedule: payments, principal,
                interest{withPrepay ? ", prepayments" : ""} and the balance left
              </caption>
              <thead className={cn(view === "monthly" && "sticky top-0 z-10 bg-card")}>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">
                    {view === "yearly" ? "Year" : "Month"}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {view === "yearly" ? "Payments" : "Payment"}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Principal
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Interest
                  </th>
                  {withPrepay && (
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Prepaid
                    </th>
                  )}
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {view === "yearly"
                  ? years.map((y) => (
                      <tr key={y.year} className="border-t">
                        <th scope="row" className="py-2 pr-3 text-left font-normal whitespace-nowrap text-muted-foreground">
                          {y.year}
                          {start !== null && y.toMonth - y.fromMonth < 11 && (
                            <span className="ml-1.5 text-xs">
                              ({y.toMonth - y.fromMonth + 1} mo)
                            </span>
                          )}
                        </th>
                        <td className="px-3 py-2 text-right">{money(y.payment)}</td>
                        <td className="px-3 py-2 text-right">{money(y.principal)}</td>
                        <td className="px-3 py-2 text-right">{money(y.interest)}</td>
                        {withPrepay && (
                          <td className="px-3 py-2 text-right">{y.prepayment > 0 ? money(y.prepayment) : "—"}</td>
                        )}
                        <td className="py-2 pl-3 text-right font-medium">{money(y.balance)}</td>
                      </tr>
                    ))
                  : plan.rows.map((row) => (
                      <tr key={row.month} className="border-t">
                        <th scope="row" className="py-2 pr-3 text-left font-normal whitespace-nowrap text-muted-foreground">
                          {row.month}
                          {start !== null && (
                            <span className="ml-1.5 text-xs">{monthLabel(start + row.month - 1, locale)}</span>
                          )}
                        </th>
                        <td className="px-3 py-2 text-right">{money(row.payment)}</td>
                        <td className="px-3 py-2 text-right">{money(row.principal)}</td>
                        <td className="px-3 py-2 text-right">{money(row.interest)}</td>
                        {withPrepay && (
                          <td className="px-3 py-2 text-right">{row.prepayment > 0 ? money(row.prepayment) : "—"}</td>
                        )}
                        <td className="py-2 pl-3 text-right font-medium">{money(row.balance)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ToolPanel>
  );
}

/** One point per month — the balance after each payment — plus the starting balance. */
function balancePoints(plan: LoanPlan, withBaseline: boolean): BalancePoint[] {
  const principal = plan.baseline.rows[0]
    ? plan.baseline.rows[0].balance + plan.baseline.rows[0].principal
    : 0;
  const last = Math.max(plan.months, withBaseline ? plan.baseline.months : 0);
  const points: BalancePoint[] = [{ m: 0, balance: principal, baseline: withBaseline ? principal : null }];
  for (let m = 1; m <= last; m++) {
    points.push({
      m,
      balance: m <= plan.months ? plan.rows[m - 1]!.balance : null,
      baseline: withBaseline ? (plan.baseline.rows[m - 1]?.balance ?? null) : null,
    });
  }
  return points;
}
