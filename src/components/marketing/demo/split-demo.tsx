"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoFrame } from "./demo-frame";
import { DemoReplay } from "./demo-replay";
import { demoAmount, useDemoMoney } from "@/hooks/use-demo-currency";
import { formatMoney } from "@/lib/money";
import {
  computeShares,
  netBalances,
  suggestSettlements,
  toBasisPoints,
  type ShareAmount,
  type ShareSpec,
} from "@/lib/split-math";
import { cn } from "@/lib/utils";

/**
 * A four-person trip, run on the app's own split maths.
 *
 * Every share, balance and suggested payment on screen comes from
 * `src/lib/split-math.ts` — `computeShares` for each expense, `netBalances`
 * for who's up and who's down, `suggestSettlements` for who pays whom
 * that clear it — the functions the server runs before it stores anything. So
 * switching the dinner from Equal to Percent moves the leftover cent exactly
 * where the app would put it.
 *
 * Three things to try: change how the dinner is split, press "Mark as paid"
 * until the group is Settled Up, and add your share of an expense to your own
 * books. All `useState`; nothing leaves the page.
 *
 * Member ids sort in join order (like the app's uuidv7 ids), so the
 * tie-breaking order matches. Seeds are USD minor units, rescaled into the
 * visitor's currency by `demoAmount()`.
 */

const PEOPLE = [
  { id: "m1", name: "You" },
  { id: "m2", name: "Priya" },
  { id: "m3", name: "Sam" },
  { id: "m4", name: "Leo" },
] as const;
const ALL = PEOPLE.map((p) => p.id);
const nameOf = (id: string) => PEOPLE.find((p) => p.id === id)?.name ?? "";

type SplitMode = "equal" | "exact" | "percent";
const MODES: { id: SplitMode; label: string }[] = [
  { id: "equal", label: "Equal" },
  { id: "exact", label: "Exact" },
  { id: "percent", label: "Percent" },
];

type Payment = { from: string; to: string; amountMinor: number };

export function SplitDemo() {
  const money = useDemoMoney();
  const [mode, setMode] = useState<SplitMode>("equal");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [added, setAdded] = useState<string[]>([]);

  const unit = 10 ** money.currency.decimals;
  const scale = (usd: number) => demoAmount(usd, money);
  const fmt = (minor: number) => formatMoney(minor, money.code, money.locale);

  // The dinner, divided the way the visitor picked. Exact amounts are typed in
  // whole units, as people do, and must add up — so the last one takes the rest.
  const dinnerTotal = scale(13_000);
  const dinnerSpec = (): ShareSpec => {
    if (mode === "equal") return { type: "equal", memberIds: ALL };
    if (mode === "percent") {
      return {
        type: "percent",
        shares: [
          { memberId: "m1", bp: toBasisPoints(40) },
          { memberId: "m2", bp: toBasisPoints(20) },
          { memberId: "m3", bp: toBasisPoints(20) },
          { memberId: "m4", bp: toBasisPoints(20) },
        ],
      };
    }
    const you = Math.round((dinnerTotal * 0.45) / unit) * unit;
    const priya = Math.round((dinnerTotal * 0.3) / unit) * unit;
    return {
      type: "exact",
      shares: [
        { memberId: "m1", amountMinor: you },
        { memberId: "m2", amountMinor: priya },
        { memberId: "m3", amountMinor: dinnerTotal - you - priya },
        { memberId: "m4", amountMinor: 0 },
      ],
    };
  };

  const expenses: { id: string; title: string; paidBy: string; total: number; shares: ShareAmount[]; note: string }[] = [
    {
      id: "cab",
      title: "Airport cab",
      paidBy: "m2",
      total: scale(4_800),
      shares: computeShares(scale(4_800), "m2", { type: "equal", memberIds: ALL }),
      note: "Equal",
    },
    {
      id: "dinner",
      title: "Beach dinner",
      paidBy: "m1",
      total: dinnerTotal,
      shares: computeShares(dinnerTotal, "m1", dinnerSpec()),
      note: mode === "exact" ? "Exact · Leo skipped it" : mode === "percent" ? "Percent · 40 / 20 / 20 / 20" : "Equal",
    },
    {
      id: "villa",
      title: "Villa, two nights",
      paidBy: "m3",
      total: scale(36_000),
      shares: computeShares(scale(36_000), "m3", { type: "equal", memberIds: ALL }),
      note: "Equal",
    },
  ];

  const sum = (rows: { id: string; v: number }[]) =>
    rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.id]: (acc[r.id] ?? 0) + r.v }), {});
  const balances = netBalances(ALL, {
    paid: sum(expenses.map((e) => ({ id: e.paidBy, v: e.total }))),
    owed: sum(expenses.flatMap((e) => e.shares.map((s) => ({ id: s.memberId, v: s.amountMinor })))),
    sent: sum(payments.map((p) => ({ id: p.from, v: p.amountMinor }))),
    received: sum(payments.map((p) => ({ id: p.to, v: p.amountMinor }))),
  });
  const suggestions = suggestSettlements(balances);
  const settled = suggestions.length === 0;

  function reset() {
    setMode("equal");
    setPayments([]);
    setAdded([]);
  }

  return (
    <>
      <DemoFrame
        label="Interactive split demo"
        sidebar={false}
        className="h-[38rem]"
        header={
          <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
            <span aria-hidden className="text-xl">🏖️</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">Goa trip</p>
              <p className="text-xs text-muted-foreground">
                {PEOPLE.length} people · {money.code}
              </p>
            </div>
            {settled && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
                <Check className="size-3.5" /> Settled Up
              </span>
            )}
          </div>
        }
        bodyClassName="overflow-y-auto"
      >
        <div className="grid gap-5 px-4 py-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section aria-label="Expenses" className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Expenses</p>
            {expenses.map((e) => {
              const mine = e.shares.find((s) => s.memberId === "m1");
              return (
                <div key={e.id} className="rounded-xl border bg-background p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{e.title}</p>
                    <p className="shrink-0 text-sm tabular-nums">{fmt(e.total)}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {nameOf(e.paidBy)} paid · {e.note}
                  </p>
                  {e.id === "dinner" && (
                    <div role="group" aria-label="How the dinner is split" className="mt-2 inline-flex rounded-full border bg-muted/50 p-0.5">
                      {MODES.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={mode === m.id}
                          onClick={() => setMode(m.id)}
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs transition-colors",
                            mode === m.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                    {e.shares.map((s) => `${nameOf(s.memberId)} ${fmt(s.amountMinor)}`).join(" · ")}
                  </p>
                  {mine && (
                    <button
                      type="button"
                      disabled={added.includes(e.id)}
                      onClick={() => setAdded((a) => [...a, e.id])}
                      className="mt-2 text-xs font-medium underline-offset-4 hover:underline disabled:no-underline disabled:opacity-70"
                    >
                      {added.includes(e.id)
                        ? `Your ${fmt(mine.amountMinor)} is in your Personal profile`
                        : "Add my share to my workspace"}
                    </button>
                  )}
                </div>
              );
            })}
          </section>

          <section aria-label="Balances" className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Balances</p>
              <ul className="mt-2 divide-y rounded-xl border bg-background">
                {balances.map((b) => (
                  <li key={b.memberId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>{nameOf(b.memberId)}</span>
                    {b.netMinor === 0 ? (
                      <span className="text-xs text-muted-foreground">settled up</span>
                    ) : b.netMinor > 0 ? (
                      <span className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                        {b.memberId === "m1" ? "you're owed" : "is owed"} {fmt(b.netMinor)}
                      </span>
                    ) : (
                      <span className="text-xs tabular-nums">
                        {b.memberId === "m1" ? "you owe" : "owes"} {fmt(-b.netMinor)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div aria-live="polite">
              <p className="text-xs font-medium text-muted-foreground">Settle up</p>
              {settled ? (
                <p className="mt-2 rounded-xl border border-dashed px-3 py-3 text-xs text-muted-foreground">
                  Everyone is settled up. Nobody had to chase anybody.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {suggestions.map((s) => (
                    <li
                      key={`${s.fromMemberId}-${s.toMemberId}`}
                      className="flex flex-wrap items-center gap-2 rounded-xl border bg-background px-3 py-2 text-xs"
                    >
                      <span className="font-medium">{nameOf(s.fromMemberId)}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-label="pays" />
                      <span className="font-medium">{nameOf(s.toMemberId)}</span>
                      <span className="tabular-nums">{fmt(s.amountMinor)}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="ml-auto h-7 rounded-full px-2.5 text-xs"
                        onClick={() =>
                          setPayments((p) => [...p, { from: s.fromMemberId, to: s.toMemberId, amountMinor: s.amountMinor }])
                        }
                      >
                        Mark as paid
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {!settled && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {suggestions.length} {suggestions.length === 1 ? "payment settles" : "payments settle"} the whole trip.
                </p>
              )}
            </div>
          </section>
        </div>
      </DemoFrame>
      <DemoReplay onClick={reset} label="Reset" />
    </>
  );
}
