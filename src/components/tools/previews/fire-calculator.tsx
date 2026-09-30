import { FaFlagCheckered } from "react-icons/fa6";
import { cn } from "@/lib/utils";

/**
 * Hub-card picture for `/tools/fire-calculator`: the page's worked example —
 * $100,000 invested plus $2,500 a month at a 5% real return reaches a
 * $1,000,000 FIRE number in 16 years 9 months, at age 46 (from
 * `src/lib/tools/fire.ts`). Each bar is the balance every two years, to scale
 * against the dashed FIRE line; on hover the bars build up and the flag drops
 * onto the one that crosses it.
 */

/** Balance at ages 30, 32 … 46 and at FIRE (46¾), as a percentage of the chart; the FIRE line sits at 82%. */
const PATH = [8, 14, 21, 28, 36, 45, 55, 66, 77, 82];
const LINE = 82;

export function Preview() {
  return (
    <div className="w-52" aria-hidden>
      <div className="relative h-20">
        <div className="absolute inset-0 flex items-end gap-1">
          {PATH.map((h, k) => (
            <span
              key={k}
              style={{ height: `${h}%`, animationDelay: `${k * 50}ms` }}
              className={cn(
                "flex-1 origin-bottom rounded-t-sm group-hover:animate-tool-grow",
                k === PATH.length - 1 ? "bg-emerald-500" : "bg-emerald-500/40",
              )}
            />
          ))}
        </div>
        <div style={{ bottom: `${LINE}%` }} className="absolute inset-x-0 border-t border-dashed border-foreground/60" />
        <span
          style={{ bottom: `${LINE}%` }}
          className="absolute left-0 mb-0.5 text-[8px] font-medium text-muted-foreground tabular-nums"
        >
          FIRE number $1,000,000
        </span>
        <FaFlagCheckered
          style={{ bottom: `${LINE}%` }}
          className="absolute right-0 mb-0.5 size-3.5 text-foreground group-hover:animate-tool-drop"
        />
      </div>
      <div className="mt-2 flex items-baseline justify-between text-[9px] text-muted-foreground">
        <span className="tabular-nums">Age 30 · $100,000</span>
        <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background tabular-nums">
          FIRE at 46
        </span>
      </div>
    </div>
  );
}
