"use client";

import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NumberField, Segmented } from "@/components/tools/fields";
import { ResultActions, ToolPanel } from "@/components/tools/result";
import { useToolLocale, useUrlState } from "@/components/tools/tool-state";
import { EMPTY, formatNumber, formatPercent, parseNumber } from "@/lib/tools/format";
import {
  applyPercent,
  discount,
  percentChange,
  percentDifference,
  percentOf,
  whatPercent,
} from "@/lib/tools/percentage";

/**
 * Six small calculators on one screen instead of one calculator with a mode
 * switch: people arrive with one of these questions already in mind, and
 * scanning for it beats guessing which tab it hides under. Each card answers
 * as you type and shows its working.
 */

// Short, stable query keys — they're in every shared link.
const DEFAULTS = {
  p: "15",
  of: "200",
  x: "30",
  y: "200",
  from: "80",
  to: "100",
  base: "200",
  pct: "10",
  dir: "up",
  a: "40",
  b: "60",
  price: "1200",
  off: "25",
};

export function PercentageTool() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const locale = useToolLocale();
  const n = (v: string) => parseNumber(v, locale);
  const num = (v: number) => formatNumber(v, locale, 4);
  const pc = (v: number) => formatPercent(v, locale, 4);

  // --- X% of Y
  const p = n(s.p);
  const of = n(s.of);
  const ofResult = p !== null && of !== null ? percentOf(p, of) : null;

  // --- X is what % of Y
  const x = n(s.x);
  const y = n(s.y);
  const whatResult = x !== null && y !== null ? whatPercent(x, y) : null;

  // --- % change
  const from = n(s.from);
  const to = n(s.to);
  const changeResult = from !== null && to !== null ? percentChange(from, to) : null;

  // --- increase / decrease
  const base = n(s.base);
  const pct = n(s.pct);
  const dir = s.dir === "down" ? "down" : "up";
  const applied = base !== null && pct !== null ? applyPercent(base, pct, dir) : null;

  // --- percent difference
  const a = n(s.a);
  const b = n(s.b);
  const diffResult = a !== null && b !== null ? percentDifference(a, b) : null;

  // --- discount
  const price = n(s.price);
  const off = n(s.off);
  const sale = price !== null && off !== null ? discount(price, off) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          id="percent-of"
          title="What is X% of Y?"
          answer={ofResult === null ? null : num(ofResult)}
          working={
            ofResult === null ? null : `${num(p!)} ÷ 100 × ${num(of!)} = ${num(ofResult)}`
          }
          sentence={
            ofResult === null ? null : `${pc(p!)} of ${num(of!)} is ${num(ofResult)}`
          }
        >
          <NumberField label="Percent" suffix="%" value={s.p} onChange={(v) => set({ p: v })} />
          <NumberField label="Of" value={s.of} onChange={(v) => set({ of: v })} />
        </Card>

        <Card
          id="what-percent"
          title="X is what percent of Y?"
          answer={whatResult === null ? null : pc(whatResult)}
          empty={y === 0 ? "Y can't be zero — nothing is a percentage of zero." : undefined}
          working={
            whatResult === null ? null : `${num(x!)} ÷ ${num(y!)} × 100 = ${pc(whatResult)}`
          }
          sentence={
            whatResult === null ? null : `${num(x!)} is ${pc(whatResult)} of ${num(y!)}`
          }
        >
          <NumberField label="Value (X)" value={s.x} onChange={(v) => set({ x: v })} />
          <NumberField label="Total (Y)" value={s.y} onChange={(v) => set({ y: v })} />
        </Card>

        <Card
          id="percentage-change"
          title="Percentage change from A to B"
          answer={
            changeResult === null
              ? null
              : `${changeResult > 0 ? "+" : ""}${pc(changeResult)}`
          }
          answerNote={
            changeResult === null
              ? undefined
              : changeResult > 0
                ? "increase"
                : changeResult < 0
                  ? "decrease"
                  : "no change"
          }
          empty={from === 0 ? "The starting value can't be zero — any rise from zero is infinite." : undefined}
          working={
            changeResult === null
              ? null
              : `(${num(to!)} − ${num(from!)}) ÷ ${num(Math.abs(from!))} × 100 = ${pc(changeResult)}`
          }
          sentence={
            changeResult === null
              ? null
              : `From ${num(from!)} to ${num(to!)} is a ${pc(Math.abs(changeResult))} ${changeResult >= 0 ? "increase" : "decrease"}`
          }
        >
          <NumberField label="From (A)" value={s.from} onChange={(v) => set({ from: v })} />
          <NumberField label="To (B)" value={s.to} onChange={(v) => set({ to: v })} />
        </Card>

        <Card
          id="increase-decrease"
          title="Increase or decrease by a percentage"
          answer={applied === null ? null : num(applied)}
          working={
            applied === null
              ? null
              : `${num(base!)} × (1 ${dir === "up" ? "+" : "−"} ${num(pct!)} ÷ 100) = ${num(applied)}`
          }
          sentence={
            applied === null
              ? null
              : `${num(base!)} ${dir === "up" ? "increased" : "decreased"} by ${pc(pct!)} is ${num(applied)}`
          }
          extra={
            <Segmented
              label="Direction"
              hideLabel
              value={dir}
              onChange={(v) => set({ dir: v })}
              options={[
                { value: "up", label: "Increase" },
                { value: "down", label: "Decrease" },
              ]}
            />
          }
        >
          <NumberField label="Value" value={s.base} onChange={(v) => set({ base: v })} />
          <NumberField label="By" suffix="%" value={s.pct} onChange={(v) => set({ pct: v })} />
        </Card>

        <Card
          id="discount"
          title="Discount: price after % off"
          answer={sale === null ? null : num(sale.final)}
          answerNote={sale === null ? undefined : `you save ${num(sale.saving)}`}
          working={
            sale === null
              ? null
              : `${num(price!)} − (${num(off!)} ÷ 100 × ${num(price!)}) = ${num(sale.final)}`
          }
          sentence={
            sale === null
              ? null
              : `${pc(off!)} off ${num(price!)} is ${num(sale.final)} (you save ${num(sale.saving)})`
          }
        >
          <NumberField label="Price" value={s.price} onChange={(v) => set({ price: v })} />
          <NumberField label="Discount" suffix="%" value={s.off} onChange={(v) => set({ off: v })} />
        </Card>

        <Card
          id="percent-difference"
          title="Percent difference between two numbers"
          answer={diffResult === null ? null : pc(diffResult)}
          working={
            diffResult === null
              ? null
              : `|${num(a!)} − ${num(b!)}| ÷ ((${num(Math.abs(a!))} + ${num(Math.abs(b!))}) ÷ 2) × 100 = ${pc(diffResult)}`
          }
          sentence={
            diffResult === null
              ? null
              : `${num(a!)} and ${num(b!)} differ by ${pc(diffResult)}`
          }
        >
          <NumberField label="First" value={s.a} onChange={(v) => set({ a: v })} />
          <NumberField label="Second" value={s.b} onChange={(v) => set({ b: v })} />
        </Card>
      </div>

      <ResultActions copy={null} withCurrency={false} onReset={reset} />
    </div>
  );
}

function Card({
  id,
  title,
  answer,
  answerNote,
  working,
  sentence,
  empty,
  extra,
  children,
}: {
  id: string;
  title: string;
  /** The formatted answer, or null when an input is missing or invalid. */
  answer: string | null;
  /** A word or two after the answer — "increase", "you save 300". */
  answerNote?: string;
  /** The calculation written out, for anyone checking (or learning) the method. */
  working: string | null;
  /** The answer as a sentence — what "Copy" puts on the clipboard. */
  sentence: string | null;
  /** Shown instead of the generic prompt when the inputs are valid but unanswerable. */
  empty?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ToolPanel as="section" className="flex flex-col gap-4 scroll-mt-24">
      <h2 id={id} className="font-medium">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3">{children}</div>
      {extra}
      <div className="mt-auto flex items-end justify-between gap-3 border-t pt-4" aria-live="polite">
        <div className="min-w-0">
          {answer === null ? (
            <p className="text-sm text-muted-foreground">
              {empty ?? "Enter both numbers to see the answer."}
            </p>
          ) : (
            <>
              <p className="text-2xl font-semibold tracking-tight tabular-nums break-words">
                {answer}
                {answerNote && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{answerNote}</span>
                )}
              </p>
              <p className="mt-1 font-mono text-xs break-words text-muted-foreground">
                {working ?? EMPTY}
              </p>
            </>
          )}
        </div>
        {sentence && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 text-muted-foreground"
            aria-label={`Copy: ${sentence}`}
            onClick={() =>
              navigator.clipboard.writeText(sentence).then(
                () => toast.success("Copied"),
                () => toast.error("Couldn't copy — your browser blocked clipboard access."),
              )
            }
          >
            <Copy />
          </Button>
        )}
      </div>
    </ToolPanel>
  );
}
