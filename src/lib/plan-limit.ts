import { formatFileSize } from "@/lib/attachments";
import {
  PERSONAL_PLANS,
  PLAN_LIMITS,
  PLAN_NAMES,
  isPersonalPlan,
  planAtLeast,
  type PersonalPlan,
} from "@/lib/plans";

/**
 * The client half of a `plan_limit` rejection: recognising one on an action
 * result (or an upload response), and turning its `details` into the words the
 * upgrade dialog shows. Pure and client-safe — the numbers come from the same
 * `PLAN_LIMITS` the server enforces, so the dialog can't promise something the
 * plan doesn't include.
 *
 * Billing doesn't exist yet, so nothing here links to a checkout: the dialog
 * explains the limit, names the plan that lifts it, and says paid plans are
 * coming soon.
 */

/** Mirrors `PlanLimitKey` in `lib/errors.ts` (kept here so this file stays client-safe). */
export const PLAN_LIMIT_KEYS = [
  "members",
  "spaces",
  "profilesPerSpace",
  "categories",
  "tags",
  "storage",
  "aiActions",
  "voice",
  "profileLevelAccess",
  "freeWorkspaces",
] as const;
export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number];

export type PlanLimitInfo = {
  limit: PlanLimitKey;
  /** The workspace's plan when the limit was hit. */
  plan: PersonalPlan;
  /** The cap that was hit, when it's a number. */
  max?: number;
  /** How much is in use, when it's a number. */
  used?: number;
  /** The cheapest plan that lifts the limit; null when none does ("contact us"). */
  upgradeTo: PersonalPlan | null;
};

function isLimitKey(value: unknown): value is PlanLimitKey {
  return typeof value === "string" && (PLAN_LIMIT_KEYS as readonly string[]).includes(value);
}

const finite = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/**
 * Validate an error's `details` as plan-limit details. Anything malformed —
 * an older server, a different error's payload — is `null`, so the caller
 * falls back to showing the plain message.
 */
export function parsePlanLimitDetails(details: unknown): PlanLimitInfo | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  if (!isLimitKey(d.limit) || !isPersonalPlan(d.plan)) return null;
  const upgradeTo = isPersonalPlan(d.upgradeTo) ? d.upgradeTo : null;
  const max = finite(d.max);
  const used = finite(d.used);
  return {
    limit: d.limit,
    plan: d.plan,
    ...(max !== undefined ? { max } : {}),
    ...(used !== undefined ? { used } : {}),
    upgradeTo,
  };
}

/** Codes whose `details` carry plan-limit fields. */
const PLAN_LIMIT_CODES = new Set(["plan_limit", "storage_quota_exceeded"]);

type FailureLike = { ok: boolean; code?: string; details?: unknown };

/**
 * The plan limit behind a failed action result (or an upload response shaped
 * the same way), or null when it failed for some other reason.
 */
export function planLimitOf(res: FailureLike): PlanLimitInfo | null {
  if (res.ok || !res.code || !PLAN_LIMIT_CODES.has(res.code)) return null;
  return parsePlanLimitDetails(res.details);
}

/** Whether a failed result is a plan limit the upgrade dialog can explain. */
export function isPlanLimit(res: FailureLike): boolean {
  return planLimitOf(res) !== null;
}

// ── Copy ───────────────────────────────────────────────────────────────────

/** "1 GB", "5 GB" — whole gigabytes without the ".0" `formatFileSize` adds. */
export function formatPlanStorage(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return Number.isInteger(gb) ? `${gb} GB` : formatFileSize(bytes);
}

/** "3 members", "1 space". `noun` is the singular; `plural` when it isn't just +s. */
export function quantity(n: number, noun: string, plural = `${noun}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? noun : plural}`;
}

/** What a plan includes, one short line each — the list the upgrade dialog shows. */
export function planHighlights(plan: PersonalPlan): string[] {
  const l = PLAN_LIMITS[plan];
  const lines = [
    quantity(l.members, "member"),
    `${quantity(l.spaces, "space")}, ${quantity(l.profilesPerSpace, "profile")} in each`,
    `${quantity(l.aiActionsPerMonth, "AI action")} a month`,
    `${formatPlanStorage(l.storageBytes)} of storage`,
    `${quantity(l.categories, "category", "categories")} and ${quantity(l.tags, "tag")}`,
  ];
  if (l.profileLevelAccess) lines.push("Access settings for each profile");
  if (l.voice) lines.push("Voice entry");
  return lines;
}

export type UpgradeCopy = {
  title: string;
  /** What happened, in plain words. */
  reason: string;
  /** The plan that lifts the limit; null → "contact us". */
  upgradeTo: PersonalPlan | null;
  /** One line about what the upgrade gives for *this* limit. */
  upgradeLine: string | null;
  /** Everything `upgradeTo` includes. */
  includes: string[];
};

function planName(plan: PersonalPlan): string {
  return PLAN_NAMES[plan];
}

/**
 * The upgrade dialog's words for a limit. Always simple English, and never
 * implies anything gets deleted — limits only stop *adding*.
 */
export function upgradeCopy(info: PlanLimitInfo, now: Date = new Date()): UpgradeCopy {
  const { plan, upgradeTo } = info;
  const current = planName(plan);
  const next = upgradeTo ? PLAN_LIMITS[upgradeTo] : null;
  const max = info.max ?? null;
  const on = `This workspace's ${current} plan`;

  let title: string;
  let reason: string;
  let upgradeLine: string | null = null;

  switch (info.limit) {
    case "members": {
      const cap = max ?? PLAN_LIMITS[plan].members;
      title = "Member limit reached";
      reason = `${on} includes ${quantity(cap, "member")}, and they're all in use. Pending invites count too.`;
      if (next) upgradeLine = `${planName(upgradeTo!)} includes ${quantity(next.members, "member")}.`;
      break;
    }
    case "spaces": {
      const cap = max ?? PLAN_LIMITS[plan].spaces;
      title = "Space limit reached";
      reason = `${on} includes ${quantity(cap, "space")}.`;
      if (next) upgradeLine = `${planName(upgradeTo!)} includes ${quantity(next.spaces, "space")}.`;
      break;
    }
    case "profilesPerSpace": {
      const cap = max ?? PLAN_LIMITS[plan].profilesPerSpace;
      title = "This space is full";
      reason = `On the ${current} plan, each space holds up to ${quantity(cap, "profile")}. You can put new profiles in another space.`;
      if (next) {
        upgradeLine = `${planName(upgradeTo!)} allows ${quantity(next.profilesPerSpace, "profile")} in each space.`;
      }
      break;
    }
    case "categories": {
      const cap = max ?? PLAN_LIMITS[plan].categories;
      title = "Category limit reached";
      reason = `${on} includes ${quantity(cap, "category", "categories")} — the starter ones count too. Deleting one you don't use frees a place.`;
      if (next) {
        upgradeLine = `${planName(upgradeTo!)} includes ${quantity(next.categories, "category", "categories")}.`;
      }
      break;
    }
    case "tags": {
      const cap = max ?? PLAN_LIMITS[plan].tags;
      title = "Tag limit reached";
      reason = `${on} includes ${quantity(cap, "tag")}. Deleting one you don't use frees a place.`;
      if (next) upgradeLine = `${planName(upgradeTo!)} includes ${quantity(next.tags, "tag")}.`;
      break;
    }
    case "storage": {
      const cap = max ?? PLAN_LIMITS[plan].storageBytes;
      const used = info.used;
      title = "Not enough storage";
      reason =
        used !== undefined
          ? `${on} includes ${formatPlanStorage(cap)} for files and receipts, and ${formatFileSize(Math.min(used, cap))} of it is used. This upload doesn't fit.`
          : `${on} includes ${formatPlanStorage(cap)} for files and receipts, and this upload doesn't fit.`;
      if (next) upgradeLine = `${planName(upgradeTo!)} includes ${formatPlanStorage(next.storageBytes)}.`;
      break;
    }
    case "aiActions": {
      const cap = max ?? PLAN_LIMITS[plan].aiActionsPerMonth;
      title = "AI actions used up for this month";
      reason = `This workspace has used its ${quantity(cap, "AI action")} for this month. They refill on ${formatResetDate(nextMonthStartUtc(now))}. You can still add transactions by hand.`;
      if (next) {
        upgradeLine = `${planName(upgradeTo!)} includes ${quantity(next.aiActionsPerMonth, "AI action")} a month.`;
      }
      break;
    }
    case "voice": {
      title = `Voice entry is on ${upgradeTo ? planName(upgradeTo) : "a paid plan"}`;
      reason =
        "Hold M (or the mic) and say what you spent — the AI turns it into transactions. You can still type or paste a note for the AI.";
      if (next) upgradeLine = `${planName(upgradeTo!)} includes voice entry.`;
      break;
    }
    case "profileLevelAccess": {
      title = "Per-profile access is on Plus and Pro";
      reason = `On ${current}, people get Read or Read + write on a whole space. Plus and Pro let you change that for single profiles — hide one, or let someone write to just one.`;
      if (next) upgradeLine = `${planName(upgradeTo!)} includes access settings for each profile.`;
      break;
    }
    case "freeWorkspaces": {
      title = "One free workspace per person";
      reason =
        "You can have one free workspace. Each extra workspace needs its own Plus or Pro plan — until then, an extra free workspace is view-only. Nothing in it is deleted.";
      if (next) upgradeLine = `With ${planName(upgradeTo!)}, this workspace gets its own plan.`;
      break;
    }
  }

  return {
    title,
    reason,
    upgradeTo,
    upgradeLine,
    includes: upgradeTo ? planHighlights(upgradeTo) : [],
  };
}

// ── Meters ─────────────────────────────────────────────────────────────────

export type NumericPlanLimit =
  | "members"
  | "spaces"
  | "profilesPerSpace"
  | "categories"
  | "tags"
  | "aiActionsPerMonth"
  | "storageBytes";

/**
 * The cheapest plan above `plan` with a higher `key` — what an upgrade buys.
 * The same rule as the server's `upgradeForLimit`, for prompts the client
 * raises on its own (a full meter in the usage panel).
 */
export function nextPlanFor(plan: PersonalPlan, key: NumericPlanLimit): PersonalPlan | null {
  const current = PLAN_LIMITS[plan][key];
  return PERSONAL_PLANS.find((p) => planAtLeast(p, plan) && PLAN_LIMITS[p][key] > current) ?? null;
}

export type MeterState = {
  /** 0–100, for a progress bar. */
  percent: number;
  /** ok → warn (85%+) → full (at or past the limit), the storage ring's tones. */
  tone: "ok" | "warn" | "full";
  /** At or past the limit: adding is blocked. */
  full: boolean;
  /** Past the limit (grandfathered, or after a downgrade). Nothing is removed. */
  over: boolean;
};

/** Where a used/limit pair sits — the usage panel's bars and warnings. */
export function meterState(used: number, limit: number): MeterState {
  const safeUsed = Math.max(0, used);
  if (limit <= 0) return { percent: 100, tone: "full", full: true, over: safeUsed > 0 };
  const full = safeUsed >= limit;
  return {
    percent: Math.min(100, Math.round((safeUsed / limit) * 100)),
    tone: full ? "full" : safeUsed >= limit * 0.85 ? "warn" : "ok",
    full,
    over: safeUsed > limit,
  };
}

/** The first instant of next month (UTC) — when the AI allowance refills. */
export function nextMonthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** "November 1" — the reset day, formatted the same on server and client. */
export function formatResetDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}
