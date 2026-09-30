import { FaCheck } from "react-icons/fa6";
import { cn } from "@/lib/utils";

/**
 * Hub-card picture for `/tools/net-worth-calculator`: the page's worked
 * example — $392,000 owned against $230,500 owed, a net worth of $161,500
 * (from `src/lib/tools/net-worth.ts`). The two columns are drawn to scale; on
 * hover they build up and a "Snapshot saved" chip drops in.
 */

/** What the example owns, as shares of the "Own" column: home, investments + pension, cash + car. */
const OWN = [
  { share: 77, className: "bg-sky-300" },
  { share: 16, className: "bg-sky-200" },
  { share: 7, className: "bg-emerald-300" },
];
/** Mortgage, then the car loan and card. */
const OWE = [
  { share: 95, className: "bg-rose-200" },
  { share: 5, className: "bg-rose-300" },
];

const COLUMNS = [
  { label: "Own", height: "100%", parts: OWN },
  // 230,500 ÷ 392,000 = 59% of the "Own" column's height.
  { label: "Owe", height: "59%", parts: OWE },
];

export function Preview() {
  return (
    <div className="flex items-end gap-4">
      <div aria-hidden>
        <div className="flex h-20 items-end gap-2">
          {COLUMNS.map((c, i) => (
            <span
              key={c.label}
              style={{ height: c.height, animationDelay: `${i * 120}ms` }}
              className="flex w-8 origin-bottom flex-col-reverse overflow-hidden rounded-t-sm ring-1 ring-black/5 group-hover:animate-tool-grow"
            >
              {c.parts.map((p, k) => (
                <span key={k} style={{ height: `${p.share}%` }} className={cn("block w-full shrink-0", p.className)} />
              ))}
            </span>
          ))}
        </div>
        <div className="mt-1 flex gap-2 text-[9px] text-muted-foreground">
          {COLUMNS.map((c) => (
            <span key={c.label} className="w-8 text-center">
              {c.label}
            </span>
          ))}
        </div>
      </div>
      <div className="pb-3">
        <p className="text-[10px] text-muted-foreground">Net worth</p>
        <p className="text-xl font-semibold tracking-tight tabular-nums">$161,500</p>
        <p className="font-mono text-[9px] text-muted-foreground tabular-nums">392,000 − 230,500</p>
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium text-emerald-700 ring-1 ring-emerald-500/20 group-hover:animate-tool-drop dark:text-emerald-300">
          <FaCheck className="size-2" aria-hidden /> Snapshot saved
        </span>
      </div>
    </div>
  );
}
