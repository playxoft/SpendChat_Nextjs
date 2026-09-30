"use client";

import { useSyncExternalStore } from "react";
import { CurrencyField, NumberField, Segmented, SelectField, type Option } from "@/components/tools/fields";
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
import { getCurrency } from "@/lib/currencies";
import { currencyForCountry, regionFromLocale } from "@/lib/geo";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { currencySymbol, formatNumber, formatPercent, parseNumber } from "@/lib/tools/format";
import { calculateTax, splitGst, toMinor, type TaxMode } from "@/lib/tools/tax";
import { TAX_RATES, findTaxRate, type CountryTaxRate } from "@/lib/tools/data/tax-rates";

/**
 * Add or remove VAT / GST / sales tax. One amount, one rate, one direction —
 * the country only pre-fills the rate (and names the tax), so a visitor whose
 * country isn't listed, or who needs a reduced rate, just types it.
 */

// Short, stable query keys — they're in every shared link.
const DEFAULTS = {
  /** Amount, before or including tax depending on `m`. */
  a: "100",
  /** Country code. "" = the visitor's own region; `custom` = a typed rate. */
  c: "",
  /** Rate. `auto` = the country's standard rate, so a shared link stays current. */
  r: "auto",
  /** add | remove */
  m: "add",
  /** India only: intra (CGST + SGST) | inter (IGST). */
  s: "intra",
};

const CUSTOM = "custom";
/** What "Custom rate" starts at — a round number, so the answer checks itself. */
const CUSTOM_RATE = 10;

const noopSubscribe = () => () => {};

/**
 * The visitor's country from their browser language — `null` on the server,
 * so the static HTML (and hydration) uses the custom-rate default and the
 * visitor's country arrives on the re-render straight after.
 */
function useVisitorRegion(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => regionFromLocale(navigator.language || ""),
    () => null,
  );
}

/** A rate as the visitor's locale writes it, so it parses back in their field. */
function rateInput(rate: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 4,
      useGrouping: false,
      numberingSystem: "latn",
    }).format(rate);
  } catch {
    return String(rate);
  }
}

/** Every rate a country uses, highest first, for the quick-pick buttons. */
function quickRates(entry: CountryTaxRate): number[] {
  const all = [entry.standard, ...(entry.higher ?? []), ...entry.reduced].filter(
    (r): r is number => r !== null,
  );
  return [...new Set(all)].sort((a, b) => b - a);
}

export function VatTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency, setCurrency] = useToolCurrency();
  const locale = useToolLocale();
  const region = useVisitorRegion();

  const mode: TaxMode = s.m === "remove" ? "remove" : "add";
  const entry = s.c === CUSTOM ? null : findTaxRate(s.c || region);
  const country = entry?.country ?? CUSTOM;
  const isIndia = entry?.country === "IN";
  const interState = s.s === "inter";

  // Names: "VAT", "GST", "sales tax" — in labels as the visitor's country says it.
  const tax = entry?.taxName ?? "tax";
  const Tax = tax.charAt(0).toUpperCase() + tax.slice(1);

  // --- Rate
  const autoRate = entry ? entry.standard : CUSTOM_RATE;
  const rateText = s.r === "auto" ? (autoRate === null ? "" : rateInput(autoRate, locale)) : s.r;
  const rate = parseNumber(rateText, locale);
  const rateError =
    rateText.trim() === ""
      ? null
      : rate === null
        ? "Enter a rate like 20 or 5.5."
        : rate < 0
          ? "The rate can't be negative."
          : rate > 100
            ? "Enter a rate of 100% or less."
            : null;

  // --- Amount
  const decimals = getCurrency(currency).decimals;
  const amount = parseNumber(s.a, locale);
  const minor = amount === null ? null : toMinor(amount, decimals);
  const amountError =
    s.a.trim() === ""
      ? null
      : amount === null
        ? "Enter a number, like 1,250.50."
        : amount < 0
          ? "Enter an amount of zero or more."
          : minor === null
            ? "That amount is too large to calculate exactly."
            : null;

  const result =
    minor !== null && rate !== null && !amountError && !rateError
      ? calculateTax(minor, rate, mode)
      : null;

  /**
   * Any edit pins the auto-detected country into the URL, so a copied link
   * opens with the same rate and tax name for someone in another country.
   */
  const update = (patch: Partial<typeof DEFAULTS>) => set(s.c === "" ? { c: country, ...patch } : patch);

  const money = (m: number) => formatMoney(m, currency, locale);
  const pc = (r: number) => formatPercent(r, locale, 4);

  function pickCountry(code: string) {
    if (code === CUSTOM) {
      // Keep the rate they were looking at, ready to tweak.
      set({ c: CUSTOM, r: rateText === "" ? "auto" : rateText });
      return;
    }
    set({ c: code, r: "auto" });
    const next = currencyForCountry(code);
    if (next) setCurrency(next);
  }

  function pickRate(r: number) {
    update({ r: entry && r === entry.standard ? "auto" : rateInput(r, locale) });
  }

  const countryOptions: Option[] = [
    { value: CUSTOM, label: "Custom rate" },
    ...TAX_RATES.map((t) => ({
      value: t.country,
      label: t.standard === null ? `${t.name} — by state` : `${t.name} — ${pc(t.standard)}`,
    })),
  ];

  const picks = entry ? quickRates(entry) : [];

  // --- Result
  let body;
  let copy: string | null = null;
  if (!result || rate === null) {
    body = (
      <ResultEmpty>
        {s.a.trim() === ""
          ? `Enter an amount to see the ${tax}.`
          : rateText.trim() === ""
            ? entry?.standard === null
              ? `Enter your combined state and local ${tax} rate — for example 8.25 — to see the total.`
              : `Enter the ${tax} rate to see the total.`
            : "Check the highlighted field to see the answer."}
      </ResultEmpty>
    );
  } else {
    const { net, tax: taxMinor, gross } = result;
    const factor = formatNumber(1 + rate / 100, locale, 6);
    const half = pc(rate / 2);
    const split = splitGst(taxMinor);

    const rows: ResultRow[] = [
      { label: `Net (before ${tax})`, value: money(net), strong: mode === "remove" },
      { label: `${Tax} at ${pc(rate)}`, value: money(taxMinor) },
    ];
    if (isIndia) {
      const sub = (label: string, value: number) => ({
        label: <span className="pl-4">{label}</span>,
        value: <span className="text-muted-foreground">{money(value)}</span>,
      });
      if (interState) rows.push(sub(`IGST at ${pc(rate)}`, taxMinor));
      else rows.push(sub(`CGST at ${half}`, split.cgst), sub(`SGST at ${half}`, split.sgst));
    }
    rows.push({ label: `Total (including ${tax})`, value: money(gross), strong: mode === "add" });

    const detail = isIndia
      ? interState
        ? "as IGST"
        : `CGST ${money(split.cgst)} + SGST ${money(split.sgst)}`
      : null;
    copy =
      mode === "add"
        ? `${money(net)} + ${pc(rate)} ${tax} (${money(taxMinor)}${detail ? `, ${detail}` : ""}) = ${money(gross)}`
        : `${money(gross)} including ${pc(rate)} ${tax} = ${money(net)} + ${money(taxMinor)} ${tax}${detail ? ` (${detail})` : ""}`;

    body = (
      <>
        <ResultHero
          label={mode === "add" ? `Total including ${tax}` : `Amount before ${tax}`}
          value={money(mode === "add" ? gross : net)}
          sub={
            mode === "add"
              ? `${money(net)} plus ${money(taxMinor)} of ${tax} at ${pc(rate)}.`
              : `${money(gross)} includes ${money(taxMinor)} of ${tax} at ${pc(rate)}.`
          }
        />
        <ResultRows rows={rows} />
        <p className="font-mono text-xs break-words text-muted-foreground">
          {mode === "add"
            ? `${money(net)} × ${factor} = ${money(gross)}`
            : `${money(gross)} ÷ ${factor} = ${money(net)}`}
        </p>
      </>
    );
  }

  return (
    <ToolLayout>
      <ToolPanel className="space-y-5">
        <Segmented
          label="Calculation"
          hideLabel
          value={mode}
          onChange={(v) => update({ m: v })}
          options={[
            { value: "add", label: `Add ${tax}` },
            { value: "remove", label: `Remove ${tax}` },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={mode === "add" ? `Amount before ${tax}` : `Amount including ${tax}`}
            prefix={currencySymbol(currency, locale)}
            value={s.a}
            onChange={(v) => update({ a: v })}
            error={amountError}
          />
          <CurrencyField />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Country" value={country} onChange={pickCountry} options={countryOptions} />
          <NumberField
            label={`${Tax} rate`}
            suffix="%"
            value={rateText}
            placeholder={entry?.standard === null ? "e.g. 8.25" : undefined}
            onChange={(v) => update({ r: v })}
            error={rateError}
          />
        </div>

        {(picks.length > 1 || entry?.note) && (
          <div className="space-y-2">
            {picks.length > 1 && (
              <div role="group" aria-label={`${Tax} rates in ${entry!.name}`} className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm text-muted-foreground">Rates in {entry!.name}:</span>
                {picks.map((r) => {
                  const active = rate === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={active}
                      onClick={() => pickRate(r)}
                      className={cn(
                        "h-11 min-w-14 rounded-xl border px-3 text-sm tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                        active
                          ? "border-foreground bg-foreground font-medium text-background"
                          : "bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground dark:bg-input/30",
                      )}
                    >
                      {pc(r)}
                      {r === entry!.standard && <span className="sr-only"> (standard rate)</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {entry?.note && <p className="text-xs leading-relaxed text-muted-foreground">{entry.note}</p>}
          </div>
        )}

        {isIndia && (
          <Segmented
            label="Place of supply"
            value={interState ? "inter" : "intra"}
            onChange={(v) => update({ s: v })}
            options={[
              { value: "intra", label: "Same state (CGST + SGST)" },
              { value: "inter", label: "Another state (IGST)" },
            ]}
          />
        )}
      </ToolPanel>

      <ToolPanel sticky className="space-y-5">
        {body}
        <ResultActions copy={copy} onReset={reset} />
      </ToolPanel>
    </ToolLayout>
  );
}
