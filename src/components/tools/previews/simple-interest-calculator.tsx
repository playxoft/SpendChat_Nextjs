import { cn } from "@/lib/utils";

/**
 * Hub-card picture for `/tools/simple-interest-calculator`: the textbook sum
 * (10,000 at 7% for 3 years = 2,100) on a slip of paper, beside three years of
 * bars that each add the same block of interest — simple interest grows in a
 * straight line. On hover the answer is highlighted and the blocks stack up.
 */

const paper = "rounded-md bg-white text-neutral-800 shadow-sm ring-1 ring-black/10";

const YEARS = [1, 2, 3];

export function Preview() {
  return (
    <div className="flex items-end gap-3">
      <div
        className={cn(
          paper,
          "w-32 p-2.5 font-mono text-[9px] leading-relaxed transition-transform duration-300 motion-safe:group-hover:-translate-y-1",
        )}
      >
        <p className="text-[8px] font-bold tracking-[0.15em] text-neutral-500">SI = P×R×T÷100</p>
        <p className="mt-1">10,000 × 7 × 3</p>
        <p>÷ 100</p>
        <p className="mt-1 flex justify-between border-t border-dashed border-neutral-300 pt-1 font-bold">
          <span>SI</span>
          <span className="-mx-0.5 rounded px-0.5 transition-colors duration-300 group-hover:bg-amber-100 group-hover:text-amber-900">
            2,100
          </span>
        </p>
      </div>

      <div aria-hidden>
        <div className="flex items-end gap-1.5">
          {YEARS.map((year) => (
            <div key={year} className="flex w-6 flex-col items-center">
              {/* One equal block of interest per year, stacked on the same principal. */}
              <div className="flex w-full flex-col-reverse gap-0.5">
                <span className="h-10 rounded-b-sm bg-muted-foreground/35" />
                {Array.from({ length: year }, (_, i) => (
                  <span
                    key={i}
                    style={{ animationDelay: `${(year - 1) * 120 + i * 60}ms` }}
                    className={cn(
                      "h-2.5 origin-bottom bg-emerald-500/80 group-hover:animate-tool-grow",
                      i === year - 1 && "rounded-t-sm",
                    )}
                  />
                ))}
              </div>
              <span className="mt-1 text-[8px] text-muted-foreground">Y{year}</span>
            </div>
          ))}
        </div>
        <p className="mt-0.5 text-[9px] font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
          +700 a year
        </p>
      </div>
    </div>
  );
}
