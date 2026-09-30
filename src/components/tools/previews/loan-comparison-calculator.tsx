import { FaCheck } from "react-icons/fa6";
import { cn } from "@/lib/utils";

/**
 * Hub-card picture for `/tools/loan-comparison-calculator`: the page's worked
 * example — ₹5,00,000 for 5 years at 10.5% with ₹12,000 of fees against 11%
 * with ₹2,500, total costs ₹1,56,817 and ₹1,54,773 (from
 * `src/lib/tools/loan.ts`). The higher rate wins. On hover the losing offer's
 * fees light up and the cheaper offer lifts, its badge popping.
 */

const paper = "rounded-md bg-white text-neutral-800 shadow-sm ring-1 ring-black/10";

function Offer({
  name,
  rate,
  fees,
  total,
  best,
}: {
  name: string;
  rate: string;
  fees: string;
  total: string;
  best?: boolean;
}) {
  return (
    <div
      className={cn(
        paper,
        "relative w-[6.25rem] p-2 text-[8px] leading-tight transition-transform duration-300",
        best && "ring-emerald-400 motion-safe:group-hover:-translate-y-1",
      )}
    >
      <p className="font-semibold tracking-wider text-neutral-500">{name}</p>
      <p className="mt-1 text-[15px] font-bold tabular-nums">{rate}</p>
      <p
        className={cn(
          "-mx-1 mt-1 rounded px-1 tabular-nums transition-colors duration-300",
          !best && "group-hover:bg-rose-100 group-hover:text-rose-900",
        )}
      >
        + {fees} fees
      </p>
      <p className="mt-1.5 flex justify-between border-t border-neutral-200 pt-1 font-bold tabular-nums">
        <span>Total</span>
        <span>{total}</span>
      </p>
      {best && (
        <span className="absolute -top-2 -right-2 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-800 shadow-sm ring-1 ring-emerald-300 transition-transform duration-300 ease-[cubic-bezier(0.2,1.8,0.4,1)] group-hover:scale-110">
          <FaCheck className="size-2" aria-hidden /> Cheapest
        </span>
      )}
    </div>
  );
}

export function Preview() {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <Offer name="OFFER A" rate="10.5%" fees="₹12,000" total="₹1,56,817" />
      <span className="text-[10px] font-semibold text-muted-foreground">vs</span>
      <Offer name="OFFER B" rate="11%" fees="₹2,500" total="₹1,54,773" best />
    </div>
  );
}
