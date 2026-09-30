"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { CurrencyField, MoreOptions, NumberField } from "@/components/tools/fields";
import {
  ResultActions,
  ResultEmpty,
  ResultHero,
  ResultRows,
  ToolLayout,
  ToolPanel,
} from "@/components/tools/result";
import { useToolCurrency, useToolLocale, useUrlState } from "@/components/tools/tool-state";
import {
  formatDuration,
  minimumPayment,
  monthlyInterest,
  paymentForMonths,
  simulatePayoff,
  yearlySummary,
  type MinimumRule,
  type Payoff,
} from "@/lib/tools/card-payoff";
import { currencySymbol, formatCurrency, formatPercent, parseNumber } from "@/lib/tools/format";
import { cn } from "@/lib/utils";


// Short, stable query keys — they're in every shared link.
const DEFAULTS = {
  b: "5000", // balance
  r: "22", // APR %
  p: "200", // your monthly payment
  mp: "1", // card minimum: % of balance
  mf: "25", // card minimum: floor
  mi: "1", // card minimum adds the month's interest
};

const noopSubscribe = () => () => {};

/**
 * The current month as `year × 12 + month`, or null on the server — a payoff
 * date needs "now", and reading it during the static render would differ from
 * the browser's. A number, so the snapshot is stable between reads.
 */
function useCurrentMonth(): number | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      const d = new Date();
      return d.getFullYear() * 12 + d.getMonth();
    },
    () => null,
  );
}

function monthLabel(current: number, monthsAhead: number, locale: string): string {
  const index = current + monthsAhead;
  const date = new Date(Math.floor(index / 12), index % 12, 1);
  try {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
  } catch {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
}

export function CardPayoffTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency] = useToolCurrency();
  const locale = useToolLocale();
  const currentMonth = useCurrentMonth();
  const n = (v: string) => parseNumber(v, locale);
  const money = (v: number) => formatCurrency(v, currency, locale);
  const symbol = currencySymbol(currency, locale);

  const balance = n(s.b);
  const apr = n(s.r);
  const payment = n(s.p);
  const minPct = n(s.mp);
  const minFloor = n(s.mf);
  const plusInterest = s.mi !== "0";

  const balanceError = balance !== null && balance <= 0 ? "Enter what you owe — more than zero." : null;
  const aprError = apr !== null && apr < 0 ? "The rate can't be negative." : null;
  const paymentError = payment !== null && payment <= 0 ? "Enter a payment above zero." : null;
  const pctError = minPct !== null && (minPct < 0 || minPct > 100) ? "Between 0 and 100." : null;
  const floorError = minFloor !== null && minFloor < 0 ? "Can't be negative." : null;

  const ready =
    balance !== null && apr !== null && payment !== null && !balanceError && !aprError && !paymentError;
  const rule: MinimumRule | null =
    minPct !== null && minFloor !== null && !pctError && !floorError
      ? { percent: minPct, floor: minFloor, plusInterest }
      : null;

  const yours = ready ? simulatePayoff(balance, apr, { kind: "fixed", amount: payment }) : null;
  const minimum = ready && rule ? simulatePayoff(balance, apr, { kind: "minimum", rule }) : null;
  // What the card asks for this month — shown even before a payment is typed.
  const cardMinimumNow =
    balance !== null && balance > 0 && apr !== null && apr >= 0 && rule
      ? minimumPayment(
          balance + monthlyInterest(balance, apr),
          monthlyInterest(balance, apr),
          rule,
        )
      : null;
  const inThreeYears = ready ? paymentForMonths(balance, apr, 36) : null;

  const copy = (() => {
    if (!ready || yours?.status !== "paid") return null;
    let text = `Paying ${money(payment)} a month clears a ${money(balance)} card balance at ${formatPercent(apr, locale)} APR in ${formatDuration(yours.months)}, with ${money(yours.totalInterest)} of interest.`;
    if (minimum?.status === "paid") {
      text += ` Minimum payments only would take ${formatDuration(minimum.months)} and cost ${money(minimum.totalInterest)} in interest.`;
    }
    return text;
  })();

  return (
    <div className="space-y-4">
      <ToolLayout>
        <ToolPanel className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Card balance"
              prefix={symbol}
              value={s.b}
              onChange={(v) => set({ b: v })}
              error={balanceError}
            />
            <NumberField
              label="Interest rate (APR)"
              suffix="% a year"
              value={s.r}
              onChange={(v) => set({ r: v })}
              error={aprError}
            />
            <NumberField
              label="Monthly payment"
              prefix={symbol}
              value={s.p}
              onChange={(v) => set({ p: v })}
              error={paymentError}
              hint={
                cardMinimumNow !== null && !paymentError
                  ? `Your card's minimum this month: ${money(cardMinimumNow)}`
                  : undefined
              }
            />
            <CurrencyField />
          </div>

          <MoreOptions summary="your card's minimum payment" bodyClassName="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Minimum payment"
                  suffix="% of balance"
                  value={s.mp}
                  onChange={(v) => set({ mp: v })}
                  error={pctError}
                />
                <NumberField
                  label="But never less than"
                  prefix={symbol}
                  value={s.mf}
                  onChange={(v) => set({ mf: v })}
                  error={floorError}
                />
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={plusInterest}
                  onChange={(e) => set({ mi: e.target.checked ? "1" : "0" })}
                  className="size-5 shrink-0 accent-primary"
                />
                <span>
                  Minimum includes interest{" "}
                  <span className="text-muted-foreground">(“1% plus interest”)</span>
                </span>
              </label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                The rule is in your card&apos;s terms, and your statement shows this month&apos;s
                minimum. Many US cards ask for 1% of the balance plus interest, with a floor of
                25–40; UK cards must cover at least the interest plus 1%; others ask for a flat
                2–5% of the balance.
              </p>
          </MoreOptions>
        </ToolPanel>

        <ToolPanel sticky className="space-y-5">
          {!ready || yours === null ? (
            <ResultEmpty>
              Enter your card balance, its interest rate and what you&apos;ll pay each month to see
              how long it takes to clear.
            </ResultEmpty>
          ) : (
            <>
              <ResultHero
                label={`Time to pay off at ${money(payment)} a month`}
                value={yours.status === "paid" ? formatDuration(yours.months) : "Never"}
                sub={
                  yours.status === "paid"
                    ? `${
                        currentMonth === null
                          ? ""
                          : `Paid off by ${monthLabel(currentMonth, yours.months, locale)}: `
                      }${yours.months} monthly ${yours.months === 1 ? "payment" : "payments"}, if nothing new goes on the card.`
                    : yours.reason === "interest"
                      ? "At this payment the interest adds up faster than you pay it off, so the balance never falls."
                      : "At this payment it would take more than 100 years."
                }
              />

              {yours.status === "paid" ? (
                <ResultRows
                  rows={[
                    { label: "Total interest", value: money(yours.totalInterest) },
                    { label: "Total paid", value: money(yours.totalPaid), strong: true },
                  ]}
                />
              ) : (
                <Warning>
                  {yours.reason === "interest"
                    ? `This month's interest is ${money(yours.firstInterest)}. Pay more than that and the balance starts to fall`
                    : `You're only just above this month's interest of ${money(yours.firstInterest)}`}
                  {inThreeYears !== null && (
                    <>
                      {" "}
                      — <strong className="font-medium text-foreground">{money(inThreeYears)}</strong> a
                      month clears it in 3 years
                    </>
                  )}
                  .
                </Warning>
              )}

              {cardMinimumNow !== null && payment < cardMinimumNow - 0.005 && (
                <Warning>
                  That&apos;s below your card&apos;s minimum of {money(cardMinimumNow)} this month —
                  the card will ask for at least that.
                </Warning>
              )}

              {minimum !== null ? (
                <Comparison minimum={minimum} yours={yours} payment={payment} money={money} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Fill in your card&apos;s minimum payment rule under More options to compare it with
                  paying only the minimum.
                </p>
              )}

              <ResultActions copy={copy} onReset={reset} />
            </>
          )}
        </ToolPanel>
      </ToolLayout>

      {yours?.status === "paid" && yours.months > 1 && (
        <ToolPanel>
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
              <h2 className="text-base font-medium">Year-by-year balance</h2>
              <ChevronDown
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[26rem] text-sm tabular-nums">
                <caption className="sr-only">
                  What you pay, the interest charged and the balance left each year at{" "}
                  {money(payment!)} a month
                </caption>
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Year
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Paid
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Interest
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Balance left
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {yearlySummary(yours.schedule).map((y) => (
                    <tr key={y.year}>
                      <th scope="row" className="py-2 pr-3 text-left font-normal">
                        {y.year}
                      </th>
                      <td className="py-2 pr-3 text-right">{money(y.paid)}</td>
                      <td className="py-2 pr-3 text-right">{money(y.interest)}</td>
                      <td className="py-2 text-right">{money(y.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </ToolPanel>
      )}
    </div>
  );
}

/** A plain caution line — a problem with the plan, not an error in the form. */
function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2.5 rounded-xl border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground" />
      <span>{children}</span>
    </p>
  );
}

/**
 * "Minimum only" next to "your payment" — the trap made visible. The minimum
 * shrinks as the balance does, so most of each payment ends up being interest.
 */
function Comparison({
  minimum,
  yours,
  payment,
  money,
}: {
  minimum: Payoff;
  yours: Payoff;
  payment: number;
  money: (v: number) => string;
}) {
  const bothPaid = minimum.status === "paid" && yours.status === "paid";
  const interestSaved = bothPaid ? minimum.totalInterest - yours.totalInterest : 0;
  const monthsSaved = bothPaid ? minimum.months - yours.months : 0;

  let verdict: ReactNode = null;
  if (bothPaid && interestSaved > 0.005) {
    verdict = (
      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
        Paying {money(payment)} a month saves you {money(interestSaved)} in interest
        {monthsSaved > 0 ? ` and ${formatDuration(monthsSaved)}` : ""}.
      </p>
    );
  } else if (bothPaid) {
    verdict = (
      <p className="text-sm text-muted-foreground">
        Paying only the minimum clears it sooner than {money(payment)} a month — pay at least the
        minimum.
      </p>
    );
  } else if (minimum.status === "never" && yours.status === "paid") {
    verdict = (
      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
        Minimum payments alone would never clear this balance — your payment clears it in{" "}
        {formatDuration(yours.months)}.
      </p>
    );
  }

  return (
    <section aria-labelledby="payoff-compare" className="space-y-3">
      <h3 id="payoff-compare" className="text-sm font-medium">
        Minimum payments vs your payment
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <PlanCard
          title="Minimum only"
          startsAt={`From ${money(minimum.firstPayment)} a month`}
          result={minimum}
          money={money}
        />
        <PlanCard
          title="Your payment"
          startsAt={`${money(payment)} a month`}
          result={yours}
          money={money}
          highlight
        />
      </div>
      {verdict}
    </section>
  );
}

function PlanCard({
  title,
  startsAt,
  result,
  money,
  highlight,
}: {
  title: string;
  startsAt: string;
  result: Payoff;
  money: (v: number) => string;
  highlight?: boolean;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border p-3", highlight && "border-foreground/30 bg-muted/40")}>
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <p className="mt-0.5 text-xs break-words text-muted-foreground tabular-nums">{startsAt}</p>
      <p className="mt-2 text-base leading-snug font-semibold tabular-nums">
        {result.status === "paid" ? formatDuration(result.months) : "Never paid off"}
      </p>
      <p className="mt-1 text-xs break-words text-muted-foreground tabular-nums">
        {result.status === "paid"
          ? `${money(result.totalInterest)} interest`
          : "Interest keeps up with the payment"}
      </p>
    </div>
  );
}
