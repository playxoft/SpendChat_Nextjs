"use client";

import { Check, Minus } from "lucide-react";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";
import {
  INVOICE_LIMITS,
  PERSONAL_PLANS,
  PLAN_LIMITS,
  PLAN_NAMES,
  TOPUP,
  TRASH_DAYS,
  VOICE,
  isPaidPlan,
  type PersonalPlan,
} from "@/lib/plans";
import {
  PERIOD_LABEL,
  STUDENT_DISCOUNT,
  TRIAL_DAYS,
  formatAmount,
  invoiceAddonPrice,
  isPaidPersonalPlan,
  pct,
  quote,
  topUpPrice,
  type Currency,
} from "@/lib/pricing";
import { FEATURED_PLAN, budgetsLabel, count, formatStorage } from "../_data/plan-copy";
import { PricingControls, usePricingState } from "./pricing-state";

type Cell = string | boolean;
/** `cell` is asked once per plan; a row that's the same everywhere ignores the argument. */
type Row = { label: string; hint?: string; cell: (plan: PersonalPlan) => Cell };

const everywhere = (c: Cell) => () => c;

/**
 * Every row is read from `@/lib/plans` (limits) or `@/lib/pricing` (prices),
 * never typed out — so the chart can't drift from what the app enforces.
 */
function sections(currency: Currency): { title: string; rows: Row[] }[] {
  const L = PLAN_LIMITS;
  const freeInvoices = INVOICE_LIMITS.free;
  const addon = INVOICE_LIMITS.addon;
  const money = (major: number) => formatAmount(major, currency);
  const clipMinutes = VOICE.maxClipMs / 60_000;
  const minutesPerAction = VOICE.msPerAction / 60_000;

  return [
    {
      title: "Tracking",
      rows: [
        { label: "Transactions", cell: everywhere("Unlimited") },
        { label: "Chat-style entry & bulk add", cell: everywhere(true) },
        { label: "Filters, analytics & search", cell: everywhere(true) },
        { label: "Budgets", cell: budgetsLabel },
        {
          label: "Categories",
          hint: `Including the ${count(DEFAULT_CATEGORIES.length)} defaults.`,
          cell: (p) => count(L[p].categories),
        },
        { label: "Tags", cell: (p) => count(L[p].tags) },
        { label: "CSV & PDF export", hint: "Never gated. Your data is yours.", cell: everywhere(true) },
      ],
    },
    {
      title: "AI & voice",
      rows: [
        {
          label: "AI actions / month",
          hint: "Shared by the whole workspace. Typing an entry yourself is never counted.",
          cell: (p) => count(L[p].aiActionsPerMonth),
        },
        {
          label: "AI top-ups",
          hint: `${count(TOPUP.actions)} more actions for ${money(topUpPrice(currency))}, valid ${TOPUP.validityMonths} months.`,
          cell: (p) => L[p].topUps,
        },
        {
          label: "Voice entry",
          hint: `Hold M and talk, in several languages at once. Clips up to ${clipMinutes} minutes; one AI action per started ${minutesPerAction === 1 ? "minute" : `${minutesPerAction} minutes`}.`,
          cell: (p) => L[p].voice,
        },
      ],
    },
    {
      title: "Files",
      rows: [
        {
          label: "Storage",
          hint: "Files vault and receipts on transactions, for the whole workspace.",
          cell: (p) => formatStorage(L[p].storageBytes),
        },
        { label: `${TRASH_DAYS}-day trash for transactions`, cell: everywhere(true) },
        { label: `${TRASH_DAYS}-day trash for files & folders`, cell: (p) => L[p].fileTrash },
      ],
    },
    {
      title: "People & spaces",
      rows: [
        {
          label: "Members",
          hint: "Everyone with access to the workspace, you included.",
          cell: (p) => count(L[p].members),
        },
        { label: "Spaces", cell: (p) => count(L[p].spaces) },
        { label: "Profiles per space", cell: (p) => count(L[p].profilesPerSpace) },
        {
          label: "Per-profile access",
          hint: "No access, Read or Read + write for each profile in a space. Without it, people share a whole space.",
          cell: (p) => L[p].profileLevelAccess,
        },
      ],
    },
    {
      title: "Invoices & quotes",
      rows: [
        {
          label: "Invoices & quotes / month",
          cell: everywhere(count(freeInvoices.perMonth)),
        },
        {
          label: "Clients",
          cell: everywhere(freeInvoices.clients === null ? "Unlimited" : count(freeInvoices.clients)),
        },
        { label: "Templates", cell: everywhere(count(freeInvoices.templates)) },
        {
          label: "Invoice add-on",
          hint: `Per workspace, or ${money(invoiceAddonPrice("yearly", currency))} a year. ${addon.displayUnlimited ? "Unlimited invoices" : `${count(addon.perMonth)} invoices a month`}, ${addon.templates}+ templates, no footer, email, reminders, recurring invoices, GST fields and ${addon.sellerDetails} seller details.`,
          cell: everywhere(`${money(invoiceAddonPrice("monthly", currency))}/mo`),
        },
      ],
    },
    {
      title: "Billing",
      rows: [
        { label: `${TRIAL_DAYS}-day free trial`, cell: isPaidPlan },
        {
          label: "Student discount",
          hint: `${pct(STUDENT_DISCOUNT)} off, with a student email or ID.`,
          cell: isPaidPlan,
        },
      ],
    },
    {
      title: "Open source",
      rows: [
        {
          label: "Self-host the whole thing",
          hint: "AGPL-3.0, free forever, with your own AI provider keys.",
          cell: everywhere(true),
        },
      ],
    },
  ];
}

function Value({ cell }: { cell: Cell }) {
  if (cell === true)
    return <Check aria-label="Included" className="mx-auto size-4 text-emerald-600 dark:text-emerald-500" />;
  if (cell === false)
    return <Minus aria-label="Not included" className="mx-auto size-4 text-muted-foreground/40" />;
  return <span className="text-sm font-medium tabular-nums">{cell}</span>;
}

/**
 * Every plan side by side, priced. Period and currency are shared with the
 * cards above, through the same controls row.
 */
export function ComparisonChart() {
  const { currency } = usePricingState();
  const featured = PERSONAL_PLANS.indexOf(FEATURED_PLAN);

  return (
    <div>
      <PricingControls className="mb-5" />

      <div className="overflow-x-auto rounded-3xl border bg-card [scrollbar-width:thin]">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[34%] bg-card px-6 py-5 align-bottom text-sm font-medium text-muted-foreground">
                <span className="sr-only">Feature</span>
              </th>
              {PERSONAL_PLANS.map((id, i) => (
                <th
                  key={id}
                  scope="col"
                  className={cn(
                    "px-3 py-5 text-center align-bottom",
                    i === featured && "bg-foreground/[0.035] dark:bg-foreground/[0.06]",
                  )}
                >
                  <span className="block text-sm font-semibold">{PLAN_NAMES[id]}</span>
                  <PriceCell id={id} />
                </th>
              ))}
            </tr>
          </thead>
          {sections(currency).map((s) => (
            <tbody key={s.title}>
              <tr>
                <th
                  colSpan={PERSONAL_PLANS.length + 1}
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
                  {PERSONAL_PLANS.map((id, i) => (
                    <td
                      key={id}
                      className={cn(
                        "border-t px-3 py-3.5 text-center group-hover:bg-muted/60",
                        i === featured && "bg-foreground/[0.035] dark:bg-foreground/[0.06]",
                      )}
                    >
                      <Value cell={r.cell(id)} />
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
function PriceCell({ id }: { id: PersonalPlan }) {
  const { period, currency } = usePricingState();
  if (!isPaidPersonalPlan(id)) return <Price big={formatAmount(0, currency)} small="forever" />;

  const q = quote(id, period, currency);
  return (
    <Price
      big={formatAmount(q.perMonth, currency)}
      unit="/mo"
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
