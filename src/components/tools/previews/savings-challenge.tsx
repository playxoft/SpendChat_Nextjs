import { cn } from "@/lib/utils";

/**
 * Hub-card picture for `/tools/savings-challenge`: a paper 52-week tracker in
 * euros (any currency is the point) with the first 12 weeks ticked — €1 + €2 +
 * … + €12 = €78 of €1,378. On hover week 13 drops into place and the total
 * ticks over to €91.
 */

const WEEKS = 52;
const DONE = 12;

export function Preview() {
  return (
    <div className="w-48 rounded-md bg-white p-2.5 text-[8px] leading-tight text-neutral-800 shadow-sm ring-1 ring-black/10 transition-transform duration-300 motion-safe:group-hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <span className="font-bold tracking-wider">52-WEEK CHALLENGE</span>
        <span className="font-semibold text-neutral-500 tabular-nums">€1,378</span>
      </div>
      <div className="mt-2 grid grid-cols-13 gap-[2px]" aria-hidden>
        {Array.from({ length: WEEKS }, (_, i) => (
          <span
            key={i}
            className={cn(
              "relative aspect-square rounded-[2px]",
              i < DONE ? "bg-emerald-400" : "bg-neutral-100 ring-1 ring-neutral-200 ring-inset",
            )}
          >
            {i === DONE && (
              <span className="absolute inset-0 rounded-[2px] bg-emerald-400 opacity-0 group-hover:animate-tool-drop" />
            )}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-neutral-500">Saved so far</span>
        <span className="relative text-[10px] font-semibold tabular-nums">
          <span className="transition-opacity duration-300 group-hover:opacity-0">€78</span>
          <span className="absolute right-0 text-emerald-600 opacity-0 transition-opacity delay-700 duration-300 group-hover:opacity-100">
            €91
          </span>
        </span>
      </div>
    </div>
  );
}
