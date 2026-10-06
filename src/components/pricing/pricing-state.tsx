"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CURRENCIES,
  PAID_PERSONAL_PLANS,
  PERIODS,
  PERIOD_LABEL,
  currencySymbol,
  isCurrency,
  pct,
  periodDiscount,
  type Currency,
  type Period,
} from "@/lib/pricing";
import { Segmented } from "./segmented";

type PricingState = {
  period: Period;
  setPeriod: (p: Period) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** The currencies the switcher offers. */
  currencies: Currency[];
};

const Ctx = createContext<PricingState | null>(null);

/**
 * Period and currency are shared by the plan cards and the comparison chart,
 * so changing one in either place moves the other — the chart never disagrees
 * with the cards above it.
 */
export function PricingStateProvider({
  initialCurrency,
  currencies = ALL_CURRENCIES,
  children,
}: {
  initialCurrency: Currency;
  /**
   * Limit the switcher — the in-app page passes `checkoutCurrencies(country)`
   * so it only offers prices checkout will charge. The public page shows all.
   */
  currencies?: Currency[];
  children: ReactNode;
}) {
  // Yearly first: it's the best deal, and the price people should anchor on.
  const [period, setPeriod] = useState<Period>("yearly");
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  return (
    <Ctx.Provider value={{ period, setPeriod, currency, setCurrency, currencies }}>
      {children}
    </Ctx.Provider>
  );
}

const ALL_CURRENCIES = CURRENCIES.map((c) => c.code);

export function usePricingState(): PricingState {
  const value = useContext(Ctx);
  if (!value) throw new Error("usePricingState must be used inside <PricingStateProvider>");
  return value;
}

/**
 * The one controls row — period and currency — used above the cards and above
 * the comparison chart. Both are 44px tall.
 */
export function PricingControls({ className }: { className?: string }) {
  const { period, setPeriod, currency, setCurrency, currencies } = usePricingState();

  // One selector serves both paid plans, so each option shows the best saving
  // either of them gets; each card then shows its own exact saving.
  const periodOptions = PERIODS.map((p) => {
    const max = Math.max(...PAID_PERSONAL_PLANS.map((plan) => periodDiscount(plan, p, currency)));
    return {
      value: p,
      label: PERIOD_LABEL[p].toggle,
      badge: max >= 0.01 ? `−${pct(max)}` : undefined,
    };
  });

  return (
    // Period centred, currency in the right corner; the empty left cell keeps
    // the period selector on the page's centre line.
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-center gap-3 md:grid md:grid-cols-[1fr_auto_1fr]",
        className,
      )}
    >
      <span aria-hidden className="hidden md:block" />
      <Segmented
        label="Billing period"
        size="bar"
        value={period}
        onChange={setPeriod}
        options={periodOptions}
      />
      <Select value={currency} onValueChange={(v) => isCurrency(v) && setCurrency(v)}>
        <SelectTrigger
          aria-label="Currency"
          className="h-11! shrink-0 rounded-full md:justify-self-end bg-background px-3 font-medium shadow-sm sm:px-4"
        >
          <SelectValue>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-1.5 text-sm font-semibold">
              {currencySymbol(currency)}
            </span>
            {currency}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {currencies.map((code) => (
            <SelectItem key={code} value={code}>
              <span className="w-7 text-center font-semibold">{currencySymbol(code)}</span>
              {code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
