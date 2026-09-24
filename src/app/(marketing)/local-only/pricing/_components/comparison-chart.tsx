"use client";

import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PERIOD_LABEL,
  PLANS_FOR,
  PLAN_COPY,
  STUDENT_DISCOUNT,
  TRIAL_DAYS,
  BUSINESS_PAID,
  formatAmount,
  isPaid,
  pct,
  quote,
  type PlanId,
} from "../_data/pricing";
import { PricingControls, usePricingState } from "./pricing-state";

type Cell = string | boolean;
/** One value for every plan, or a value per plan (missing plans read as "not included"). */
type Row = { label: string; hint?: string; cells: Cell | Partial<Record<PlanId, Cell>> };

const PAID: Partial<Record<PlanId, Cell>> = {
  plus: true,
  pro: true,
  family: true,
  starter: true,
  growth: true,
  scale: true,
  enterprise: true,
};
/** Pro and up, in both audiences. */
const PRO_UP: Partial<Record<PlanId, Cell>> = { ...PAID, plus: false };

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: "Tracking",
    rows: [
      { label: "Transactions", cells: "Unlimited" },
      { label: "Chat-style entry & bulk add", cells: true },
      { label: "Categories, filters & analytics", cells: true },
      { label: "Tags & search", cells: true },
      { label: "CSV & PDF export", hint: "Never gated. Your data is yours.", cells: true },
      { label: "Web + mobile, every theme", cells: true },
    ],
  },
  {
    title: "AI & voice",
    rows: [
      {
        label: "AI actions / month",
        hint: "One AI-parsed note or receipt. Manual entry is never counted.",
        cells: {
          free: "30",
          plus: "500",
          pro: "3,000",
          family: "6,000 shared",
          starter: "1,000 / seat",
          growth: "3,000 / seat",
          scale: "5,000 / seat",
          enterprise: "Custom",
        },
      },
      { label: "AI top-ups", cells: PAID },
      { label: "Voice entry", cells: PRO_UP },
    ],
  },
  {
    title: "Files & sharing",
    rows: [
      {
        label: "Files vault",
        cells: {
          free: "500 MB",
          plus: "2 GB",
          pro: "10 GB",
          family: "25 GB shared",
          starter: "10 GB",
          growth: "20 GB",
          scale: "30 GB",
          enterprise: "Custom",
        },
      },
      { label: "Receipts on transactions", cells: true },
      { label: "Share links", cells: PRO_UP },
    ],
  },
  {
    title: "People",
    rows: [
      {
        label: "Members",
        cells: {
          free: "1",
          plus: "1",
          pro: "1",
          family: "Up to 6",
          starter: "3+ seats",
          growth: "3+ seats",
          scale: "3+ seats",
          enterprise: "Custom",
        },
      },
      { label: "Roles: viewer, editor, admin", cells: { ...PAID, plus: false, pro: false } },
      { label: "Multiple workspaces", cells: true },
      { label: "Single sign-on (SSO)", cells: { enterprise: true } },
    ],
  },
  {
    title: "Billing",
    rows: [
      { label: `${TRIAL_DAYS}-day free trial`, cells: { ...PAID, enterprise: "On request" } },
      {
        label: "Student discount",
        hint: `${pct(STUDENT_DISCOUNT)} off, with a student email or ID.`,
        cells: { plus: true, pro: true },
      },
    ],
  },
  {
    title: "Support",
    rows: [
      { label: "Community support", cells: true },
      { label: "Priority support", cells: PRO_UP },
      { label: "Early access to new features", cells: { ...PRO_UP, starter: false } },
      { label: "Onboarding call", cells: { growth: true, scale: true, enterprise: true } },
      { label: "Named account contact", cells: { scale: true, enterprise: true } },
      { label: "Self-host the whole thing", hint: "AGPL-3.0, free forever, with your own AI provider keys.", cells: true },
    ],
  },
];

function cellFor(row: Row, plan: PlanId): Cell {
  return typeof row.cells === "object" ? (row.cells[plan] ?? false) : row.cells;
}

function Value({ cell }: { cell: Cell }) {
  if (cell === true)
    return <Check aria-label="Included" className="mx-auto size-4 text-emerald-600 dark:text-emerald-500" />;
  if (cell === false)
    return <Minus aria-label="Not included" className="mx-auto size-4 text-muted-foreground/40" />;
  return <span className="text-sm font-medium tabular-nums">{cell}</span>;
}

/**
 * Every plan in the current audience side by side, priced. Audience, period
 * and currency are shared with the cards above, through the same controls row.
 */
export function ComparisonChart() {
  const { audience } = usePricingState();
  const plans = PLANS_FOR[audience];
  const featured = plans.findIndex((p) => PLAN_COPY[p].highlight);

  return (
    <div>
      <PricingControls className="mb-5" />

      <div className="overflow-x-auto rounded-3xl border bg-card [scrollbar-width:thin]">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[28%] bg-card px-6 py-5 align-bottom text-sm font-medium text-muted-foreground">
                <span className="sr-only">Feature</span>
              </th>
              {plans.map((id, i) => (
                <th
                  key={id}
                  scope="col"
                  className={cn(
                    "px-3 py-5 text-center align-bottom",
                    i === featured && "bg-foreground/[0.035] dark:bg-foreground/[0.06]",
                  )}
                >
                  <span className="block text-sm font-semibold">{PLAN_COPY[id].name}</span>
                  <PriceCell id={id} />
                </th>
              ))}
            </tr>
          </thead>
          {SECTIONS.map((s) => (
            <tbody key={s.title}>
              <tr>
                <th
                  colSpan={plans.length + 1}
                  scope="colgroup"
                  className="border-t bg-muted/40 px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {s.title}
                </th>
              </tr>
              {s.rows.map((r) => (
                <tr key={r.label} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-t bg-card px-6 py-3.5 text-sm font-normal group-hover:bg-muted"
                  >
                    <span className="block">{r.label}</span>
                    {r.hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{r.hint}</span> : null}
                  </th>
                  {plans.map((id, i) => (
                    <td
                      key={id}
                      className={cn(
                        "border-t px-3 py-3.5 text-center group-hover:bg-muted/60",
                        i === featured && "bg-foreground/[0.035] dark:bg-foreground/[0.06]",
                      )}
                    >
                      <Value cell={cellFor(r, id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}

/** A plan's price in the table header, for the table's period. */
function PriceCell({ id }: { id: PlanId }) {
  const { period, currency } = usePricingState();
  if (id === "free") return <Price big={formatAmount(0, currency)} small="forever" />;
  if (!isPaid(id)) return <Price big="Custom" small="contact sales" />;

  const q = quote(id, period, currency);
  if (!q.available) return <Price big="—" small="unavailable" />;
  const perSeat = BUSINESS_PAID.includes(id);
  return (
    <Price
      big={formatAmount(q.perMonth, currency)}
      unit={perSeat ? "/seat/mo" : "/mo"}
      small={
        period === "monthly"
          ? "billed monthly"
          : `${formatAmount(q.price, currency)} ${PERIOD_LABEL[period].billed}`
      }
    />
  );
}

function Price({ big, unit, small }: { big: string; unit?: string; small: string }) {
  return (
    <>
      <span className="mt-2 block text-xl font-semibold tracking-tight tabular-nums">
        {big}
        {unit ? <span className="text-xs font-normal text-muted-foreground">{unit}</span> : null}
      </span>
      <span className="mt-0.5 block text-xs font-normal text-muted-foreground tabular-nums">{small}</span>
    </>
  );
}
