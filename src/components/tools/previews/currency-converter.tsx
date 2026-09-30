import { ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hub-card picture for `/tools/currency-converter`: $100 in four currencies
 * at once (reference rates of 30 Sep 2026, via `src/lib/tools/currency.ts`),
 * on a little rate board whose rows flip over like a departures board on hover.
 */

const paper = "rounded-md bg-white text-neutral-800 shadow-sm ring-1 ring-black/10";

const ROWS = [
  { code: "INR", amount: "₹9,592.00", chip: "bg-amber-100 text-amber-900" },
  { code: "EUR", amount: "€88.05", chip: "bg-sky-100 text-sky-900" },
  { code: "GBP", amount: "£75.48", chip: "bg-rose-100 text-rose-900" },
  { code: "JPY", amount: "¥15,732", chip: "bg-emerald-100 text-emerald-900" },
];

export function Preview() {
  return (
    <div
      className={cn(
        paper,
        "w-48 p-2.5 transition-transform duration-300 motion-safe:group-hover:-translate-y-1",
      )}
    >
      <div className="flex items-center justify-between border-b border-neutral-200 pb-1.5">
        <p className="text-sm leading-none font-semibold tabular-nums">
          $100
          <span className="ml-1 text-[8px] font-bold tracking-wider text-neutral-500">USD</span>
        </p>
        <ArrowRightLeft
          aria-hidden
          className="size-3.5 text-neutral-500 transition-transform duration-500 group-hover:rotate-180"
        />
      </div>
      <ul className="mt-1.5 space-y-1 [perspective:400px]">
        {ROWS.map((r, i) => (
          <li
            key={r.code}
            style={{ animationDelay: `${i * 90}ms` }}
            className="flex origin-top items-center justify-between text-[9px] group-hover:animate-tool-flip"
          >
            <span className={cn("rounded-sm px-1 py-px text-[7px] font-bold tracking-wider", r.chip)}>
              {r.code}
            </span>
            <span className="font-mono font-semibold tabular-nums">{r.amount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
