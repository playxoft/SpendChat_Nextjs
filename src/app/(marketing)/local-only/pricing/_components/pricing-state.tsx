"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Briefcase, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CURRENCIES,
  PERIODS_FOR,
  PERIOD_LABEL,
  PLANS_FOR,
  currencySymbol,
  isCurrency,
  isPaid,
  pct,
  periodDiscount,
  type Audience,
  type Currency,
  type Period,
} from "../_data/pricing";
import { Segmented } from "./segmented";

type PricingState = {
  audience: Audience;
  setAudience: (a: Audience) => void;
  period: Period;
  setPeriod: (p: Period) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
};

const Ctx = createContext<PricingState | null>(null);

/**
 * Audience, period and currency are shared by the plan cards and the
 * comparison chart, so changing one in either place moves the other — the
 * chart never disagrees with the cards above it.
 */
export function PricingStateProvider({
  initialCurrency,
  children,
}: {
  initialCurrency: Currency;
  children: ReactNode;
}) {
  const [audience, setAudienceRaw] = useState<Audience>("personal");
  // Yearly first: it's the best deal, and the price people should anchor on.
  const [period, setPeriod] = useState<Period>("yearly");
  const [currency, setCurrency] = useState<Currency>(initialCurrency);

  // Business has no 3-month option; landing there on one falls back to yearly.
  function setAudience(next: Audience) {
    setAudienceRaw(next);
    if (!PERIODS_FOR[next].includes(period)) setPeriod("yearly");
  }
  return (
    <Ctx.Provider value={{ audience, setAudience, period, setPeriod, currency, setCurrency }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePricingState(): PricingState {
  const value = useContext(Ctx);
  if (!value) throw new Error("usePricingState must be used inside <PricingStateProvider>");
  return value;
}

/**
 * The one controls row — audience, period, currency — used above the cards and
 * above the comparison chart. All three are 44px tall.
 */
export function PricingControls({ className }: { className?: string }) {
  const { audience, setAudience, period, setPeriod, currency, setCurrency } = usePricingState();
  const paid = PLANS_FOR[audience].filter(isPaid);

  // One selector serves every plan in view, so each option shows the best
  // saving any of them gets; each card then shows its own exact saving.
  const periodOptions = PERIODS_FOR[audience].map((p) => {
    const max = Math.max(...paid.map((plan) => periodDiscount(plan, p, currency)));
    return {
      value: p,
      label: PERIOD_LABEL[p].toggle,
      badge: max >= 0.01 ? `−${pct(max)}` : undefined,
    };
  });

  return (
    // Audience in the left corner, period centred, currency in the right corner.
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-center gap-3 md:grid md:grid-cols-[1fr_auto_1fr]",
        className,
      )}
    >
      <Segmented
        className="md:justify-self-start"
        label="Who is it for"
        size="bar"
        value={audience}
        onChange={setAudience}
        options={[
          { value: "personal", label: <><User className="size-4" /> Personal</> },
          { value: "business", label: <><Briefcase className="size-4" /> Business</> },
        ]}
      />
      {/* Keyed by audience: the thumb shouldn't animate across a change in option count. */}
      <Segmented
        key={audience}
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
          {CURRENCIES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              <span className="w-7 text-center font-semibold">{currencySymbol(c.code)}</span>
              {c.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
