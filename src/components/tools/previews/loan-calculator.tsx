import { FaHouse } from "react-icons/fa6";
import { cn } from "@/lib/utils";

/**
 * Hub-card picture for `/tools/loan-calculator`: the EMI on a ₹10,00,000 home
 * loan at 8.5% for 20 years (₹8,678 — from `src/lib/tools/loan.ts`) beside the
 * same instalment through the years, its interest share shrinking from 81% in
 * year 1 to 4% in year 20 (the real split from that schedule). On hover the
 * slip lifts and the bars build up year by year.
 */

const paper = "rounded-md bg-white text-neutral-800 shadow-sm ring-1 ring-black/10";

/** Interest as a percentage of each sampled year's payments: years 1, 4, 6, 9, 11, 14, 17, 20. */
const INTEREST_SHARE = [81, 75, 71, 62, 55, 43, 26, 4];

export function Preview() {
  return (
    <div className="flex items-end gap-4">
      <div
        className={cn(
          paper,
          "w-[5.5rem] p-2.5 text-[8px] leading-tight transition-transform duration-300 motion-safe:group-hover:-translate-y-1",
        )}
      >
        <FaHouse className="size-3.5 text-sky-500" aria-hidden />
        <p className="mt-2 font-semibold tracking-wider text-neutral-500">EMI</p>
        <p className="text-[13px] font-bold tabular-nums">₹8,678</p>
        <p className="text-neutral-500">a month</p>
        <p className="mt-1.5 border-t border-neutral-200 pt-1 tabular-nums text-neutral-500">
          ₹10L at 8.5%
          <br />
          for 20 years
        </p>
      </div>

      <div aria-hidden>
        <div className="flex h-20 w-32 items-end gap-1">
          {INTEREST_SHARE.map((interest, k) => (
            // Every bar is the same height — the EMI never changes — only its mix does.
            <span
              key={k}
              style={{ animationDelay: `${k * 60}ms` }}
              className="flex h-full flex-1 origin-bottom flex-col overflow-hidden rounded-t-sm group-hover:animate-tool-grow"
            >
              <span style={{ height: `${interest}%` }} className="bg-amber-300" />
              <span className="flex-1 bg-sky-400" />
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-3 text-[9px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-sm bg-amber-300" /> Interest
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-sm bg-sky-400" /> Principal
          </span>
        </div>
      </div>
    </div>
  );
}
