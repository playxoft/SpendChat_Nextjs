import { ArrowRight } from "lucide-react";
import { FaCheck } from "react-icons/fa6";
import { cn } from "@/lib/utils";

/**
 * Hub-card picture for `/tools/split-bill-calculator`: a ₹3,600 dinner Asha
 * paid for, split three ways (₹1,200 each, from `computeShares`), and the two
 * payments that settle it. On hover the rows tick off one after the other and
 * a "Settled Up" chip drops in.
 */

const paper = "rounded-md bg-white text-neutral-800 shadow-sm ring-1 ring-black/10";

const PEOPLE: Record<string, string> = {
  A: "bg-sky-200 text-sky-900",
  B: "bg-amber-200 text-amber-900",
  C: "bg-rose-200 text-rose-900",
};

const PAYMENTS = [
  { from: "B", to: "A", amount: "₹1,200" },
  { from: "C", to: "A", amount: "₹1,200" },
];

function Avatar({ initial }: { initial: string }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full text-[7px] font-bold",
        PEOPLE[initial],
      )}
    >
      {initial}
    </span>
  );
}

export function Preview() {
  return (
    <div className="relative w-44 transition-transform duration-300 motion-safe:group-hover:-translate-y-1">
      <div className={cn(paper, "p-2.5")}>
        <div className="flex items-center justify-between border-b border-neutral-200 pb-1.5">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold leading-tight">Dinner · 3 ways</p>
            <p className="text-[7px] text-neutral-500">Asha paid</p>
          </div>
          <p className="text-sm leading-none font-semibold tabular-nums">₹3,600</p>
        </div>
        <ul className="mt-1.5 space-y-1">
          {PAYMENTS.map((p, i) => (
            <li key={p.from} className="flex items-center gap-1 text-[9px]">
              <Avatar initial={p.from} />
              <ArrowRight className="size-2.5 text-neutral-400" aria-hidden />
              <Avatar initial={p.to} />
              <span className="ml-auto font-mono font-semibold tabular-nums">{p.amount}</span>
              <span
                style={{ transitionDelay: `${150 + i * 200}ms` }}
                className="flex size-3 items-center justify-center rounded-full bg-emerald-500 text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              >
                <FaCheck className="size-1.5" aria-hidden />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <span className="pointer-events-none absolute -right-2 -bottom-2.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700 opacity-0 ring-1 ring-emerald-500/30 group-hover:animate-tool-drop">
        <FaCheck className="size-2" aria-hidden /> Settled Up
      </span>
    </div>
  );
}
