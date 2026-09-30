"use client";

import { useRef } from "react";
import { History, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CurrencyField } from "@/components/tools/fields";
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
import { useToday } from "@/components/tools/use-today";
import { getCurrency, isSupportedCurrency } from "@/lib/currencies";
import { currencySymbol, EMPTY, formatCurrency, formatPercent, sanitizeNumberInput } from "@/lib/tools/format";
import {
  GROUPS,
  MAX_NAME,
  MAX_ROWS,
  MAX_SNAPSHOTS,
  baselineSnapshot,
  changeBetween,
  decodeRows,
  encodeRows,
  netWorth,
  netWorthSplit,
  readAmount,
  toMinor,
  type Entry,
  type Group,
  type GroupId,
  type Row,
  type Snapshot,
  type Split,
} from "@/lib/tools/net-worth";
import { cn } from "@/lib/utils";
import { clearSnapshots, restoreSnapshots, saveSnapshot, useSnapshots } from "./snapshot-store";

/**
 * Net worth: grouped lists of what you own and what you owe, each row a name
 * and an amount. The answer updates as you type; "Save a snapshot" keeps the
 * total (and the form) in this browser, so next time you can see how it moved.
 */

// Each group is one fragment key (`ca`, `hl`, …): `name~amount` rows joined by `|`.
const DEFAULT_ROWS: Record<GroupId, string> = {
  cash: "Bank accounts~15000",
  investments: "Index funds~25000",
  retirement: "Pension~40000",
  property: "Home~300000",
  vehicles: "Car~12000",
  otherAssets: "",
  homeLoan: "Mortgage~220000",
  loans: "Car loan~8000",
  cards: "Credit card~2500",
  otherDebts: "",
};

const DEFAULTS: Record<string, string> = Object.fromEntries(GROUPS.map((g) => [g.key, DEFAULT_ROWS[g.id]]));

const input =
  "h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30";

/** Neutral grey for the part that's owed or covered; emerald for what's yours. */
const SWATCH = {
  owed: "bg-muted-foreground/45",
  yours: "bg-emerald-600 dark:bg-emerald-500",
  shortfall: "bg-foreground/70",
};

function dateLabel(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function hasInputs(snap: Snapshot): boolean {
  return Object.values(snap.inputs).some(Boolean);
}

export function NetWorthTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const [currency, setCurrency] = useToolCurrency();
  const locale = useToolLocale();
  const today = useToday();
  const snapshots = useSnapshots();
  const nameInputs = useRef(new Map<string, HTMLInputElement>());

  const symbol = currencySymbol(currency, locale);
  const decimals = isSupportedCurrency(currency) ? getCurrency(currency).decimals : 2;

  const groups = GROUPS.map((group) => {
    const rows = decodeRows(s[group.key] ?? "");
    return { group, rows, reads: rows.map((row) => readAmount(row.amount, locale)) };
  });
  const entries: Entry[] = groups.flatMap(({ group, reads }) =>
    reads.flatMap((r) => (r.value !== null ? [{ group: group.id, amount: r.value }] : [])),
  );
  const problems = groups.reduce((n, g) => n + g.reads.filter((r) => r.error).length, 0);
  const result = netWorth(entries, decimals);
  const split = netWorthSplit(result.assets, result.liabilities);

  // Whole amounts read better without ".00" — show decimals only once someone types them.
  const scale = 10 ** decimals;
  const showDecimals = entries.some((e) => toMinor(e.amount, decimals) % scale !== 0);
  const moneyIn = (v: number, code: string) =>
    formatCurrency(v || 0, code, locale, { decimals: showDecimals ? undefined : 0 });
  const money = (v: number) => moneyIn(v, currency);
  const signed = (v: number, code = currency) => (v > 0 ? `+${moneyIn(v, code)}` : moneyIn(v, code));

  // ---- editing rows ----------------------------------------------------------
  const setRows = (key: string, rows: Row[]) => set({ [key]: encodeRows(rows) });
  const updateRow = (key: string, rows: Row[], i: number, patch: Partial<Row>) =>
    setRows(key, rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = (key: string, rows: Row[]) => {
    setRows(key, [...rows, { name: "", amount: "" }]);
    // Focus the new row's name once React has rendered it.
    requestAnimationFrame(() => nameInputs.current.get(`${key}:${rows.length}`)?.focus());
  };
  const removeRow = (key: string, rows: Row[], i: number) => setRows(key, rows.filter((_, j) => j !== i));

  // ---- snapshots -------------------------------------------------------------
  const untouched = GROUPS.every((g) => s[g.key] === DEFAULTS[g.key]);
  const latest = snapshots.at(-1) ?? null;
  // Offer the last snapshot's rows when the form still shows the example —
  // unless that snapshot *is* the example (saved without changing anything).
  const offerLatest =
    untouched && latest && hasInputs(latest) && GROUPS.some((g) => (latest.inputs[g.key] ?? "") !== DEFAULTS[g.key])
      ? latest
      : null;
  const todays = today ? (snapshots.find((x) => x.date === today) ?? null) : null;
  const baseline = today ? baselineSnapshot(snapshots, today, currency) : null;
  // Comparing the example figures with someone's real snapshot would be noise.
  const change = baseline && !untouched && entries.length > 0 ? changeBetween(baseline.netWorth, result.netWorth) : null;

  const save = () => {
    if (!today) return;
    const ok = saveSnapshot({
      date: today,
      currency,
      assets: result.assets,
      liabilities: result.liabilities,
      netWorth: result.netWorth,
      inputs: Object.fromEntries(GROUPS.map((g) => [g.key, s[g.key] ?? ""])),
    });
    if (!ok) {
      toast.error("Kept for this visit only — this browser is blocking storage, so it won't be here next time.");
    } else {
      toast.success(todays ? "Today's snapshot updated." : "Snapshot saved in this browser.");
    }
  };

  const load = (snap: Snapshot) => {
    set(Object.fromEntries(GROUPS.map((g) => [g.key, snap.inputs[g.key] ?? ""])));
    if (snap.currency !== currency) setCurrency(snap.currency);
    toast.success(`Loaded your numbers from ${dateLabel(snap.date, locale)}.`);
  };

  const clear = () => {
    const previous = clearSnapshots();
    toast.success("Snapshot history cleared from this browser.", {
      action: { label: "Undo", onClick: () => restoreSnapshots(previous) },
    });
  };

  // ---- result ------------------------------------------------------------------
  const ratio = result.debtToAsset;
  const pct = (v: number) => formatPercent(v, locale, 1);

  const rows: ResultRow[] = [
    { label: "Total assets", value: money(result.assets) },
    { label: "Total liabilities", value: money(result.liabilities) },
    {
      label: "Debt-to-asset ratio",
      value: ratio === null ? EMPTY : pct(ratio),
    },
  ];
  if (change && baseline) {
    rows.push({
      label: `Since ${dateLabel(baseline.date, locale)}`,
      value: (
        <span className={cn(change.amount > 0 && "text-emerald-600 dark:text-emerald-400")}>
          {signed(change.amount)}
          {change.percent !== null && (
            <span className="text-xs text-muted-foreground">
              {" "}
              ({change.percent > 0 ? "+" : ""}
              {pct(change.percent)})
            </span>
          )}
        </span>
      ),
    });
  }

  const sub =
    result.netWorth > 0
      ? `What you own, ${money(result.assets)}, minus what you owe, ${money(result.liabilities)}.`
      : result.netWorth < 0
        ? `You owe ${money(-result.netWorth)} more than you own. That's common early on — student loans, a new mortgage — and every repayment and every saving moves it up.`
        : "What you own exactly matches what you owe.";

  const copy =
    entries.length > 0
      ? `Net worth: ${money(result.netWorth)} — ${money(result.assets)} in assets minus ${money(result.liabilities)} in liabilities` +
        (ratio !== null ? ` (debt-to-asset ratio ${pct(ratio)}).` : ".")
      : null;

  const assetGroups = groups.filter((g) => g.group.side === "asset");
  const liabilityGroups = groups.filter((g) => g.group.side === "liability");

  const renderGroup = ({ group, rows: groupRows, reads }: (typeof groups)[number]) => (
    <GroupBlock
      key={group.key}
      group={group}
      rows={groupRows}
      errors={reads.map((r) => r.error)}
      subtotal={groupRows.length > 0 ? money(result.byGroup[group.id]) : null}
      symbol={symbol}
      nameRef={(i, el) => {
        if (el) nameInputs.current.set(`${group.key}:${i}`, el);
        else nameInputs.current.delete(`${group.key}:${i}`);
      }}
      onChange={(i, patch) => updateRow(group.key, groupRows, i, patch)}
      onAdd={() => addRow(group.key, groupRows)}
      onRemove={(i) => removeRow(group.key, groupRows, i)}
    />
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      <ToolLayout>
        <ToolPanel className="space-y-8">
          <CurrencyField />

          <section aria-labelledby="nw-own" className="space-y-5">
            <SideHeading id="nw-own" title="What you own" total={money(result.assets)} />
            {assetGroups.map(renderGroup)}
          </section>

          <section aria-labelledby="nw-owe" className="space-y-5">
            <SideHeading id="nw-owe" title="What you owe" total={money(result.liabilities)} />
            {liabilityGroups.map(renderGroup)}
          </section>
        </ToolPanel>

        <ToolPanel sticky className="space-y-5">
          {offerLatest && (
            <div className="rounded-xl border bg-muted/40 p-3 text-sm">
              <p className="text-muted-foreground">
                {today && offerLatest.date < today ? "Welcome back. " : ""}
                Your last snapshot, on {dateLabel(offerLatest.date, locale)}, was{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {moneyIn(offerLatest.netWorth, offerLatest.currency)}
                </span>
                . The numbers below are an example.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-2 h-9 rounded-lg"
                onClick={() => load(offerLatest)}
              >
                Load my numbers
              </Button>
            </div>
          )}

          {entries.length === 0 ? (
            <ResultEmpty>Add what you own and what you owe to see your net worth.</ResultEmpty>
          ) : (
            <>
              <ResultHero label="Your net worth" value={money(result.netWorth)} sub={sub} />
              <OwnOweBar split={split} locale={locale} />
              <ResultRows rows={rows} />
            </>
          )}
          {problems > 0 && (
            <p className="text-xs text-muted-foreground">
              {problems === 1
                ? "One amount isn't counted until it's fixed."
                : `${problems} amounts aren't counted until they're fixed.`}
            </p>
          )}
          <ResultActions copy={copy} onReset={reset} />

          <div className="border-t pt-4">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              onClick={save}
              disabled={!today || entries.length === 0}
            >
              <History /> {todays ? "Update today's snapshot" : "Save a snapshot"}
            </Button>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {todays ? "Saved today. " : ""}
              Snapshots stay in this browser — your amounts are never sent anywhere. Come back next
              month to see how your net worth has moved.
            </p>
          </div>
        </ToolPanel>
      </ToolLayout>

      {snapshots.length > 0 && (
        <SnapshotHistory
          snapshots={snapshots}
          locale={locale}
          money={moneyIn}
          signed={signed}
          onLoad={load}
          onClear={clear}
        />
      )}
    </div>
  );
}

function SideHeading({ id, title, total }: { id: string; title: string; total: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b pb-2">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      <span className="text-sm font-medium tabular-nums">{total}</span>
    </div>
  );
}

function GroupBlock({
  group,
  rows,
  errors,
  subtotal,
  symbol,
  nameRef,
  onChange,
  onAdd,
  onRemove,
}: {
  group: Group;
  rows: Row[];
  errors: (string | null)[];
  subtotal: string | null;
  symbol: string;
  nameRef: (i: number, el: HTMLInputElement | null) => void;
  onChange: (i: number, patch: Partial<Row>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  const headingId = `nw-group-${group.key}`;
  return (
    <div role="group" aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-sm font-medium">
          {group.label}
        </h3>
        {subtotal && <span className="text-sm text-muted-foreground tabular-nums">{subtotal}</span>}
      </div>

      {rows.length > 0 && (
        <ul className="mt-2 space-y-2">
          {rows.map((row, i) => {
            const error = errors[i];
            const errorId = `${headingId}-${i}-err`;
            const n = `${group.label} ${i + 1}`;
            return (
              <li key={i}>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <input
                    ref={(el) => nameRef(i, el)}
                    type="text"
                    value={row.name}
                    maxLength={MAX_NAME}
                    placeholder={group.placeholder}
                    aria-label={`${n}: name`}
                    autoComplete="off"
                    onChange={(e) => onChange(i, { name: e.target.value })}
                    className={cn(input, "flex-1")}
                  />
                  <div
                    className={cn(
                      "flex h-11 min-w-0 flex-1 items-center rounded-xl border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 dark:bg-input/30",
                      error && "border-destructive ring-destructive/20",
                    )}
                  >
                    <span aria-hidden className="shrink-0 pl-2.5 text-sm whitespace-nowrap text-muted-foreground select-none">
                      {symbol}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      enterKeyHint="done"
                      spellCheck={false}
                      value={row.amount}
                      placeholder="0"
                      aria-label={`${n}: amount`}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => onChange(i, { amount: sanitizeNumberInput(e.target.value) })}
                      className="h-full w-full min-w-0 bg-transparent px-2 text-base tabular-nums outline-none placeholder:text-muted-foreground/70 sm:px-3"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0 rounded-xl text-muted-foreground"
                    aria-label={`Remove ${row.name.trim() || n}`}
                    onClick={() => onRemove(i)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {error && (
                  <p id={errorId} className="mt-1 text-xs text-destructive">
                    {error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rows.length < MAX_ROWS ? (
        <Button
          type="button"
          variant="ghost"
          className="mt-1 -ml-2 h-11 rounded-xl px-2 text-muted-foreground"
          onClick={onAdd}
        >
          <Plus /> Add {group.addLabel}
        </Button>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">That&apos;s the limit of {MAX_ROWS} in one group.</p>
      )}
    </div>
  );
}

/**
 * One bar, as wide as the bigger side. Own more than you owe: your assets,
 * split into what's still owed and what's yours. Owe more: your debts, split
 * into what your assets would cover and the shortfall.
 */
function OwnOweBar({ split, locale }: { split: Split | null; locale: string }) {
  if (!split) return null;
  const pct = (v: number) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(v / 100);
  const parts =
    split.whole === "assets"
      ? [
          { label: "Owed", value: split.owed, swatch: SWATCH.owed },
          { label: "Yours", value: split.yours, swatch: SWATCH.yours },
        ]
      : [
          { label: "Covered by assets", value: split.covered, swatch: SWATCH.owed },
          { label: "Shortfall", value: split.shortfall, swatch: SWATCH.shortfall },
        ];
  const caption = split.whole === "assets" ? "Of everything you own" : "Of everything you owe";

  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">{caption}</p>
      <div
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${caption}: ${parts.map((p) => `${p.label} ${pct(p.value)}`).join(", ")}`}
      >
        {parts.map((p) =>
          p.value > 0 ? <div key={p.label} className={p.swatch} style={{ width: `${p.value}%` }} /> : null,
        )}
      </div>
      <div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground tabular-nums" aria-hidden>
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", p.swatch)} />
            {p.label} {pct(p.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function SnapshotHistory({
  snapshots,
  locale,
  money,
  signed,
  onLoad,
  onClear,
}: {
  snapshots: Snapshot[];
  locale: string;
  money: (v: number, currency: string) => string;
  signed: (v: number, currency: string) => string;
  onLoad: (snap: Snapshot) => void;
  onClear: () => void;
}) {
  // Newest first, each compared with the snapshot before it in the same currency.
  const rows = snapshots
    .map((snap, i) => {
      const prev = baselineSnapshot(snapshots.slice(0, i), snap.date, snap.currency);
      return { snap, change: prev ? changeBetween(prev.netWorth, snap.netWorth) : null };
    })
    .reverse();

  return (
    <ToolPanel as="section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Your snapshots</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Kept in this browser only. Up to {MAX_SNAPSHOTS} — the oldest drop off.
          </p>
        </div>
        <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={onClear}>
          <Trash2 /> Clear history
        </Button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[24rem] text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-3 text-left font-medium">
                Date
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Net worth
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Change
              </th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">
                <span className="sr-only">Load</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ snap, change }) => (
              <tr key={snap.date} className="border-t">
                <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">
                  {dateLabel(snap.date, locale)}
                </th>
                <td className="px-3 py-2 text-right font-medium">{money(snap.netWorth, snap.currency)}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-right",
                    change && change.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                  )}
                >
                  {change ? signed(change.amount, snap.currency) : EMPTY}
                </td>
                <td className="py-1 pl-3 text-right">
                  {hasInputs(snap) && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 rounded-lg px-2.5"
                      aria-label={`Load the numbers from ${dateLabel(snap.date, locale)}`}
                      onClick={() => onLoad(snap)}
                    >
                      Load
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ToolPanel>
  );
}
