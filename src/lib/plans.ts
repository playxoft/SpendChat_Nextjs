/**
 * The personal plan catalogue — every number a plan promises, in one typed
 * place. Pure and client-safe: the server enforces these (`entitlements.ts`),
 * and the UI reads the same values to show limits and upgrade hints, so the two
 * can never disagree. Prices live next door in `pricing.ts`.
 *
 * Plans belong to a **workspace**, not a person: every workspace has its own
 * plan, and AI actions, storage, members and top-ups all belong to it. A person
 * in two workspaces counts as a member of each.
 */

export const PERSONAL_PLANS = ["free", "plus", "pro"] as const;
export type PersonalPlan = (typeof PERSONAL_PLANS)[number];

export function isPersonalPlan(value: unknown): value is PersonalPlan {
  return typeof value === "string" && (PERSONAL_PLANS as readonly string[]).includes(value);
}

export const PLAN_NAMES: Record<PersonalPlan, string> = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
};

/** Ordering for "at least this plan" checks and upgrade prompts. */
const PLAN_RANK: Record<PersonalPlan, number> = { free: 0, plus: 1, pro: 2 };

export function planAtLeast(plan: PersonalPlan, min: PersonalPlan): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[min];
}

export function isPaidPlan(plan: PersonalPlan): plan is Exclude<PersonalPlan, "free"> {
  return plan !== "free";
}

const GB = 1024 * 1024 * 1024;

export type PlanLimits = {
  /** People with access to the workspace, the owner included. */
  members: number;
  spaces: number;
  profilesPerSpace: number;
  /** For the whole workspace; resets each calendar month (UTC). */
  aiActionsPerMonth: number;
  /** Vault files + transaction attachments, for the whole workspace. */
  storageBytes: number;
  /**
   * `max` is the hard ceiling. `displayUnlimited` shows "Unlimited" in the UI
   * instead of the number — Pro's 200 is a safety cap, and reaching it says
   * "Contact us" rather than "Upgrade".
   */
  budgets: { max: number; displayUnlimited: boolean };
  /** The 15 seeded defaults count towards this. */
  categories: number;
  tags: number;
  /** Hold-M voice entry. */
  voice: boolean;
  /** Files and folders go to the 30-day trash (transactions always do). */
  fileTrash: boolean;
  /** Per-profile No access / Read / Read + write inside a space. */
  profileLevelAccess: boolean;
  /** Pay-as-you-go AI top-ups (`TOPUP`). */
  topUps: boolean;
};

export const PLAN_LIMITS: Record<PersonalPlan, PlanLimits> = {
  free: {
    members: 3,
    spaces: 2,
    profilesPerSpace: 3,
    aiActionsPerMonth: 50,
    storageBytes: 1 * GB,
    budgets: { max: 5, displayUnlimited: false },
    categories: 20,
    tags: 5,
    voice: false,
    fileTrash: false,
    profileLevelAccess: false,
    topUps: false,
  },
  plus: {
    members: 5,
    spaces: 6,
    profilesPerSpace: 5,
    aiActionsPerMonth: 300,
    storageBytes: 5 * GB,
    budgets: { max: 20, displayUnlimited: false },
    categories: 30,
    tags: 10,
    voice: false,
    fileTrash: true,
    profileLevelAccess: true,
    topUps: true,
  },
  pro: {
    members: 10,
    spaces: 15,
    profilesPerSpace: 10,
    aiActionsPerMonth: 1000,
    storageBytes: 20 * GB,
    budgets: { max: 200, displayUnlimited: true },
    categories: 50,
    tags: 20,
    voice: true,
    fileTrash: true,
    profileLevelAccess: true,
    topUps: true,
  },
};

/** The cheapest plan that unlocks a boolean feature — what an upgrade hint names. */
export function lowestPlanWith(
  feature: "voice" | "fileTrash" | "profileLevelAccess" | "topUps",
): PersonalPlan {
  return PERSONAL_PLANS.find((p) => PLAN_LIMITS[p][feature]) ?? "pro";
}

/** A one-time AI top-up: paid plans only, used after the monthly allowance. */
export const TOPUP = { actions: 500, validityMonths: 12 } as const;

/**
 * Voice entry: one clip is capped at two minutes and costs one AI action per
 * *started* minute (transcribe + parse together), so a 61-second clip is two.
 */
export const VOICE = { maxClipMs: 120_000, msPerAction: 60_000 } as const;

/** AI actions a voice clip of `durationMs` costs: one per started minute, at least one. */
export function voiceActionsFor(durationMs: number): number {
  const clamped = Math.min(Math.max(durationMs, 0), VOICE.maxClipMs);
  return Math.max(1, Math.ceil(clamped / VOICE.msPerAction));
}

export const TRASH_DAYS = 30;

/** People in one split group, the creator included — the same on every plan. */
export const SPLIT_GROUP_MAX_PEOPLE = 50;

/**
 * Existing workspaces keep everything they had for this long after pricing
 * launches (D4). Nothing is ever deleted; past the grace period anything over
 * a Free limit turns view-only until the workspace upgrades or cleans up.
 */
export const PLAN_GRACE_DAYS = 90;

/**
 * When the grace period for `workspaces.grandfathered` ends, as an ISO date —
 * launch day + `PLAN_GRACE_DAYS`. `null` until pricing launches, which keeps
 * every pre-existing workspace exactly as it was. Set it in the launch PR
 * (personal phase 14), never earlier.
 */
export const PLAN_GRACE_ENDS_AT: string | null = null;

/** Whether a grandfathered workspace is still inside its grace period at `now`. */
export function inGracePeriod(grandfathered: boolean, now: Date = new Date()): boolean {
  if (!grandfathered) return false;
  if (PLAN_GRACE_ENDS_AT === null) return true;
  return now.getTime() < new Date(PLAN_GRACE_ENDS_AT).getTime();
}

// ── Invoices ───────────────────────────────────────────────────────────────

export type InvoiceTier = "free" | "addon";

export const INVOICE_LIMITS: Record<
  InvoiceTier,
  {
    /** Invoices + quotes created per calendar month, per workspace. */
    perMonth: number;
    /** `perMonth` is a safety cap the UI shows as "Unlimited". */
    displayUnlimited: boolean;
    clients: number | null;
    templates: number;
    footer: boolean;
    email: boolean;
    reminders: boolean;
    recurring: boolean;
    gstFields: boolean;
    sellerDetails: number;
  }
> = {
  free: {
    perMonth: 20,
    displayUnlimited: false,
    clients: 20,
    templates: 5,
    footer: true,
    email: false,
    reminders: false,
    recurring: false,
    gstFields: false,
    sellerDetails: 1,
  },
  addon: {
    perMonth: 500,
    displayUnlimited: true,
    clients: null,
    templates: 10,
    footer: false,
    email: true,
    reminders: true,
    recurring: true,
    gstFields: true,
    sellerDetails: 3,
  },
};

/** The invoice add-on, per workspace, in rupee minor units (paise). */
export const INVOICE_ADDON_PRICE = { monthly: 19900, yearly: 99900 } as const;

// ── Rate limits (enforced in personal phase 6) ─────────────────────────────

export type RateBucket = "create" | "read" | "ai";

/** Requests per person per window: 1 minute / 5 minutes / 1 hour. A bulk add counts once. */
export const RATE_LIMITS: Record<
  PersonalPlan,
  Record<RateBucket, { perMinute: number; per5Minutes: number; perHour: number }>
> = {
  free: {
    create: { perMinute: 20, per5Minutes: 60, perHour: 300 },
    read: { perMinute: 120, per5Minutes: 400, perHour: 2000 },
    ai: { perMinute: 3, per5Minutes: 6, perHour: 10 },
  },
  plus: {
    create: { perMinute: 30, per5Minutes: 100, perHour: 500 },
    read: { perMinute: 180, per5Minutes: 600, perHour: 3000 },
    ai: { perMinute: 5, per5Minutes: 15, perHour: 30 },
  },
  pro: {
    create: { perMinute: 40, per5Minutes: 150, perHour: 800 },
    read: { perMinute: 240, per5Minutes: 900, perHour: 5000 },
    ai: { perMinute: 6, per5Minutes: 20, perHour: 60 },
  },
};
