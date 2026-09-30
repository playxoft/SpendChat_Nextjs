import { Laptop } from "lucide-react";

/**
 * Hub-card picture for `/tools/when-can-i-afford-it`: a savings jar a quarter
 * full — ₹15,000 towards a ₹60,000 laptop — beside the answer at ₹5,000 a
 * month: 45,000 ÷ 5,000 = 9 months. On hover a coin drops in and the jar
 * fills to the top.
 */

export function Preview() {
  return (
    <div className="flex items-end gap-4">
      <div className="relative pt-3" aria-hidden>
        <span className="absolute top-0 left-1/2 z-10 -ml-[7px] size-3.5 rounded-full bg-amber-300 opacity-0 ring-1 ring-amber-500 group-hover:animate-tool-drop" />
        <div className="mx-auto h-1.5 w-9 rounded-t-sm bg-neutral-300 dark:bg-neutral-500" />
        <div className="relative h-20 w-14 overflow-hidden rounded-t-md rounded-b-xl border-2 border-neutral-300 dark:border-neutral-500">
          <span className="absolute inset-x-0 bottom-0 h-1/4 bg-emerald-400/80 transition-[height] duration-700 ease-out group-hover:h-full" />
          {/* Tick marks on the glass. */}
          <span className="absolute top-1/4 left-0 h-px w-2 bg-neutral-300 dark:bg-neutral-500" />
          <span className="absolute top-1/2 left-0 h-px w-2 bg-neutral-300 dark:bg-neutral-500" />
          <span className="absolute top-3/4 left-0 h-px w-2 bg-neutral-300 dark:bg-neutral-500" />
        </div>
      </div>
      <div className="pb-1">
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Laptop className="size-3" aria-hidden /> Laptop · ₹60,000
        </p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">9 months</p>
        <p className="text-[10px] text-muted-foreground tabular-nums">₹5,000 a month · ₹15,000 saved</p>
      </div>
    </div>
  );
}
