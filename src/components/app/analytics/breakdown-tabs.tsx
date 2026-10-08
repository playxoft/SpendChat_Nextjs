"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BreakdownRow } from "@/lib/insights";
import { formatMoney } from "@/lib/money";

type Tab = { value: string; label: string; rows: BreakdownRow[]; empty: string };

/**
 * Where the money went in the range, three ways — by payee (the entry's
 * title), by tag and by profile — as ranked bars. One series per list, so one
 * colour: the bar is the neutral foreground, and a tag's own colour only marks
 * its dot.
 */
export function BreakdownTabs({
  payees,
  tags,
  profiles,
  currency,
  locale,
}: {
  payees: BreakdownRow[];
  tags: BreakdownRow[];
  /** Null when one profile is selected (or there's only one). */
  profiles: BreakdownRow[] | null;
  currency: string;
  locale: string;
}) {
  const tabs: Tab[] = [
    {
      value: "payees",
      label: "Payees",
      rows: payees,
      empty: "Entries with a title show up here, grouped by it.",
    },
    { value: "tags", label: "Tags", rows: tags, empty: "No tagged spending in this range." },
    ...(profiles
      ? [{ value: "profiles", label: "Profiles", rows: profiles, empty: "No spending in this range." }]
      : []),
  ];

  return (
    <Tabs defaultValue="payees" className="gap-3">
      <TabsList className="max-w-full">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="px-3">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          <RankedBars rows={t.rows} empty={t.empty} currency={currency} locale={locale} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function RankedBars({
  rows,
  empty,
  currency,
  locale,
}: {
  rows: BreakdownRow[];
  empty: string;
  currency: string;
  locale: string;
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {r.color ? (
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />
              ) : null}
              <span className="truncate">
                {r.icon ? `${r.icon} ` : ""}
                {r.label}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">
              {formatMoney(r.total, currency, locale)}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {r.count === 1 ? "1 entry" : `${r.count} entries`}
              </span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-foreground/60" style={{ width: `${(r.total / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
