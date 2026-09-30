import { cn } from "@/lib/utils";

/**
 * Hub-card picture for `/tools/freelance-rate-calculator`: the default plan
 * ($60,000 take-home, $6,000 expenses, 25% tax, 6 weeks off, 25 billable
 * hours a week) on a little rate card — $74.78 an hour, $598 a day — with the
 * bar of where each hour goes. The clock's minute hand sweeps round on hover.
 */

const paper = "rounded-md bg-white text-neutral-800 shadow-sm ring-1 ring-black/10";

/** Where each hour's rate goes, in percent — from `splitShares` on the default plan. */
const SPLIT = [
  { label: "You", share: 70, swatch: "bg-emerald-400" },
  { label: "Tax", share: 23, swatch: "bg-neutral-300" },
  { label: "Costs", share: 7, swatch: "bg-amber-300" },
];

export function Preview() {
  return (
    <div
      className={cn(
        paper,
        "w-48 p-2.5 text-[8px] leading-tight transition-transform duration-300 motion-safe:group-hover:-translate-y-1",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold tracking-wider text-neutral-500">RATE CARD</span>
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
          <circle cx="10" cy="10" r="8.5" className="fill-sky-50 stroke-sky-300" strokeWidth={1.5} />
          <line x1="10" y1="10" x2="13.5" y2="12" className="stroke-neutral-700" strokeWidth={1.5} strokeLinecap="round" />
          {/* The minute hand: a full sweep round the dial on hover. */}
          <line
            x1="10"
            y1="10"
            x2="10"
            y2="4"
            className="origin-center stroke-neutral-700 transition-transform duration-700 ease-in-out motion-safe:group-hover:rotate-[360deg]"
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        </svg>
      </div>

      <p className="mt-1.5 flex items-baseline gap-1">
        <span className="text-xl leading-none font-semibold tabular-nums">$74.78</span>
        <span className="text-neutral-500">/ hour</span>
      </p>
      <p className="mt-1 flex justify-between text-neutral-500">
        <span>Day rate (8 h)</span>
        <span className="font-semibold text-neutral-800 tabular-nums">$598</span>
      </p>

      <div className="mt-2 flex h-1.5 gap-px overflow-hidden rounded-full" aria-hidden>
        {SPLIT.map((p) => (
          <span key={p.label} style={{ width: `${p.share}%` }} className={p.swatch} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[7px] text-neutral-500 tabular-nums">
        {SPLIT.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-0.5">
            <span className={cn("size-1.5 rounded-full", p.swatch)} />
            {p.label} {p.share}%
          </span>
        ))}
      </div>
    </div>
  );
}
