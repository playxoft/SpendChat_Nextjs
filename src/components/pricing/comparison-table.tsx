"use client";

import { Check, Minus } from "lucide-react";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";
import {
  PERSONAL_PLANS,
  PLAN_LIMITS,
  PLAN_NAMES,
  SPLIT_GROUP_MAX_PEOPLE,
  TOPUP,
  TRASH_DAYS,
  VOICE,
  isPaidPlan,
  type PersonalPlan,
} from "@/lib/plans";
import { budgetsLimitLabel, formatPlanStorage } from "@/lib/plan-limit";
import { FEATURED_PLAN, count } from "@/lib/plan-copy";
import {
  PERIOD_LABEL,
  STUDENT_DISCOUNT,
  TRIAL_DAYS,
  formatAmount,
  isPaidPersonalPlan,
  pct,
  quote,
  topUpPrice,
  type Currency,
} from "@/lib/pricing";
import { PricingControls, usePricingState } from "./pricing-state";

type Cell = string | boolean;
/** `cell` is asked once per plan; a row that's the same everywhere ignores the argument. */
type Row = { label: string; hint?: string; cell: (plan: PersonalPlan) => Cell };

const everywhere = (c: Cell) => () => c;

/**
 * Every row is read from `@/lib/plans` (limits) or `@/lib/pricing` (prices),
 * never typed out — so the table can't drift from what the app enforces. Only
 * what the app does today is listed: entries in `PLAN_LIMITS` for features
 * that haven't shipped (invoices) stay off the page until they do.
 */
function sections(currency: Currency, selfHost: boolean): { title: string; rows: Row[] }[] {
  const money = (major: number) => formatAmount(major, currency);
  const clipMinutes = VOICE.maxClipMs / 60_000;

  return [
    {
      title: "Tracking",
      rows: [
        { label: "Transactions", cell: everywhere("Unlimited") },
        { label: "Chat-style entry & bulk add", cell: everywhere(true) },
        { label: "Filters, analytics & search", cell: everywhere(true) },
        {
          label: "Insights and trends",
          hint: "Month-end projection, 12 months of cash flow, category trends, a spending calendar, and the recurring payments and unusual spends it spots for you.",
          cell: (p) => PLAN_LIMITS[p].advancedAnalytics,
        },
        {
          label: "Categories",
          hint: `Including the ${count(DEFAULT_CATEGORIES.length)} starter ones.`,
          cell: (p) => count(PLAN_LIMITS[p].categories),
        },
        { label: "Tags", cell: (p) => count(PLAN_LIMITS[p].tags) },
        {
          label: "Monthly budgets",
          hint: "For the whole workspace, a profile or a category, with alerts at 80% and 100%.",
          cell: (p) => budgetsLimitLabel(p),
        },
        {
          label: "Trash for transactions",
          hint: `Deleted entries wait ${TRASH_DAYS} days before they're gone, and every delete has an Undo.`,
          cell: everywhere(`${TRASH_DAYS} days`),
        },
        { label: "CSV & PDF export", hint: "On every plan, always. Your data is yours.", cell: everywhere(true) },
      ],
    },
    {
      title: "AI & voice",
      rows: [
        {
          label: "AI actions a month",
          hint: "Shared by the whole workspace. Typing an entry yourself is never counted.",
          cell: (p) => count(PLAN_LIMITS[p].aiActionsPerMonth),
        },
        {
          label: "AI top-ups",
          hint: `${count(TOPUP.actions)} more actions for ${money(topUpPrice(currency))}, valid ${TOPUP.validityMonths} months.`,
          cell: (p) => PLAN_LIMITS[p].topUps,
        },
        {
          label: "Voice entry",
          hint: `Hold M and talk, in several languages at once. Clips up to ${clipMinutes} minutes; one AI action per started minute.`,
          cell: (p) => PLAN_LIMITS[p].voice,
        },
      ],
    },
    {
      title: "Files",
      rows: [
        {
          label: "Storage",
          hint: "The files vault and receipts on transactions, for the whole workspace.",
          cell: (p) => formatPlanStorage(PLAN_LIMITS[p].storageBytes),
        },
        {
          label: "Receipts on transactions",
          hint: "Keep the bill, invoice or warranty with the spend it belongs to.",
          cell: everywhere(true),
        },
        {
          label: "Files vault & share links",
          hint: "Folders, tags and a link you can send to anyone, for any file.",
          cell: everywhere(true),
        },
        {
          label: "Trash for files & folders",
          hint: `Deleted files and folders wait ${TRASH_DAYS} days, and count toward storage until the trash is emptied. Without it, a delete is for good.`,
          cell: (p) => (PLAN_LIMITS[p].fileTrash ? `${TRASH_DAYS} days` : false),
        },
      ],
    },
    {
      title: "People & spaces",
      rows: [
        {
          label: "Members",
          hint: "Everyone with access to the workspace, you included.",
          cell: (p) => count(PLAN_LIMITS[p].members),
        },
        { label: "Spaces", cell: (p) => count(PLAN_LIMITS[p].spaces) },
        { label: "Profiles in each space", cell: (p) => count(PLAN_LIMITS[p].profilesPerSpace) },
        {
          label: "Access for each profile",
          hint: "No access, Read, or Read + write for each profile in a space. Without it, people share a whole space.",
          cell: (p) => PLAN_LIMITS[p].profileLevelAccess,
        },
        {
          label: "Invite people by email",
          hint: "They join with a link. Each person sees only the spaces you add them to.",
          cell: everywhere(true),
        },
      ],
    },
    {
      title: "Split with friends",
      rows: [
        {
          label: "Split groups",
          hint: "Trips, flats, dinners — outside your workspaces, free for everyone you invite.",
          cell: everywhere("Unlimited"),
        },
        {
          label: "People in a group",
          hint: "You included. Split equally, by exact amounts or by percent.",
          cell: everywhere(count(SPLIT_GROUP_MAX_PEOPLE)),
        },
        {
          label: "Balances & settle up",
          hint: "Who owes whom, and the payments that settle it.",
          cell: everywhere(true),
        },
        {
          label: "Add your share to your workspace",
          hint: "Your part of a group expense lands in your own books in one tap.",
          cell: everywhere(true),
        },
      ],
    },
    {
      title: "Billing",
      rows: [
        {
          label: `${TRIAL_DAYS}-day free trial`,
          hint: "With a workspace's first paid plan — one trial per workspace.",
          cell: isPaidPlan,
        },
        {
          label: "Student discount",
          hint: `${pct(STUDENT_DISCOUNT)} off, checked by hand with a student email or ID.`,
          cell: isPaidPlan,
        },
      ],
    },
    ...(selfHost
      ? [
          {
            title: "Open source",
            rows: [
              {
                label: "Self-host the whole thing",
                hint: "AGPL-3.0, free, with your own AI keys.",
                cell: everywhere(true),
              },
            ],
          },
        ]
      : []),
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
 * cards above, through the same controls row. In the app, `currentPlan`'s
 * column is the shaded one.
 */
export function ComparisonTable({
  currentPlan,
  selfHost = false,
  controls = true,
}: {
  currentPlan?: PersonalPlan;
  selfHost?: boolean;
  /** Repeat the period/currency row above the table (the public page does). */
  controls?: boolean;
}) {
  const { currency } = usePricingState();
  const shaded = PERSONAL_PLANS.indexOf(currentPlan ?? FEATURED_PLAN);

  return (
    <div>
      {controls ? <PricingControls className="mb-5" /> : null}

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
                    i === shaded && "bg-foreground/[0.035] dark:bg-foreground/[0.06]",
                  )}
                >
                  <span className="block text-sm font-semibold">
                    {PLAN_NAMES[id]}
                    {currentPlan === id ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">(yours)</span>
                    ) : null}
                  </span>
                  <PriceCell id={id} />
                </th>
              ))}
            </tr>
          </thead>
          {sections(currency, selfHost).map((s) => (
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
                        i === shaded && "bg-foreground/[0.035] dark:bg-foreground/[0.06]",
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
  if (!isPaidPersonalPlan(id)) return <Price big={formatAmount(0, currency)} unit="/mo" small="free" />;

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
