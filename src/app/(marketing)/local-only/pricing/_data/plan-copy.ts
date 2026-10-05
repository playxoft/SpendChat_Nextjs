import {
  INVOICE_LIMITS,
  PERSONAL_PLANS,
  PLAN_LIMITS,
  PLAN_NAMES,
  TRASH_DAYS,
  type PersonalPlan,
  type PlanLimits,
} from "@/lib/plans";

/**
 * Words for the draft pricing page's plan cards. Every number is read from
 * `PLAN_LIMITS` (`@/lib/plans`) rather than typed out, so a limit changed there
 * changes here too — the page can't promise something the app doesn't enforce.
 * Prices come from `@/lib/pricing`.
 */

/** The card that gets the lift and the badge, and the shaded chart column. */
export const FEATURED_PLAN: PersonalPlan = "pro";
export const FEATURED_BADGE = "Most popular";

/** "1,000". */
export function count(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** "1 GB", "20 GB", "512 MB" — whole numbers stay whole, unlike `formatFileSize`. */
export function formatStorage(bytes: number): string {
  const [n, unit] = bytes >= GB ? [bytes / GB, "GB"] : [bytes / MB, "MB"];
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${unit}`;
}

/** Pro's budget cap is a safety net, shown as "Unlimited". */
export function budgetsLabel(plan: PersonalPlan): string {
  const { max, displayUnlimited } = PLAN_LIMITS[plan].budgets;
  return displayUnlimited ? "Unlimited" : count(max);
}

type BooleanFeature = keyof {
  [K in keyof PlanLimits as PlanLimits[K] extends boolean ? K : never]: true;
};

/** "Plus and Pro" — the plans that include a boolean feature, by name. */
export function plansWith(feature: BooleanFeature): string {
  const names = PERSONAL_PLANS.filter((p) => PLAN_LIMITS[p][feature]).map((p) => PLAN_NAMES[p]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
}

/** How a card announces a feature on the plan that first includes it. */
const UNLOCK_LINES: Record<BooleanFeature, string[]> = {
  topUps: ["AI top-ups when you run out"],
  profileLevelAccess: ["Choose who sees each profile in a space"],
  fileTrash: [`Files & folders go to the ${TRASH_DAYS}-day trash too`],
  voice: ["Voice entry — hold M and talk", "Speak in several languages at once"],
};

/** Features `plan` includes and the plan below it doesn't — what its card adds. */
function unlockedAt(plan: PersonalPlan): string[] {
  const below = PERSONAL_PLANS[PERSONAL_PLANS.indexOf(plan) - 1];
  return (Object.keys(UNLOCK_LINES) as BooleanFeature[])
    .filter((f) => PLAN_LIMITS[plan][f] && !(below && PLAN_LIMITS[below][f]))
    .flatMap((f) => UNLOCK_LINES[f]);
}

export type PlanCopy = {
  tagline: string;
  /** The badge beside the name. */
  people: string;
  lead: string;
  features: string[];
};

function spacesLine(plan: PersonalPlan): string {
  const l = PLAN_LIMITS[plan];
  return `${count(l.spaces)} spaces, up to ${count(l.profilesPerSpace)} profiles in each`;
}

function organiseLine(plan: PersonalPlan): string {
  const l = PLAN_LIMITS[plan];
  return `${budgetsLabel(plan)} budgets, ${count(l.categories)} categories, ${count(l.tags)} tags`;
}

function aiLine(plan: PersonalPlan): string {
  return `${count(PLAN_LIMITS[plan].aiActionsPerMonth)} AI actions a month`;
}

function storageLine(plan: PersonalPlan): string {
  return `${formatStorage(PLAN_LIMITS[plan].storageBytes)} for files & receipts`;
}

const people = (plan: PersonalPlan) => `Up to ${count(PLAN_LIMITS[plan].members)} people`;

function paidFeatures(plan: PersonalPlan): string[] {
  return [aiLine(plan), ...unlockedAt(plan), spacesLine(plan), storageLine(plan), organiseLine(plan)];
}

export const PLAN_COPY: Record<PersonalPlan, PlanCopy> = {
  free: {
    tagline: "Everything you need to track, forever.",
    people: people("free"),
    lead: "Includes",
    features: [
      "Unlimited transactions",
      "Chat-style entry & bulk add",
      spacesLine("free"),
      aiLine("free"),
      storageLine("free"),
      organiseLine("free"),
      ...unlockedAt("free"),
      ...(PLAN_LIMITS.free.profileLevelAccess ? [] : ["Share a whole space: Read or Read + write"]),
      `${TRASH_DAYS}-day trash for transactions`,
      `${count(INVOICE_LIMITS.free.perMonth)} invoices & quotes a month`,
      "CSV & PDF export — never gated",
    ],
  },
  plus: {
    tagline: "More AI and more room, for a household that tracks together.",
    people: people("plus"),
    lead: "Everything in Free, and",
    features: paidFeatures("plus"),
  },
  pro: {
    tagline: "For people who live in their finances.",
    people: people("pro"),
    lead: "Everything in Plus, and",
    features: paidFeatures("pro"),
  },
};
