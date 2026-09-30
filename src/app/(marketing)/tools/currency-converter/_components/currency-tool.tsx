"use client";

import { ArrowUpDown, Plus, RotateCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CurrencyField,
  MoreOptions,
  NumberField,
  Segmented,
  SelectField,
  TextField,
  type Option,
} from "@/components/tools/fields";
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
import { CURRENCIES, getCurrency, isSupportedCurrency } from "@/lib/currencies";
import {
  MAX_LABEL,
  MAX_TARGETS,
  MAX_TRIP_ROWS,
  convert,
  crossRate,
  decodeTargets,
  decodeTripRows,
  defaultTargets,
  defaultTripCurrency,
  encodeTargets,
  encodeTripRows,
  formatRateDate,
  hasRate,
  tripTotals,
  unitRateDecimals,
  type RateTable,
  type TripRow,
} from "@/lib/tools/currency";
import { EMPTY, currencySymbol, formatCurrency, formatNumber, parseNumber } from "@/lib/tools/format";
import { SOURCE_INFO, refreshRates, useRates, type RatesState } from "./use-rates";

/**
 * Two ways to convert: one amount into several currencies at once, and a trip
 * — a list of expenses in the local currency, totalled in the visitor's own.
 * Rates come from `useRates` (downloaded in the browser, cached for the day);
 * all the maths is in `src/lib/tools/currency.ts`.
 */

// Short, stable keys — they're in every shared link.
const DEFAULTS = {
  m: "convert",
  a: "100",
  f: "USD",
  // The "to" list. Empty = the defaults for the visitor's currency, so an
  // untouched converter follows their region; "-" = every currency removed.
  t: "",
  // Trip mode: the trip currency (empty = euros, or dollars for a euro home),
  // the expenses as `label~amount` rows, and an optional card/bank fee in %.
  tc: "",
  x: "Hotel, 3 nights~360|Food and drinks~180|Train tickets~95|Museum passes~48",
  fee: "",
};

const MODE_OPTIONS: Option[] = [
  { value: "convert", label: "Convert" },
  { value: "trip", label: "Trip expenses" },
];

const CURRENCY_OPTIONS: Option[] = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));

/** A currency code from the link, or `fallback` when it isn't one the tools list. */
function validCode(raw: string, fallback: string): string {
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) && isSupportedCurrency(code) ? code : fallback;
}

function currencyName(code: string): string {
  return isSupportedCurrency(code) ? getCurrency(code).name : code;
}

export function CurrencyTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [home] = useToolCurrency();
  const locale = useToolLocale();
  const rates = useRates();
  const mode = s.m === "trip" ? "trip" : "convert";

  return (
    <ToolLayout>
      <ToolPanel className="space-y-5">
        <Segmented
          label="What do you want to convert?"
          hideLabel
          value={mode}
          onChange={(v) => set({ m: v })}
          options={MODE_OPTIONS}
        />
        {mode === "convert" ? (
          <ConvertInputs s={s} set={set} home={home} locale={locale} />
        ) : (
          <TripInputs s={s} set={set} home={home} locale={locale} />
        )}
      </ToolPanel>

      <ToolPanel sticky className="space-y-5">
        {mode === "convert" ? (
          <ConvertResult s={s} set={set} home={home} locale={locale} rates={rates} />
        ) : (
          <TripResult s={s} home={home} locale={locale} rates={rates} />
        )}
        <RatesNote rates={rates} locale={locale} />
        <ResultActions
          copy={mode === "convert" ? convertCopy(s, home, locale, rates.table) : tripCopy(s, home, locale, rates.table)}
          onReset={reset}
        />
      </ToolPanel>
    </ToolLayout>
  );
}

type State = typeof DEFAULTS;
type SetState = (patch: Partial<State>) => void;

// ---------------------------------------------------------------------------
// Convert: one amount → several currencies
// ---------------------------------------------------------------------------

function readAmount(s: State, locale: string) {
  const amount = parseNumber(s.a, locale);
  const error = amount !== null && amount < 0 ? "Enter an amount of zero or more." : null;
  return { amount: error ? null : amount, error };
}

/** The "to" list on screen: the link's list or the defaults, never the "from" currency. */
function targetsOf(s: State, home: string, from: string): string[] {
  return (decodeTargets(s.t) ?? defaultTargets(home, from)).filter((c) => c !== from);
}

function ConvertInputs({ s, set, home, locale }: { s: State; set: SetState; home: string; locale: string }) {
  const from = validCode(s.f, DEFAULTS.f);
  const { error } = readAmount(s, locale);

  // Picking a "from" that's already in the list swaps the two, so it isn't lost.
  const chooseFrom = (code: string) => {
    const list = targetsOf(s, home, from);
    if (list.includes(code)) set({ f: code, t: encodeTargets(list.map((c) => (c === code ? from : c))) });
    else set({ f: code });
  };

  return (
    <>
      <NumberField
        label="Amount"
        prefix={currencySymbol(from, locale)}
        value={s.a}
        onChange={(v) => set({ a: v })}
        error={error}
      />
      <SelectField label="From" value={from} onChange={chooseFrom} options={CURRENCY_OPTIONS} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Tap <ArrowUpDown className="inline size-3.5 align-[-2px]" aria-hidden />
        <span className="sr-only">the swap button</span> beside any currency to convert from it instead.
      </p>
    </>
  );
}

function ConvertResult({
  s,
  set,
  home,
  locale,
  rates,
}: {
  s: State;
  set: SetState;
  home: string;
  locale: string;
  rates: RatesState;
}) {
  const from = validCode(s.f, DEFAULTS.f);
  const { amount } = readAmount(s, locale);
  const targets = targetsOf(s, home, from);
  const table = rates.table;
  const fromMissing = table !== null && !hasRate(table, from);

  const setTargets = (list: string[]) => set({ t: encodeTargets(list) });
  const swap = (code: string) => set({ f: code, t: encodeTargets(targets.map((c) => (c === code ? from : c))) });
  const remove = (code: string) => setTargets(targets.filter((c) => c !== code));
  const add = (code: string) => {
    if (code) setTargets([...targets, code]);
  };
  const addOptions: Option[] = [
    { value: "", label: "Choose a currency…" },
    ...CURRENCY_OPTIONS.filter((o) => o.value !== from && !targets.includes(o.value)),
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-medium">
          {amount !== null ? `${formatCurrency(amount, from, locale)} converts to` : "Converted amounts"}
        </h2>
        {fromMissing && (
          <p className="mt-1 text-sm text-destructive">
            There&apos;s no rate for {currencyName(from)} in today&apos;s list — pick another currency to
            convert from.
          </p>
        )}
      </div>

      {targets.length === 0 ? (
        <ResultEmpty>Add a currency below to convert into.</ResultEmpty>
      ) : (
        <ul className="divide-y border-y">
          {targets.map((code) => {
            const rate = table ? crossRate(table, from, code) : null;
            const value = table && amount !== null ? convert(amount, from, code, table) : null;
            const missing = table !== null && !fromMissing && rate === null;
            return (
              <li key={code} className="flex items-center gap-1 py-2.5">
                <div className="min-w-0 flex-1">
                  {!table && rates.status !== "failed" ? (
                    <span className="block h-7 py-1" aria-hidden>
                      <span className="block h-full w-28 animate-pulse rounded-md bg-muted" />
                    </span>
                  ) : missing ? (
                    <p className="py-0.5 text-sm font-medium text-muted-foreground">Rate not available</p>
                  ) : (
                    <p className="text-lg font-semibold tabular-nums break-words">
                      {value !== null ? formatCurrency(value, code, locale) : EMPTY}
                    </p>
                  )}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground/80">{code}</span> · {currencyName(code)}
                    {rate !== null && (
                      <span className="tabular-nums">
                        {" · "}1 {from} = {formatNumber(rate, locale, unitRateDecimals(rate))} {code}
                      </span>
                    )}
                    {missing && " · not in today's rate list"}
                  </p>
                </div>
                {missing ? (
                  // Keeps the remove buttons in one column.
                  <span className="size-11 shrink-0" aria-hidden />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0 rounded-xl text-muted-foreground"
                    aria-label={`Convert from ${currencyName(code)} instead`}
                    title={`Convert from ${code}`}
                    onClick={() => swap(code)}
                  >
                    <ArrowUpDown />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0 rounded-xl text-muted-foreground"
                  aria-label={`Remove ${currencyName(code)}`}
                  title={`Remove ${code}`}
                  onClick={() => remove(code)}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {targets.length < MAX_TARGETS ? (
        <SelectField label="Add a currency" value="" onChange={add} options={addOptions} />
      ) : (
        <p className="text-xs text-muted-foreground">
          That&apos;s {MAX_TARGETS} currencies, the most at once — remove one to add another.
        </p>
      )}
    </div>
  );
}

/**
 * What to call the rates in copied text: Frankfurter's are central-bank
 * reference rates; the fallback dataset's are not, so it isn't credited as such.
 */
function ratesName(table: RateTable): string {
  return table.source === "frankfurter" ? "reference rates" : "open-data exchange rates";
}

function convertCopy(s: State, home: string, locale: string, table: RateTable | null): string | null {
  const from = validCode(s.f, DEFAULTS.f);
  const { amount } = readAmount(s, locale);
  if (!table || amount === null) return null;
  const parts = targetsOf(s, home, from).flatMap((code) => {
    const v = convert(amount, from, code, table);
    return v === null ? [] : [formatCurrency(v, code, locale)];
  });
  if (parts.length === 0) return null;
  return `${formatCurrency(amount, from, locale)} = ${parts.join(" · ")} (${ratesName(table)} as of ${formatRateDate(table.date, locale)}).`;
}

// ---------------------------------------------------------------------------
// Trip: a list of expenses in one currency → the total in the home currency
// ---------------------------------------------------------------------------

function readTrip(s: State, home: string, locale: string) {
  const trip = validCode(s.tc, defaultTripCurrency(home));
  const rows = decodeTripRows(s.x);
  const parsed = rows.map((row) => {
    const amount = parseNumber(row.amount, locale);
    const error = amount !== null && amount < 0 ? "Can't be negative." : null;
    return { row, amount: error ? null : amount, error };
  });
  const counted = parsed.flatMap((p, index) => (p.amount !== null ? [{ index, amount: p.amount }] : []));
  const fee = parseNumber(s.fee, locale);
  const feeError = fee !== null && (fee < 0 || fee > 100) ? "Between 0% and 100%." : null;
  return { trip, rows, parsed, counted, fee: fee !== null && !feeError ? fee : 0, feeError };
}

function expenseName(row: TripRow, index: number): string {
  return row.label.trim() || `Expense ${index + 1}`;
}

function TripInputs({ s, set, home, locale }: { s: State; set: SetState; home: string; locale: string }) {
  const { trip, rows, parsed, feeError } = readTrip(s, home, locale);
  const symbol = currencySymbol(trip, locale);

  const setRows = (next: TripRow[]) => set({ x: encodeTripRows(next) });
  const updateRow = (i: number, patch: Partial<TripRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows([...rows, { label: "", amount: "" }]);
  const removeRow = (i: number) => setRows(rows.filter((_, j) => j !== i));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Trip currency"
          value={trip}
          onChange={(v) => set({ tc: v })}
          options={CURRENCY_OPTIONS}
        />
        <CurrencyField label="Home currency" />
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-base font-medium">Expenses</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            In {currencyName(trip)}, as you paid or plan to pay them.
          </p>
        </div>

        {parsed.map(({ row, error }, i) => (
          <div key={i} className="flex items-start gap-2">
            <TextField
              label={i === 0 ? <>What<span className="sr-only"> (expense 1)</span></> : <span className="sr-only">What (expense {i + 1})</span>}
              value={row.label}
              onChange={(v) => updateRow(i, { label: v })}
              placeholder="e.g. Hotel"
              maxLength={MAX_LABEL}
              className="flex-1"
            />
            <NumberField
              label={i === 0 ? <>Amount<span className="sr-only"> (expense 1)</span></> : <span className="sr-only">Amount (expense {i + 1})</span>}
              prefix={symbol}
              value={row.amount}
              onChange={(v) => updateRow(i, { amount: v })}
              error={error}
              className="w-32 shrink-0 sm:w-36"
            />
            {/* The same label-then-control stack as the fields beside it, so the
                button lines up with the inputs whether or not a row shows an error. */}
            <div className="flex shrink-0 flex-col gap-1.5">
              <span aria-hidden className="invisible text-sm font-medium">
                {i === 0 ? "\u00a0" : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 rounded-xl text-muted-foreground"
                aria-label={`Remove ${expenseName(row, i)}`}
                onClick={() => removeRow(i)}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}

        {rows.length < MAX_TRIP_ROWS ? (
          <Button type="button" variant="outline" className="h-11 w-full rounded-xl" onClick={addRow}>
            <Plus /> Add expense
          </Button>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            That&apos;s the limit of {MAX_TRIP_ROWS} expenses.
          </p>
        )}
      </div>

      <MoreOptions summary={s.fee.trim() && !feeError ? `${s.fee.trim()}% card fee` : "card or bank fee"} bodyClassName="p-4">
        <NumberField
          label="Card or bank fee"
          suffix="%"
          value={s.fee}
          onChange={(v) => set({ fee: v })}
          placeholder="0"
          error={feeError}
          hint="Many debit and credit cards add about 2–3.5% to spending abroad; some travel cards add nothing. Leave it blank for the reference rate."
        />
      </MoreOptions>
    </>
  );
}

function TripResult({ s, home, locale, rates }: { s: State; home: string; locale: string; rates: RatesState }) {
  const table = rates.table;
  if (!table) return <RatesPending status={rates.status} />;

  const { trip, rows, counted, fee } = readTrip(s, home, locale);
  const money = (v: number, code: string) => formatCurrency(v, code, locale);

  const missing = [trip, home].filter((c) => !hasRate(table, c));
  if (missing.length > 0) {
    return (
      <ResultEmpty>
        There&apos;s no rate for {missing.map(currencyName).join(" or ")} in today&apos;s list — pick
        another currency.
      </ResultEmpty>
    );
  }
  if (counted.length === 0) {
    return <ResultEmpty>Add an expense with an amount to see the trip total.</ResultEmpty>;
  }

  const totals = tripTotals(
    counted.map((c) => c.amount),
    trip,
    home,
    table,
    fee,
  );
  if (!totals) return <ResultEmpty>Pick another currency — there&apos;s no rate for this pair.</ResultEmpty>;

  const skipped = rows.length - counted.length;
  const rate = formatNumber(totals.rate, locale, unitRateDecimals(totals.rate));
  const feeText = `${formatNumber(fee, locale, 2)}%`;

  const expenseRows: ResultRow[] = counted.map((c, k) => ({
    label: expenseName(rows[c.index]!, c.index),
    value: (
      <>
        <span className="text-muted-foreground">{money(c.amount, trip)} · </span>
        {money(totals.rowsHome[k]!, home)}
      </>
    ),
  }));

  return (
    <>
      <ResultHero
        label={`Trip total in ${home}`}
        value={money(totals.totalWithMarkup ?? totals.totalHome, home)}
        sub={`${money(totals.totalTrip, trip)} at 1 ${trip} = ${rate} ${home}${
          totals.totalWithMarkup !== null ? `, plus a ${feeText} card fee` : ""
        }${
          trip === home ? " (trip and home currency are the same)" : ""
        }${
          skipped > 0
            ? ` — ${skipped} ${skipped === 1 ? "expense isn't" : "expenses aren't"} counted until ${skipped === 1 ? "it has an amount" : "they have amounts"}.`
            : "."
        }`}
      />
      <ResultRows
        rows={[
          ...expenseRows,
          { label: `Total in ${trip}`, value: money(totals.totalTrip, trip) },
          {
            label: "At the reference rate",
            value: money(totals.totalHome, home),
            strong: totals.totalWithMarkup === null,
          },
          ...(totals.totalWithMarkup !== null
            ? [
                { label: `Fee (${feeText})`, value: money(totals.totalWithMarkup - totals.totalHome, home) },
                { label: `With the ${feeText} fee`, value: money(totals.totalWithMarkup, home), strong: true },
              ]
            : []),
        ]}
      />
    </>
  );
}

function tripCopy(s: State, home: string, locale: string, table: RateTable | null): string | null {
  if (!table) return null;
  const { trip, counted, fee } = readTrip(s, home, locale);
  if (counted.length === 0) return null;
  const totals = tripTotals(
    counted.map((c) => c.amount),
    trip,
    home,
    table,
    fee,
  );
  if (!totals) return null;
  const money = (v: number, code: string) => formatCurrency(v, code, locale);
  const n = counted.length;
  const withFee =
    totals.totalWithMarkup !== null
      ? `, or ${money(totals.totalWithMarkup, home)} with a ${formatNumber(fee, locale, 2)}% card fee`
      : "";
  return `Trip total: ${money(totals.totalTrip, trip)} (${n} ${n === 1 ? "expense" : "expenses"}) = ${money(totals.totalHome, home)} at the ${ratesName(table)} of ${formatRateDate(table.date, locale)}${withFee}.`;
}

// ---------------------------------------------------------------------------
// Where the rates came from, and what happens when they can't be loaded
// ---------------------------------------------------------------------------

function RatesPending({ status }: { status: RatesState["status"] }) {
  return status === "failed" ? (
    <ResultEmpty>
      Couldn&apos;t load today&apos;s exchange rates — you may be offline, or the rate service didn&apos;t
      answer. Try again in a moment.
    </ResultEmpty>
  ) : (
    <ResultEmpty>Loading today&apos;s exchange rates…</ResultEmpty>
  );
}

function RatesNote({ rates, locale }: { rates: RatesState; locale: string }) {
  const { table, status } = rates;
  const source = table ? SOURCE_INFO[table.source] : null;
  return (
    <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
      {table && source ? (
        <p>
          Rates as of <span className="font-medium text-foreground">{formatRateDate(table.date, locale)}</span>
          {" · "}Source:{" "}
          <a
            href={source.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {source.name}
          </a>
          {status === "loading" && " · checking for newer rates…"}
        </p>
      ) : status !== "failed" ? (
        <p>Loading today&apos;s exchange rates…</p>
      ) : null}

      {status === "failed" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed p-3">
          <p className="min-w-0 flex-1 text-foreground">
            {table
              ? "Couldn't get newer rates — you may be offline. These are the last rates saved on this device."
              : "Couldn't load exchange rates — you may be offline, or the rate service didn't answer."}
          </p>
          <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={() => void refreshRates()}>
            <RotateCw /> Try again
          </Button>
        </div>
      )}

      <p>
        Only the day&apos;s list of exchange rates is downloaded, straight from{" "}
        {table?.source === "currency-api" ? "the open currency-api dataset" : "Frankfurter"} to your
        browser. The amounts you type are never sent anywhere.
      </p>
    </div>
  );
}
