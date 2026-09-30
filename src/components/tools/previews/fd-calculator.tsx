import { FaBuildingColumns } from "react-icons/fa6";
import { cn } from "@/lib/utils";

/**
 * Hub-card picture for `/tools/fd-calculator`: a fixed-deposit slip
 * (₹1,00,000 at 7% for 5 years, compounded quarterly, matures at ₹1,41,478 —
 * from `src/lib/tools/deposits.ts`) beside a stack of coins for the recurring
 * deposit. On hover the slip lifts, its maturity line lights up, and this
 * month's coin drops onto the stack.
 */

const paper = "rounded-md bg-white text-neutral-800 shadow-sm ring-1 ring-black/10";

const COINS = 4;

export function Preview() {
  return (
    <div className="flex items-end gap-4">
      <div
        className={cn(
          paper,
          "w-40 p-2.5 text-[8px] leading-tight transition-transform duration-300 motion-safe:group-hover:-translate-y-1",
        )}
      >
        <div className="flex items-center gap-1 font-bold tracking-wider">
          <FaBuildingColumns className="size-3 text-sky-500" aria-hidden />
          FIXED DEPOSIT
        </div>
        <div className="mt-2 space-y-1 tabular-nums">
          <p className="flex justify-between">
            <span className="text-neutral-500">Deposit</span>
            <span className="font-semibold">₹1,00,000</span>
          </p>
          <p className="flex justify-between">
            <span className="text-neutral-500">Rate · tenure</span>
            <span>7% · 5 yrs</span>
          </p>
        </div>
        <p className="-mx-1 mt-2 flex items-baseline justify-between rounded border-t border-neutral-200 px-1 pt-1.5 font-bold transition-colors duration-300 group-hover:bg-emerald-50">
          <span>Maturity</span>
          <span className="text-[10px] text-emerald-700">₹1,41,478</span>
        </p>
      </div>

      <div className="flex flex-col items-center" aria-hidden>
        {/* The recurring deposit: one coin a month, and next month's drops in on hover. */}
        <div className="relative flex flex-col-reverse items-center">
          {Array.from({ length: COINS }, (_, i) => (
            <span key={i} className="-mt-1 h-2.5 w-9 rounded-[50%] bg-amber-300 ring-1 ring-amber-500" />
          ))}
          <span className="-mt-1 h-2.5 w-9 rounded-[50%] bg-amber-200 opacity-0 ring-1 ring-amber-500 group-hover:animate-tool-drop" />
        </div>
        <span className="mt-1.5 text-[8px] font-semibold tracking-wider text-muted-foreground">RD</span>
      </div>
    </div>
  );
}
