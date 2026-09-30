import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hub-card picture for `/tools/inflation-calculator`: 100 from 2000 in three
 * countries' 2024 money — ₹418.86 in India, $182.17 in the US, £180.94 in
 * the UK (World Bank CPI, via `compareInflation`) — over the three indexed
 * price paths, each starting at 100. On hover the price card swings on its
 * string and the lines draw themselves again, one after another.
 */

/** Each country's CPI 2000–2024 with 2000 = 100, scaled into the 208 × 40 box (100 at the bottom, 420 at the top). */
const LINES = [
  {
    code: "IN",
    price: "₹419",
    dot: "bg-rose-400",
    stroke: "stroke-rose-400",
    delay: "",
    points:
      "0,38 8.7,37.6 17.3,37.1 26,36.6 34.7,36.1 43.3,35.6 52,34.8 60.7,33.9 69.3,32.6 78,30.8 86.7,28.5 " +
      "95.3,26.7 104,24.6 112.7,22.1 121.3,20.3 130,18.9 138.7,17.4 147.3,16.3 156,15 164.7,13.7 173.3,11.4 " +
      "182,9.4 190.7,6.7 199.3,4.4 208,2.1",
  },
  {
    code: "US",
    price: "$182",
    dot: "bg-sky-400",
    stroke: "stroke-sky-400",
    delay: "[animation-delay:120ms] [animation-fill-mode:backwards]",
    points:
      "0,38 8.7,37.7 17.3,37.5 26,37.2 34.7,36.9 43.3,36.5 52,36.1 60.7,35.7 69.3,35.2 78,35.2 86.7,35 " +
      "95.3,34.6 104,34.3 112.7,34 121.3,33.8 130,33.8 138.7,33.6 147.3,33.2 156,32.8 164.7,32.5 173.3,32.3 " +
      "182,31.5 190.7,30.1 199.3,29.3 208,28.8",
  },
  {
    code: "UK",
    price: "£181",
    dot: "bg-amber-400",
    stroke: "stroke-amber-400",
    delay: "[animation-delay:240ms] [animation-fill-mode:backwards]",
    points:
      "0,38 8.7,37.8 17.3,37.7 26,37.5 34.7,37.3 43.3,37.1 52,36.8 60.7,36.5 69.3,36 78,35.8 86.7,35.4 " +
      "95.3,34.9 104,34.5 112.7,34.2 121.3,34 130,33.9 138.7,33.8 147.3,33.4 156,33 164.7,32.7 173.3,32.6 " +
      "182,32.1 190.7,30.8 199.3,29.5 208,28.9",
  },
];

/** A white price tag with its string hole. */
function Tag({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "relative rounded-md bg-white py-1 pr-2.5 pl-4 text-neutral-800 shadow-sm ring-1 ring-black/10",
        className,
      )}
    >
      <span className="absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full bg-neutral-100 ring-1 ring-neutral-300" />
      {children}
    </div>
  );
}

export function Preview() {
  return (
    <div className="w-52">
      <div className="flex items-center justify-between gap-2">
        <Tag>
          <p className="text-[8px] font-medium tracking-wider text-neutral-500 tabular-nums">2000</p>
          <p className="text-sm leading-tight font-semibold tabular-nums">100</p>
        </Tag>
        <ArrowRight
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-300 motion-safe:group-hover:translate-x-1"
        />
        <Tag className="origin-left transition-transform duration-500 ease-[cubic-bezier(0.2,1.6,0.4,1)] motion-safe:group-hover:rotate-3">
          <p className="text-[8px] font-medium tracking-wider text-neutral-500 tabular-nums">2024</p>
          <ul className="mt-0.5 space-y-px">
            {LINES.map((l) => (
              <li key={l.code} className="flex items-center gap-1.5 text-[10px] leading-tight tabular-nums">
                <span className={cn("size-1.5 shrink-0 rounded-full", l.dot)} />
                <span className="w-3.5 text-[8px] font-medium tracking-wider text-neutral-500">{l.code}</span>
                <span className="font-semibold">{l.price}</span>
              </li>
            ))}
          </ul>
        </Tag>
      </div>
      <svg viewBox="0 0 208 40" className="mt-2 h-10 w-52 overflow-visible" aria-hidden>
        <line x1="0" y1="39.5" x2="208" y2="39.5" className="stroke-muted-foreground/30" strokeWidth={1} />
        {LINES.map((l) => (
          <polyline
            key={l.code}
            points={l.points}
            pathLength={100}
            strokeDasharray={100}
            className={cn("fill-none group-hover:animate-tool-sign", l.stroke, l.delay)}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <p className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>2000 = 100</span>
        <span>3 countries compared</span>
      </p>
    </div>
  );
}
