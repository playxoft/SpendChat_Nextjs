"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyField, NumberField, SelectField, type Option } from "@/components/tools/fields";
import {
  ResultActions,
  ResultEmpty,
  ResultHero,
  ResultRows,
  ToolCta,
  ToolLayout,
  ToolPanel,
} from "@/components/tools/result";
import { useToolCurrency, useToolLocale, useUrlState } from "@/components/tools/tool-state";
import { getCurrency, isSupportedCurrency } from "@/lib/currencies";
import { formatAmountInput } from "@/lib/parse-amount";
import { APPLIANCES, CUSTOM_APPLIANCE, getAppliance } from "@/lib/tools/data/appliances";
import {
  MAX_ROWS,
  TYPICAL_TARIFF,
  decodeRows,
  electricityTotals,
  encodeRows,
  rowErrors,
  type ApplianceRow,
  type ApplianceUse,
} from "@/lib/tools/electricity";
import { currencySymbol, formatCurrency, formatNumber, parseNumber } from "@/lib/tools/format";
import { cn } from "@/lib/utils";

const SLUG = "electricity-cost-calculator";

// Short, stable query keys — they're in every shared link. `a` is the whole
// appliance list, `id~watts~hours~qty` per row, rows joined by `|`.
const DEFAULTS = {
  // Price per kWh. Until `tt` marks it as typed, the field shows the typical
  // rate for the visitor's currency, so it follows a currency change.
  t: "",
  tt: "",
  a: "ac15~1500~8~1|fridge~75~24~1|fan~75~10~2",
};

const APPLIANCE_OPTIONS: Option[] = [
  ...APPLIANCES.map((a) => ({ value: a.id, label: a.label })),
  { value: CUSTOM_APPLIANCE, label: "Custom — type the watts" },
];

function rowName(row: ApplianceRow, index: number): string {
  return getAppliance(row.id)?.label ?? `Custom appliance ${index + 1}`;
}

export function ElectricityTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency] = useToolCurrency();
  const locale = useToolLocale();
  const n = (v: string) => parseNumber(v, locale);
  const symbol = currencySymbol(currency, locale);
  const currencyDecimals = isSupportedCurrency(currency) ? getCurrency(currency).decimals : 2;
  const money = (v: number) => formatCurrency(v, currency, locale);
  // An LED bulb costs a fraction of a cent an hour — show enough decimals for
  // two significant figures instead of rounding it to zero.
  const fine = (v: number) => {
    if (!(v > 0) || v >= 1) return money(v);
    const decimals = Math.min(4, Math.max(currencyDecimals, Math.ceil(-Math.log10(v)) + 1));
    return formatCurrency(v, currency, locale, { decimals });
  };

  const rows = decodeRows(s.a);
  const setRows = (next: ApplianceRow[]) => set({ a: encodeRows(next) });
  const updateRow = (i: number, patch: Partial<ApplianceRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const chooseAppliance = (i: number, id: string) => {
    const preset = getAppliance(id);
    updateRow(
      i,
      preset
        ? {
            id,
            watts: formatAmountInput(preset.watts, locale, 4),
            hours: formatAmountInput(preset.hours, locale, 4),
          }
        : { id: CUSTOM_APPLIANCE },
    );
  };
  const addRow = () => setRows([...rows, { id: CUSTOM_APPLIANCE, watts: "", hours: "1", qty: "1" }]);
  const removeRow = (i: number) => setRows(rows.filter((_, j) => j !== i));

  const typical = TYPICAL_TARIFF[currency];
  const tariffInput = s.tt ? s.t : typical !== undefined ? String(typical) : "";
  const tariff = n(tariffInput);
  const tariffError = tariff !== null && tariff < 0 ? "The price can't be negative." : null;

  // Each row parsed and checked; only complete, valid rows count toward the total.
  const parsed = rows.map((row) => {
    const values = { watts: n(row.watts), hoursPerDay: n(row.hours), quantity: n(row.qty) };
    const errors = rowErrors(values);
    const complete =
      values.watts !== null && values.hoursPerDay !== null && values.quantity !== null;
    const use: ApplianceUse | null =
      complete && Object.keys(errors).length === 0 ? (values as ApplianceUse) : null;
    return { row, errors, use };
  });
  const counted = parsed.flatMap((p, index) => (p.use ? [{ index, use: p.use }] : []));
  const skipped = rows.length - counted.length;

  const totals =
    tariff !== null && !tariffError && counted.length > 0
      ? electricityTotals(
          counted.map((c) => c.use),
          tariff,
        )
      : null;

  const ranked = totals
    ? counted
        .map((c, k) => ({ ...c, cost: totals.rows[k]!, biggest: totals.biggest === k }))
        .sort((a, b) => b.cost.kwhPerMonth - a.cost.kwhPerMonth)
    : [];
  const biggest = ranked.find((r) => r.biggest) ?? null;
  const share = (kwh: number) =>
    totals && totals.total.kwhPerMonth > 0 ? (kwh / totals.total.kwhPerMonth) * 100 : 0;

  // The price the visitor typed, with as many decimals as they gave (up to 4).
  const tariffText =
    tariff === null
      ? ""
      : formatCurrency(tariff, currency, locale, {
          decimals: Math.max(
            currencyDecimals,
            [0, 1, 2, 3, 4].find((d) => Math.abs(Math.round(tariff * 10 ** d) / 10 ** d - tariff) < 1e-9) ?? 4,
          ),
        });
  const kwh = (v: number) => formatNumber(v, locale, v < 10 ? 2 : 1);

  const copy = totals
    ? `Running ${counted.length === 1 ? "this appliance" : `these ${counted.length} appliances`} costs about ${money(totals.total.perMonth)} a month and ${money(totals.total.perYear)} a year (${kwh(totals.total.kwhPerMonth)} kWh a month at ${tariffText} per kWh).`
    : null;

  return (
    <div className="space-y-4">
      <ToolLayout>
        <ToolPanel className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Electricity price"
              prefix={symbol}
              suffix="per kWh"
              value={tariffInput}
              onChange={(v) => set({ t: v, tt: "1" })}
              error={tariffError}
              hint={
                !s.tt && typical !== undefined
                  ? `A typical ${currency} rate — change it to the price per unit on your bill.`
                  : "On your bill — 1 unit = 1 kWh."
              }
            />
            <CurrencyField />
          </div>

          <div className="space-y-3">
            <div>
              <h2 className="text-base font-medium">Appliances</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Watts and hours start at typical figures — change them to match yours.
              </p>
            </div>

            {parsed.map(({ row, errors }, i) => {
              const preset = getAppliance(row.id);
              return (
                <fieldset key={i} className="min-w-0 rounded-xl border p-3 sm:p-4">
                  <legend className="sr-only">Appliance {i + 1}</legend>
                  <div className="flex items-end gap-2">
                    <SelectField
                      label="Appliance"
                      value={row.id}
                      onChange={(id) => chooseAppliance(i, id)}
                      options={APPLIANCE_OPTIONS}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0 rounded-xl text-muted-foreground"
                      aria-label={`Remove ${rowName(row, i)}`}
                      onClick={() => removeRow(i)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 items-end gap-2 sm:gap-3">
                    <NumberField
                      label="Watts"
                      value={row.watts}
                      onChange={(v) => updateRow(i, { watts: v })}
                      error={errors.watts}
                      placeholder="e.g. 1200"
                    />
                    <NumberField
                      label="Hours a day"
                      value={row.hours}
                      onChange={(v) => updateRow(i, { hours: v })}
                      error={errors.hoursPerDay}
                    />
                    <NumberField
                      label="How many"
                      integer
                      value={row.qty}
                      onChange={(v) => updateRow(i, { qty: v })}
                      error={errors.quantity}
                    />
                  </div>
                  {row.id === CUSTOM_APPLIANCE && !row.watts.trim() ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Type the watts from the label on the appliance or its plug.
                    </p>
                  ) : preset?.note ? (
                    <p className="mt-2 text-xs text-muted-foreground">{preset.note}</p>
                  ) : null}
                </fieldset>
              );
            })}

            {rows.length < MAX_ROWS ? (
              <Button type="button" variant="outline" className="h-11 w-full rounded-xl" onClick={addRow}>
                <Plus /> Add appliance
              </Button>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                That&apos;s the limit of {MAX_ROWS} appliances.
              </p>
            )}
          </div>
        </ToolPanel>

        <ToolPanel sticky className="space-y-5">
          {tariff === null || tariffError ? (
            <ResultEmpty>
              Enter what you pay per kWh (one unit) — it&apos;s printed on your electricity bill.
            </ResultEmpty>
          ) : !totals ? (
            <ResultEmpty>Add an appliance with its watts and hours to see what it costs to run.</ResultEmpty>
          ) : (
            <>
              <ResultHero
                label="Running cost per month"
                value={money(totals.total.perMonth)}
                sub={`${kwh(totals.total.kwhPerMonth)} kWh a month at ${tariffText} per kWh${
                  skipped > 0
                    ? ` — ${skipped} ${skipped === 1 ? "appliance isn't" : "appliances aren't"} counted until ${skipped === 1 ? "its" : "their"} numbers are filled in.`
                    : "."
                }`}
              />
              <ResultRows
                rows={[
                  { label: "Per day", value: money(totals.total.perDay) },
                  { label: "Per month", value: money(totals.total.perMonth) },
                  { label: "Per year", value: money(totals.total.perYear), strong: true },
                  { label: "Energy per month", value: `${kwh(totals.total.kwhPerMonth)} kWh` },
                  ...(biggest && ranked.length > 1
                    ? [
                        {
                          label: "Biggest cost",
                          value: `${rowName(rows[biggest.index]!, biggest.index)} · ${formatNumber(share(biggest.cost.kwhPerMonth), locale, 0)}%`,
                        },
                      ]
                    : []),
                ]}
              />
              <ResultActions copy={copy} onReset={reset} />
              <ToolCta slug={SLUG} message="Want the power bill next to everything else you spend?" />
            </>
          )}
        </ToolPanel>
      </ToolLayout>

      {totals && ranked.length > 0 && (
        <ToolPanel as="section">
          <h2 className="text-base font-medium">Cost by appliance</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Highest monthly cost first. A month is an average month — a year ÷ 12.
          </p>
          <ol className="mt-3 divide-y">
            {ranked.map(({ index, use, cost, biggest: isBiggest }) => {
              const pct = share(cost.kwhPerMonth);
              return (
                <li key={index} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={cn("min-w-0 text-sm break-words", isBiggest && "font-medium")}>
                      {rowName(rows[index]!, index)}
                      {use.quantity !== 1 && (
                        <span className="text-muted-foreground"> × {formatNumber(use.quantity, locale)}</span>
                      )}
                      {isBiggest && ranked.length > 1 && (
                        <span className="ml-2 inline-block rounded-full border px-2 py-0.5 align-middle text-xs font-medium">
                          Biggest
                        </span>
                      )}
                    </p>
                    <p className="shrink-0 text-right text-sm tabular-nums">
                      <span className={cn(isBiggest && "font-semibold")}>{money(cost.perMonth)}</span>
                      <span className="text-muted-foreground"> /month</span>
                    </p>
                  </div>
                  <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        isBiggest ? "bg-foreground/70" : "bg-muted-foreground/40",
                      )}
                      style={{ width: `${Math.max(pct, cost.kwhPerMonth > 0 ? 1 : 0)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground tabular-nums">
                    {formatNumber(use.watts, locale)} W × {formatNumber(use.hoursPerDay, locale)} h a day
                    {" · "}
                    {fine(cost.perHour)} an hour · {fine(cost.perDay)} a day · {money(cost.perYear)} a year
                    {" · "}
                    {kwh(cost.kwhPerMonth)} kWh a month ({formatNumber(pct, locale, pct < 10 ? 1 : 0)}%)
                  </p>
                </li>
              );
            })}
          </ol>
        </ToolPanel>
      )}
    </div>
  );
}
