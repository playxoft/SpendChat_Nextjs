import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hub-card picture for `/tools/inflation-calculator`: $100 from 2000 is
 * $182.17 in 2024 money (World Bank US CPI, via `adjustForInflation`), as two
 * price tags over the CPI's actual path between them. On hover the newer tag
 * swings on its string and the line draws itself again.
 */

/** US CPI 2000–2024, scaled into the 208 × 40 box it's drawn in (low at the bottom). */
const PATH =
  "0,38 8.7,36.8 17.3,36.2 26,35.2 34.7,34 43.3,32.5 52,30.9 60.7,29.6 69.3,27.6 78,27.8 86.7,27 " +
  "95.3,25.3 104,24.2 112.7,23.4 121.3,22.5 130,22.4 138.7,21.7 147.3,20.5 156,19 164.7,17.9 " +
  "173.3,17.2 182,14.3 190.7,9.1 199.3,6.2 208,4";

function Tag({ year, price, className }: { year: string; price: string; className?: string }) {
  return (
    <div
      className={cn(
        "relative rounded-md bg-white py-1 pr-2.5 pl-4 text-neutral-800 shadow-sm ring-1 ring-black/10",
        className,
      )}
    >
      {/* The tag's string hole. */}
      <span className="absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full bg-neutral-100 ring-1 ring-neutral-300" />
      <p className="text-[8px] font-medium tracking-wider text-neutral-500 tabular-nums">{year}</p>
      <p className="text-sm leading-tight font-semibold tabular-nums">{price}</p>
    </div>
  );
}

export function Preview() {
  return (
    <div className="w-52">
      <div className="flex items-center justify-between gap-2">
        <Tag year="2000" price="$100" />
        <ArrowRight
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-300 motion-safe:group-hover:translate-x-1"
        />
        <Tag
          year="2024"
          price="$182.17"
          className="origin-left transition-transform duration-500 ease-[cubic-bezier(0.2,1.6,0.4,1)] motion-safe:group-hover:rotate-6"
        />
      </div>
      <svg viewBox="0 0 208 40" className="mt-2.5 h-10 w-52 overflow-visible" aria-hidden>
        <line x1="0" y1="39.5" x2="208" y2="39.5" className="stroke-muted-foreground/30" strokeWidth={1} />
        <polyline
          points={PATH}
          pathLength={100}
          strokeDasharray={100}
          className="fill-none stroke-rose-400 group-hover:animate-tool-sign"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <p className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>Prices +82%</span>
        <span>2.5% a year</span>
      </p>
    </div>
  );
}
