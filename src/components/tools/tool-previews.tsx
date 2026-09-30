import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { FaBolt, FaCheck } from "react-icons/fa6";
import { cn } from "@/lib/utils";
import { Preview as SimpleInterestPreview } from "@/components/tools/previews/simple-interest-calculator";
import { Preview as LoanPreview } from "@/components/tools/previews/loan-calculator";
import { Preview as LoanComparisonPreview } from "@/components/tools/previews/loan-comparison-calculator";
import { Preview as NetWorthPreview } from "@/components/tools/previews/net-worth-calculator";
import { Preview as FirePreview } from "@/components/tools/previews/fire-calculator";
import { Preview as SavingsChallengePreview } from "@/components/tools/previews/savings-challenge";
import { Preview as WhenCanIAffordItPreview } from "@/components/tools/previews/when-can-i-afford-it";
import { Preview as FreelanceRatePreview } from "@/components/tools/previews/freelance-rate-calculator";
import { Preview as FdPreview } from "@/components/tools/previews/fd-calculator";
import { Preview as CurrencyConverterPreview } from "@/components/tools/previews/currency-converter";
import { Preview as InflationPreview } from "@/components/tools/previews/inflation-calculator";

/**
 * The little picture on each `/tools` hub card — a worked example of what the
 * tool makes, so a visitor sees the answer before they click.
 *
 * Every picture is plain markup and CSS: no images to load, crisp at any size,
 * and right in both themes (the "paper" ones are white in dark mode too, like
 * the real documents). Each comes alive when its card is hovered — the card is
 * the Tailwind `group` — and looks complete without hover, for touch screens.
 * Colours stay pale and live only inside these pictures; the page chrome keeps
 * the house palette.
 */

const paper = "rounded-md bg-white text-neutral-800 shadow-sm ring-1 ring-black/10";

/** A line of placeholder "text" on a mini document. */
function Bar({ className }: { className: string }) {
  return <span className={cn("block h-1 rounded-full bg-neutral-200", className)} />;
}

function MiniDoc({ title, total, children }: { title: string; total: string; children?: ReactNode }) {
  return (
    <div className="relative w-40 transition-transform duration-300 motion-safe:group-hover:-translate-y-1">
      <div className={cn(paper, "p-3 text-[7px] leading-tight")}>
        <div className="flex items-center justify-between">
          <span className="h-1.5 w-8 rounded-full bg-neutral-300" />
          <span className="font-bold tracking-wider">{title}</span>
        </div>
        <div className="mt-2 space-y-1">
          <Bar className="w-16" />
          <Bar className="w-12" />
        </div>
        <div className="mt-2 space-y-1 border-t border-neutral-200 pt-1.5">
          <span className="flex justify-between">
            <Bar className="w-14" />
            <Bar className="w-6" />
          </span>
          <span className="flex justify-between">
            <Bar className="w-10" />
            <Bar className="w-6" />
          </span>
        </div>
        <div className="mt-2 flex justify-between border-t-2 border-neutral-800 pt-1 font-bold">
          <span>Total</span>
          <span>{total}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

// ---- Invoices & quotes -----------------------------------------------------

function InvoicePreview() {
  return (
    <MiniDoc title="INVOICE" total="₹37,501.50">
      {/* The "PAID" stamp thumps down on hover. */}
      <span className="pointer-events-none absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 scale-150 -rotate-12 rounded-md border-2 border-emerald-600 px-2 py-0.5 text-[11px] font-black tracking-[0.25em] text-emerald-600 opacity-0 transition-all duration-300 ease-[cubic-bezier(0.2,1.8,0.4,1)] group-hover:scale-100 group-hover:opacity-100">
        PAID
      </span>
    </MiniDoc>
  );
}

function QuotationPreview() {
  return (
    <MiniDoc title="QUOTATION" total="₹85,000.00">
      {/* An "Accepted" sticky note slaps onto the corner on hover. */}
      <span className="pointer-events-none absolute -top-2 -right-4 inline-flex -translate-y-2 rotate-12 items-center gap-1 rounded-sm bg-amber-100 px-2 py-1 text-[9px] font-semibold text-amber-900 opacity-0 shadow-md transition-all duration-300 ease-[cubic-bezier(0.2,1.6,0.4,1)] group-hover:translate-y-0 group-hover:rotate-6 group-hover:opacity-100">
        <FaCheck className="size-2.5" aria-hidden /> Accepted
      </span>
    </MiniDoc>
  );
}

// ---- Everyday maths ----------------------------------------------------------

function PercentagePreview() {
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="size-20 overflow-visible" aria-hidden>
        {/* 85% of the pie, then the 15% slice that pops out on hover. */}
        <path d="M50 50 L82.36 26.49 A40 40 0 1 1 50 10 Z" className="fill-muted-foreground/20" />
        <path
          d="M50 50 L50 10 A40 40 0 0 1 82.36 26.49 Z"
          className="fill-sky-400 transition-transform duration-300 ease-[cubic-bezier(0.2,1.6,0.4,1)] group-hover:translate-x-[4px] group-hover:-translate-y-[8px]"
        />
      </svg>
      <div>
        <p className="text-2xl font-semibold tabular-nums">15%</p>
        <p className="font-mono text-xs text-muted-foreground">of 200 = 30</p>
      </div>
    </div>
  );
}

/** A torn-paper edge for the bottom of a receipt. */
function Zigzag() {
  const teeth = 16;
  const d = Array.from({ length: teeth }, (_, i) => `L${i * 10 + 5} 6 L${(i + 1) * 10} 0`).join(" ");
  return (
    <svg viewBox="0 0 160 6" preserveAspectRatio="none" className="block h-1.5 w-full fill-white" aria-hidden>
      <path d={`M0 0 ${d} Z`} />
    </svg>
  );
}

function VatPreview() {
  return (
    <div className="w-40 drop-shadow-md transition-transform duration-300 motion-safe:group-hover:-translate-y-1">
      <div className="rounded-t-md bg-white p-3 pb-2 font-mono text-[9px] leading-relaxed text-neutral-800">
        <p className="text-center text-[8px] font-bold tracking-[0.2em] text-neutral-500">RECEIPT</p>
        <p className="mt-1 flex justify-between">
          <span>Item</span>
          <span>₹100.00</span>
        </p>
        <p className="-mx-1 flex justify-between rounded px-1 transition-colors duration-300 group-hover:bg-amber-100 group-hover:text-amber-900">
          <span>GST 18%</span>
          <span>₹18.00</span>
        </p>
        <p className="mt-1 flex justify-between border-t border-dashed border-neutral-300 pt-1 font-bold">
          <span>Total</span>
          <span>₹118.00</span>
        </p>
      </div>
      <Zigzag />
    </div>
  );
}

function AmountInWordsPreview() {
  return (
    <div className="w-52 rounded-md bg-sky-50 p-2.5 text-[8px] leading-tight text-neutral-700 shadow-sm ring-1 ring-sky-200 transition-transform duration-300 motion-safe:group-hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <span className="h-1.5 w-12 rounded-full bg-sky-300" />
        <span className="font-mono text-neutral-500">28/09/2026</span>
      </div>
      <p className="mt-2 flex items-end gap-1">
        Pay <span className="flex-1 border-b border-sky-300" />
      </p>
      <p className="mt-1.5 border-b border-sky-300 pb-0.5 font-serif text-[10px] text-neutral-800 italic">
        One lakh twenty thousand only
      </p>
      <div className="mt-2 flex items-end justify-between">
        <span className="rounded-sm border border-sky-400 bg-white px-1.5 py-0.5 font-semibold text-neutral-800">
          ₹1,20,000/-
        </span>
        {/* The signature writes itself again on hover. */}
        <svg viewBox="0 0 60 20" className="h-5 w-16" aria-hidden>
          <path
            d="M2 14 C8 4, 12 4, 14 12 S20 18, 24 9 S30 3, 33 12 S40 16, 44 8 C47 4, 50 12, 58 10"
            pathLength={100}
            strokeDasharray={100}
            className="fill-none stroke-neutral-700 group-hover:animate-tool-sign"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

const USAGE = [40, 55, 48, 70, 62, 85];

function ElectricityPreview() {
  return (
    <div className={cn(paper, "w-44 p-2.5 text-[8px] leading-tight transition-transform duration-300 motion-safe:group-hover:-translate-y-1")}>
      <div className="flex items-center gap-1 font-bold tracking-wider">
        <FaBolt className="size-3 text-amber-400 group-hover:animate-tool-flicker" aria-hidden />
        ELECTRICITY BILL
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className="text-neutral-500">Units used</p>
          <p className="text-[10px] font-semibold">465 kWh</p>
        </div>
        <div className="flex h-7 items-end gap-0.5" aria-hidden>
          {USAGE.map((h, i) => (
            <span
              key={i}
              style={{ height: `${h}%`, animationDelay: `${i * 50}ms` }}
              className={cn(
                "w-1.5 origin-bottom rounded-t-sm group-hover:animate-tool-grow",
                i === USAGE.length - 1 ? "bg-amber-400" : "bg-neutral-300",
              )}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 flex justify-between border-t border-neutral-200 pt-1.5 font-bold">
        <span>Amount due</span>
        <span className="text-[10px]">₹3,255</span>
      </p>
    </div>
  );
}

// ---- Dates ---------------------------------------------------------------------

function CalendarPage({ month, day, weekday, flip }: { month: string; day: string; weekday: string; flip?: boolean }) {
  return (
    <div
      className={cn(
        "w-14 origin-top overflow-hidden rounded-md bg-white text-center shadow-sm ring-1 ring-black/10",
        flip && "group-hover:animate-tool-flip",
      )}
    >
      <p className="bg-rose-400 py-0.5 text-[9px] font-bold tracking-wider text-white">{month}</p>
      <p className="pt-0.5 text-2xl font-bold leading-tight text-neutral-800 tabular-nums">{day}</p>
      <p className="pb-1 text-[7px] text-neutral-500">{weekday}</p>
    </div>
  );
}

function DaysPreview() {
  return (
    <div className="flex items-center gap-2 [perspective:400px]">
      <CalendarPage month="SEP" day="28" weekday="Monday" />
      <div className="flex flex-col items-center gap-1">
        <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background tabular-nums">
          30 days
        </span>
        <ArrowRight className="size-3.5 text-muted-foreground transition-transform duration-300 motion-safe:group-hover:translate-x-1" />
      </div>
      <CalendarPage month="OCT" day="28" weekday="Wednesday" flip />
    </div>
  );
}

function AgePreview() {
  return (
    <div className="flex items-end gap-4">
      <div className="flex flex-col items-center" aria-hidden>
        {/* Candles, with flames that flicker on hover. */}
        <div className="flex gap-2.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex flex-col items-center">
              <span
                style={{ animationDelay: `${i * 120}ms` }}
                className="size-2 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-amber-300 group-hover:animate-tool-flicker"
              />
              <span className="mt-0.5 h-3.5 w-1 rounded-sm bg-sky-200" />
            </span>
          ))}
        </div>
        <span className="h-5 w-14 rounded-t-md border-t-4 border-pink-200 bg-neutral-100 ring-1 ring-black/5 dark:bg-neutral-200" />
        <span className="h-7 w-20 rounded-t-md border-t-4 border-pink-200 bg-neutral-100 ring-1 ring-black/5 dark:bg-neutral-200" />
        <span className="h-1.5 w-24 rounded-full bg-neutral-300 dark:bg-neutral-500" />
      </div>
      <div className="pb-1">
        <p className="text-lg font-semibold tabular-nums">36y 6m 14d</p>
        <p className="text-xs text-muted-foreground">Born 14 Mar 1990</p>
      </div>
    </div>
  );
}

// ---- Saving & investing ----------------------------------------------------------

/** Money put in and interest earned, per year (percent of chart height). */
const COMPOUND = [
  [20, 2],
  [26, 5],
  [32, 9],
  [38, 14],
  [44, 20],
  [50, 27],
  [56, 34],
  [62, 42],
] as const;

function CompoundPreview() {
  const step = 100 / COMPOUND.length;
  // What the balance buys after inflation: a little under each bar's top.
  const inflation = COMPOUND.map(([c, i], k) => `${(k + 0.5) * step},${100 - (c + i) * 0.86}`).join(" ");
  return (
    <div className="w-52">
      <div className="relative flex h-20 items-end gap-1.5" aria-hidden>
        {COMPOUND.map(([contributed, interest], k) => (
          <span
            key={k}
            style={{ height: `${contributed + interest}%`, animationDelay: `${k * 60}ms` }}
            className="flex flex-1 origin-bottom flex-col-reverse overflow-hidden rounded-t-sm group-hover:animate-tool-grow"
          >
            <span style={{ height: `${(contributed / (contributed + interest)) * 100}%` }} className="bg-muted-foreground/35" />
            <span className="flex-1 bg-emerald-500/80" />
          </span>
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          <polyline
            points={inflation}
            className="fill-none stroke-rose-400"
            strokeWidth={1.5}
            strokeDasharray="3 2.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="mt-2 flex gap-3 text-[9px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-muted-foreground/35" /> You put in
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-emerald-500/80" /> Interest
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-0 w-2.5 border-t border-dashed border-rose-400" /> After inflation
        </span>
      </div>
    </div>
  );
}

const SIP_STEPS = [18, 26, 34, 42, 50, 58, 66, 76];

function SipPreview() {
  const step = 100 / SIP_STEPS.length;
  const trend = SIP_STEPS.map((h, k) => `${(k + 0.5) * step},${100 - h - 10}`).join(" ");
  return (
    <div className="relative flex h-24 w-48 items-end gap-1.5" aria-hidden>
      {SIP_STEPS.map((h, k) => (
        <span
          key={k}
          style={{ height: `${h}%`, animationDelay: `${k * 60}ms` }}
          className={cn(
            "flex-1 origin-bottom rounded-t-sm group-hover:animate-tool-grow",
            k === SIP_STEPS.length - 1 ? "bg-emerald-500" : "bg-emerald-500/45",
          )}
        />
      ))}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <polyline points={trend} className="fill-none stroke-foreground" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The arrowhead, and a coin dropping onto this month's bar on hover. */}
      <ArrowRight className="absolute -top-1 -right-2.5 size-4 -rotate-45 text-foreground" />
      <span className="absolute right-[3%] bottom-[80%] size-3.5 rounded-full bg-amber-300 opacity-0 ring-1 ring-amber-500 group-hover:animate-tool-drop" />
    </div>
  );
}

// ---- Loans & debt ------------------------------------------------------------------

function CreditCardPreview() {
  return (
    <div className="w-44">
      <div className="h-24 rounded-lg bg-neutral-800 p-2.5 text-white shadow-md ring-1 ring-white/10 transition-transform duration-300 motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:-rotate-2">
        <div className="flex items-start justify-between">
          <span className="h-3.5 w-5 rounded-sm bg-amber-200" />
          <span className="text-[8px] font-semibold tracking-wider text-white/60">CREDIT</span>
        </div>
        <p className="mt-3 font-mono text-[10px] tracking-widest text-white/80">•••• 4821</p>
        <div className="mt-1 flex items-baseline justify-between text-[9px]">
          <span className="text-white/60">Balance</span>
          {/* The balance ticks down to nothing on hover. */}
          <span className="relative font-semibold tabular-nums">
            <span className="transition-opacity duration-300 group-hover:opacity-0">₹48,200</span>
            <span className="absolute right-0 text-emerald-300 opacity-0 transition-opacity delay-500 duration-300 group-hover:opacity-100">
              ₹0
            </span>
          </span>
        </div>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="block h-full w-[62%] rounded-full bg-emerald-500 transition-[width] duration-700 ease-out group-hover:w-full" />
      </div>
      <p className="relative mt-1 text-[9px] text-muted-foreground">
        <span className="transition-opacity duration-300 group-hover:opacity-0">62% paid off</span>
        <span className="absolute left-0 font-medium text-emerald-600 opacity-0 transition-opacity delay-500 duration-300 group-hover:opacity-100 dark:text-emerald-400">
          Debt-free
        </span>
      </p>
    </div>
  );
}

const PREVIEWS: Record<string, () => ReactNode> = {
  "invoice-generator": InvoicePreview,
  "quotation-generator": QuotationPreview,
  "percentage-calculator": PercentagePreview,
  "vat-calculator": VatPreview,
  "amount-in-words": AmountInWordsPreview,
  "electricity-cost-calculator": ElectricityPreview,
  "days-between-dates": DaysPreview,
  "age-calculator": AgePreview,
  "compound-interest-calculator": CompoundPreview,
  "sip-calculator": SipPreview,
  "credit-card-payoff-calculator": CreditCardPreview,
  // Batch 2 — one file per tool in ./previews/.
  "simple-interest-calculator": SimpleInterestPreview,
  "loan-calculator": LoanPreview,
  "loan-comparison-calculator": LoanComparisonPreview,
  "net-worth-calculator": NetWorthPreview,
  "fire-calculator": FirePreview,
  "savings-challenge": SavingsChallengePreview,
  "when-can-i-afford-it": WhenCanIAffordItPreview,
  "freelance-rate-calculator": FreelanceRatePreview,
  "fd-calculator": FdPreview,
  "currency-converter": CurrencyConverterPreview,
  "inflation-calculator": InflationPreview,
};

/** Whether a tool has its mini picture — every published tool should. */
export function hasToolPreview(slug: string): boolean {
  return slug in PREVIEWS;
}

/** The mini picture for a tool, or null for a tool that doesn't have one yet. */
export function ToolPreview({ slug }: { slug: string }) {
  const Preview = PREVIEWS[slug];
  return Preview ? <Preview /> : null;
}
