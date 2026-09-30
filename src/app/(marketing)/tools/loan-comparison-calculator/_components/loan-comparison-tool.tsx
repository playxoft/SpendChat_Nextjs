"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyField, NumberField, Segmented } from "@/components/tools/fields";
import { ResultActions, ResultEmpty, ResultHero, ToolPanel } from "@/components/tools/result";
import { useToolCurrency, useToolLocale, useUrlState } from "@/components/tools/tool-state";
import { getCurrency, isSupportedCurrency } from "@/lib/currencies";
import { formatAmountInput } from "@/lib/parse-amount";
import { formatDuration } from "@/lib/tools/card-payoff";
import { currencySymbol, formatCurrency, formatPercent, parseNumber } from "@/lib/tools/format";
import { LOAN_LIMITS, cheapestOffer, offerCost, type LoanOffer, type OfferCost } from "@/lib/tools/loan";
import { cn } from "@/lib/utils";

/**
 * Two or three loan offers side by side, with the fees counted in. Each offer
 * shows its own EMI and true cost right under its inputs (so a phone, where
 * the offers stack, never needs scrolling back and forth); the verdict and a
 * cost bar per offer sit underneath.
 */

// Short, stable keys — they're in every shared link. Offer k uses a{k}, r{k}…
// The defaults are the case this tool exists for: the lower rate loses once
// its bigger processing fee is counted.
const DEFAULTS = {
  n: "2", // offers shown: 2 or 3
  u: "y", // tenures in years (y) or months (m), for every offer
  a1: "500000", // amount
  r1: "10.5", // rate, % a year
  t1: "5", // tenure
  f1: "2", // processing fee
  k1: "p", // … as a percentage (p) or a fixed amount (f)
  o1: "2000", // other charges
  a2: "500000",
  r2: "11",
  t2: "5",
  f2: "0.5",
  k2: "p",
  o2: "",
  a3: "",
  r3: "",
  t3: "",
  f3: "",
  k3: "p",
  o3: "",
};

type State = typeof DEFAULTS;
type Slot = 1 | 2 | 3;
const SLOTS: Slot[] = [1, 2, 3];
const NAMES = { 1: "Offer A", 2: "Offer B", 3: "Offer C" } as const;

const key = <P extends "a" | "r" | "t" | "f" | "k" | "o">(p: P, k: Slot) => `${p}${k}` as `${P}${Slot}` & keyof State;

type Parsed = {
  slot: Slot;
  name: string;
  errors: Partial<Record<"amount" | "rate" | "tenure" | "fee" | "other", string>>;
  /** Null while a required field is empty or anything is invalid. */
  offer: LoanOffer | null;
  /** Why there's no result yet, in words — shown in place of the result. */
  missing: string | null;
};

function parseOffer(s: State, slot: Slot, locale: string, decimals: number): Parsed {
  const n = (v: string) => parseNumber(v, locale);
  const raw = {
    amount: s[key("a", slot)],
    rate: s[key("r", slot)],
    tenure: s[key("t", slot)],
    fee: s[key("f", slot)],
    other: s[key("o", slot)],
  };
  const errors: Parsed["errors"] = {};
  const NaNish = "That doesn't look like a number.";

  const amount = n(raw.amount);
  if (raw.amount.trim() && amount === null) errors.amount = NaNish;
  // Less than the smallest coin rounds to nothing to lend, so it counts as zero.
  else if (amount !== null && (Math.round(amount * 10 ** decimals) <= 0 || amount > LOAN_LIMITS.maxAmount))
    errors.amount = amount <= LOAN_LIMITS.maxAmount ? "Enter an amount above zero." : "That's more than this calculator can handle.";

  const rate = n(raw.rate);
  if (raw.rate.trim() && rate === null) errors.rate = NaNish;
  else if (rate !== null && (rate < 0 || rate > LOAN_LIMITS.maxRate)) errors.rate = "Between 0% and 100%.";

  const tenure = n(raw.tenure);
  const unit = s.u === "m" ? "m" : "y";
  const months = tenure === null ? null : unit === "m" ? tenure : Math.round(tenure * 12);
  if (raw.tenure.trim() && tenure === null) errors.tenure = NaNish;
  else if (tenure !== null && unit === "m" && !Number.isInteger(tenure)) errors.tenure = "Whole months.";
  else if (months !== null && (months < 1 || months > LOAN_LIMITS.maxMonths))
    errors.tenure = months < 1 ? "At least 1 month." : "Up to 50 years.";

  const feeKind = s[key("k", slot)] === "f" ? "fixed" : "percent";
  const fee = raw.fee.trim() ? n(raw.fee) : 0;
  if (fee === null) errors.fee = NaNish;
  else if (fee < 0) errors.fee = "Can't be negative.";
  else if (feeKind === "percent" && fee > 100) errors.fee = "Up to 100%.";
  else if (fee > LOAN_LIMITS.maxAmount) errors.fee = "That's more than this calculator can handle.";

  const other = raw.other.trim() ? n(raw.other) : 0;
  if (other === null) errors.other = NaNish;
  else if (other < 0) errors.other = "Can't be negative.";
  else if (other > LOAN_LIMITS.maxAmount) errors.other = "That's more than this calculator can handle.";

  const blanks = [
    amount === null && !errors.amount ? "amount" : null,
    rate === null && !errors.rate ? "rate" : null,
    tenure === null && !errors.tenure ? "tenure" : null,
  ].filter(Boolean);
  const hasErrors = Object.keys(errors).length > 0;
  const name = NAMES[slot];

  return {
    slot,
    name,
    errors,
    offer:
      hasErrors || blanks.length > 0
        ? null
        : {
            amount: amount!,
            ratePercent: rate!,
            months: months!,
            processingFee: { kind: feeKind, value: fee! },
            otherCharges: other!,
          },
    missing: hasErrors
      ? `Fix the highlighted ${Object.keys(errors).length === 1 ? "field" : "fields"} to see this offer's cost.`
      : blanks.length > 0
        ? `Enter the ${listWords(blanks as string[])} to see what ${name} costs.`
        : null,
  };
}

function listWords(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

export function LoanComparisonTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency] = useToolCurrency();
  const locale = useToolLocale();
  const symbol = currencySymbol(currency, locale);
  const decimals = isSupportedCurrency(currency) ? getCurrency(currency).decimals : 2;
  const money = (v: number) => formatCurrency(v, currency, locale);
  const typed = (v: number) => formatCurrency(v, currency, locale, Number.isInteger(v) ? { decimals: 0 } : {});
  const pc = (v: number) => formatPercent(v, locale, 2);

  const count = s.n === "3" ? 3 : 2;
  const unit = s.u === "m" ? "m" : "y";
  const shown = SLOTS.slice(0, count);
  const parsed = shown.map((slot) => parseOffer(s, slot, locale, decimals));
  const costs: (OfferCost | null)[] = parsed.map((p) => (p.offer ? offerCost(p.offer, decimals) : null));
  const best = cheapestOffer(costs, decimals);

  const setUnit = (next: string) => {
    if (next === unit) return;
    // Keep every loan the same length: 5 years becomes 60 months, and back.
    const patch: Partial<State> = { u: next };
    for (const slot of SLOTS) {
      const v = parseNumber(s[key("t", slot)], locale);
      if (v === null) continue;
      patch[key("t", slot)] = formatAmountInput(next === "m" ? Math.round(v * 12) : v / 12, locale, 2);
    }
    set(patch);
  };

  const addThird = () =>
    set({
      n: "3",
      // Start from Offer A's amount and tenure — usually the same loan, at another lender.
      a3: s.a3 || s.a1,
      t3: s.t3 || s.t1,
    });
  const removeThird = () => set({ n: "2", a3: "", r3: "", t3: "", f3: "", k3: "p", o3: "" });

  // --- The verdict -----------------------------------------------------------
  const valid = parsed.flatMap((p, i) => (p.offer && costs[i] ? [{ ...p, offer: p.offer, cost: costs[i]! }] : []));
  const winner = best && !best.tie ? valid.find((v) => v.slot === parsed[best.index]!.slot)! : null;
  const others = winner ? valid.filter((v) => v.slot !== winner.slot) : [];
  const maxCost = Math.max(0, ...valid.map((v) => v.cost.totalCost));

  let explanation: string | null = null;
  if (winner) {
    // The offer that *looks* best: the lowest quoted rate.
    const lowest = [...valid].sort((x, y) => x.offer.ratePercent - y.offer.ratePercent || x.slot - y.slot)[0]!;
    if (lowest.offer.ratePercent < winner.offer.ratePercent) {
      const extraInterest = winner.cost.totalInterest - lowest.cost.totalInterest;
      const extraFees = lowest.cost.fees - winner.cost.fees;
      if (extraInterest > 0) {
        explanation =
          `${lowest.name} has the lower rate (${pc(lowest.offer.ratePercent)} against ${pc(winner.offer.ratePercent)}), ` +
          `but it charges ${typed(extraFees)} more in fees — more than the ${money(extraInterest)} it saves in interest. ` +
          `So ${winner.name} costs less overall.`;
      } else {
        const why =
          winner.offer.months < lowest.offer.months
            ? "runs for a shorter time"
            : winner.offer.amount < lowest.offer.amount
              ? "lends less"
              : "is repaid differently";
        explanation = `${lowest.name} has the lower rate, but ${winner.name} ${why}, so it charges less interest in total.`;
      }
    } else {
      // The winner's rate is the lowest (or shares it); did anyone undercut it on fees?
      const cheaperFees = others.filter((o) => o.cost.fees < winner.cost.fees);
      explanation =
        cheaperFees.length === 0
          ? `${winner.name} has the lowest rate and no higher fees than the others, so it's cheapest on every count.`
          : `${listWords(cheaperFees.map((o) => o.name))} ${cheaperFees.length === 1 ? "charges" : "charge"} less in fees, ` +
            `but ${winner.name} saves more than the difference in interest.`;
    }
  }

  const sameAmounts = valid.every((v) => v.offer.amount === valid[0]?.offer.amount);
  const sameTenures = valid.every((v) => v.offer.months === valid[0]?.offer.months);

  const copy =
    valid.length >= 2
      ? `Comparing ${valid.length} loan offers, fees included: ` +
        valid
          .map(
            (v) =>
              `${v.name} (${typed(v.offer.amount)} at ${pc(v.offer.ratePercent)} for ${formatDuration(v.offer.months)}) — ` +
              `EMI ${money(v.cost.emi)}, total cost ${money(v.cost.totalCost)}`,
          )
          .join("; ") +
        "." +
        (winner
          ? ` Cheapest: ${winner.name}, ${others.map((o) => `${money(o.cost.totalCost - winner.cost.totalCost)} less than ${o.name}`).join(" and ")}.`
          : best?.tie
            ? " The cheapest offers cost the same."
            : "")
      : null;

  return (
    <div className="space-y-4">
      <ToolPanel>
        <div className="grid gap-4 sm:grid-cols-2">
          <CurrencyField />
          <Segmented label="Tenure in" value={unit} onChange={setUnit} options={UNIT_OPTIONS} />
        </div>
      </ToolPanel>

      {/* Cards stretch to the row's height, so an offer still being filled in
          is as tall as the ones showing results beside it. */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {parsed.map((p, i) => (
          <OfferCard
            key={p.slot}
            parsed={p}
            s={s}
            set={set}
            unit={unit}
            symbol={symbol}
            cost={costs[i] ?? null}
            status={
              !costs[i] || !best
                ? null
                : best.tie && Math.abs(costs[i]!.totalCost - costs[best.index]!.totalCost) < 1 / 10 ** decimals
                  ? { kind: "tie" }
                  : best.index === i
                    ? { kind: "cheapest" }
                    : { kind: "more", by: costs[i]!.totalCost - costs[best.index]!.totalCost }
            }
            money={money}
            pc={pc}
            onRemove={p.slot === 3 ? removeThird : undefined}
          />
        ))}
        {count === 2 && (
          <button
            type="button"
            onClick={addThird}
            className="flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-dashed p-4 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 md:col-span-2 lg:col-span-1 lg:self-stretch"
          >
            <Plus className="size-4" aria-hidden /> Add a third offer
          </button>
        )}
      </div>

      <ToolPanel as="section" className="space-y-5">
        <h2 className="text-lg font-semibold tracking-tight">Which loan is cheaper?</h2>
        {valid.length < 2 ? (
          <ResultEmpty>Fill in at least two offers to see which one costs less.</ResultEmpty>
        ) : (
          <>
            {winner ? (
              <ResultHero
                label="Cheapest overall, fees included"
                value={winner.name}
                sub={`${others
                  .map((o) => `${money(o.cost.totalCost - winner.cost.totalCost)} less than ${o.name}`)
                  .join(" and ")} over the life of the loan — ${money(winner.cost.totalCost)} in interest and fees.`}
              />
            ) : (
              <ResultHero
                label="Cheapest overall, fees included"
                value="A tie"
                sub="The cheapest offers cost the same once interest and fees are added up."
              />
            )}

            <CostBars
              rows={valid.map((v) => ({
                name: v.name,
                interest: v.cost.totalInterest,
                fees: v.cost.fees,
                total: v.cost.totalCost,
                best: winner?.slot === v.slot,
              }))}
              max={maxCost}
              money={money}
            />

            <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              {explanation && <p className="text-foreground">{explanation}</p>}
              <p>
                A lower rate only saves money if the interest it saves is bigger than any extra fees, so
                the offers are ranked on total cost — interest plus every fee — not on the rate.
              </p>
              {!sameAmounts && (
                <p>
                  The amounts differ, and a bigger loan always costs more in total. The effective rate on
                  each card compares them like for like.
                </p>
              )}
              {sameAmounts && !sameTenures && (
                <p>
                  The tenures differ: a longer loan has a lower EMI but runs up more interest. The
                  effective rate on each card compares the price of the money itself.
                </p>
              )}
            </div>
          </>
        )}
        <ResultActions copy={copy} onReset={reset} />
      </ToolPanel>
    </div>
  );
}

const UNIT_OPTIONS = [
  { value: "y", label: "Years" },
  { value: "m", label: "Months" },
] as const;

type Status = { kind: "cheapest" } | { kind: "tie" } | { kind: "more"; by: number } | null;

function OfferCard({
  parsed,
  s,
  set,
  unit,
  symbol,
  cost,
  status,
  money,
  pc,
  onRemove,
}: {
  parsed: Parsed;
  s: State;
  set: (patch: Partial<State>) => void;
  unit: "y" | "m";
  symbol: string;
  cost: OfferCost | null;
  status: Status;
  money: (v: number) => string;
  pc: (v: number) => string;
  onRemove?: () => void;
}) {
  const { slot, name, errors } = parsed;
  const k = s[key("k", slot)] === "f" ? "f" : "p";
  const headingId = `offer-${slot}`;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border bg-card p-4 sm:p-5",
        status?.kind === "cheapest" && "border-emerald-600/50 dark:border-emerald-500/50",
      )}
    >
      <div className="flex min-h-9 items-center justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold">
          {name}
        </h2>
        <div className="flex items-center gap-1">
          {status?.kind === "cheapest" && (
            <span className="rounded-full bg-emerald-600/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              Cheapest
            </span>
          )}
          {status?.kind === "tie" && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Joint cheapest
            </span>
          )}
          {status?.kind === "more" && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground tabular-nums">
              {money(status.by)} more
            </span>
          )}
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-lg text-muted-foreground"
              aria-label={`Remove ${name}`}
              onClick={onRemove}
            >
              <X />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-4">
        <NumberField
          label="Loan amount"
          prefix={symbol}
          value={s[key("a", slot)]}
          onChange={(v) => set({ [key("a", slot)]: v })}
          error={errors.amount}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Rate (per year)"
            suffix="%"
            value={s[key("r", slot)]}
            onChange={(v) => set({ [key("r", slot)]: v })}
            error={errors.rate}
          />
          <NumberField
            label={unit === "m" ? "Tenure (months)" : "Tenure (years)"}
            value={s[key("t", slot)]}
            onChange={(v) => set({ [key("t", slot)]: v })}
            error={errors.tenure}
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <NumberField
            label="Processing fee"
            prefix={k === "f" ? symbol : undefined}
            suffix={k === "p" ? "%" : undefined}
            value={s[key("f", slot)]}
            onChange={(v) => set({ [key("f", slot)]: v })}
            error={errors.fee}
            placeholder="0"
          />
          {/* Level with the input: the invisible legend takes the label's line. */}
          <Segmented
            label={`${name} processing fee as`}
            hideLabel
            className="mt-[1.625rem]"
            value={k}
            onChange={(v) => set({ [key("k", slot)]: v })}
            options={[
              { value: "p", label: "%" },
              { value: "f", label: symbol },
            ]}
          />
        </div>
        <NumberField
          label="Other charges"
          prefix={symbol}
          value={s[key("o", slot)]}
          onChange={(v) => set({ [key("o", slot)]: v })}
          error={errors.other}
          placeholder="0"
          hint="Legal, valuation, documentation — anything paid up front."
        />
      </div>

      <div className="mt-5 flex flex-1 flex-col border-t pt-4">
        {cost ? (
          <>
            <p className="text-xs text-muted-foreground">Monthly payment (EMI)</p>
            <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums break-words">{money(cost.emi)}</p>
            <dl className="mt-3 divide-y text-sm">
              <Row label="Total interest" value={money(cost.totalInterest)} />
              <Row label="Fees and charges" value={money(cost.fees)} />
              <Row label="Total cost" value={money(cost.totalCost)} strong />
              <Row
                label="Effective rate (APR)"
                value={cost.effectiveRate === null ? "—" : pc(cost.effectiveRate)}
              />
            </dl>
            {cost.effectiveRate === null && (
              <p className="mt-2 text-xs text-muted-foreground">
                The fees are as big as the loan, so there&apos;s no rate to show.
              </p>
            )}
          </>
        ) : (
          <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            {parsed.missing}
          </p>
        )}
      </div>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className={cn("text-muted-foreground", strong && "font-medium text-foreground")}>{label}</dt>
      <dd className={cn("text-right tabular-nums", strong && "font-semibold")}>{value}</dd>
    </div>
  );
}

/** Neutral grey for interest; the foreground colour for fees — the part a rate hides. */
const SWATCH = {
  interest: "bg-muted-foreground/40",
  fees: "bg-foreground/75",
};

/** Each offer's total cost as a bar — interest, then fees — on one scale. */
function CostBars({
  rows,
  max,
  money,
}: {
  rows: { name: string; interest: number; fees: number; total: number; best: boolean }[];
  max: number;
  money: (v: number) => string;
}) {
  if (!(max > 0)) return null;
  return (
    <div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={cn("font-medium", r.best && "text-emerald-700 dark:text-emerald-400")}>{r.name}</span>
              <span className="tabular-nums">{money(r.total)}</span>
            </div>
            <div
              className="mt-1.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${r.name}: ${money(r.interest)} interest and ${money(r.fees)} in fees`}
            >
              {r.interest > 0 && <div className={SWATCH.interest} style={{ width: `${(r.interest / max) * 100}%` }} />}
              {r.fees > 0 && <div className={SWATCH.fees} style={{ width: `${(r.fees / max) * 100}%` }} />}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", SWATCH.interest)} /> Interest
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", SWATCH.fees)} /> Fees and charges
        </span>
      </div>
    </div>
  );
}
