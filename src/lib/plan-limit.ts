import { formatFileSize } from "@/lib/attachments";
import {
  PERSONAL_PLANS,
  PLAN_LIMITS,
  isPersonalPlan,
  planAtLeast,
  type PersonalPlan,
} from "@/lib/plans";

/**
 * The client half of a `plan_limit` rejection: recognising one on an action
 * result (or an upload response) and validating its `details`, plus the small
 * formatters and meter maths the limit UI shares. Pure and client-safe — the
 * numbers come from the same `PLAN_LIMITS` the server enforces.
 *
 * The upgrade dialog's words for a limit are `limitPitch` in `lib/plan-copy.ts`;
 * its button links to checkout for the plan that lifts it (`lib/checkout.ts`).
 */

/** Mirrors `PlanLimitKey` in `lib/errors.ts` (kept here so this file stays client-safe). */
export const PLAN_LIMIT_KEYS = [
  "members",
  "spaces",
  "profilesPerSpace",
  "categories",
  "tags",
  "budgets",
  "storage",
  "aiActions",
  "voice",
  "profileLevelAccess",
  "freeWorkspaces",
] as const;
export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number];

/**
 * What the upgrade dialog can explain: every server key, plus `newWorkspace`
 * — the one-free-workspace rule met from "New workspace" (creating another
 * one), as opposed to `freeWorkspaces`, an extra workspace that is view-only.
 * The server says `freeWorkspaces` for both; the client knows which one it
 * hit (the create lock, the create form's refusal), so it names it.
 */
export const UPGRADE_LIMITS = [...PLAN_LIMIT_KEYS, "newWorkspace"] as const;
export type UpgradeLimit = (typeof UPGRADE_LIMITS)[number];

export type PlanLimitInfo = {
  limit: UpgradeLimit;
  /** The workspace's plan when the limit was hit — the one that's open. */
  plan: PersonalPlan;
  /** The cap that was hit, when it's a number. */
  max?: number;
  /** How much is in use, when it's a number. */
  used?: number;
  /** The cheapest plan that lifts the limit; null when none does ("contact us"). */
  upgradeTo: PersonalPlan | null;
  /**
   * `newWorkspace` only: the open workspace is the person's one free
   * workspace, so upgrading it frees the free place a new workspace needs.
   * Otherwise the free workspace to upgrade is another one.
   */
  freeSlotHere?: boolean;
  /** For `newWorkspace`: free workspaces the person owns. More than one = upgrading one won't make room. */
  freeOwned?: number;
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

/**
 * Budgets are the one limit with two faces: `max` is the hard cap, and
 * `displayUnlimited` (Pro) shows "Unlimited" instead of the number — Pro's 200
 * is a safety cap, and reaching it says "Contact us", never "Upgrade".
 */
export function budgetsCap(plan: PersonalPlan): number {
  return PLAN_LIMITS[plan].budgets.max;
}

/** "5", or "Unlimited" on a plan that shows its cap as unlimited. */
export function budgetsLimitLabel(plan: PersonalPlan): string {
  const b = PLAN_LIMITS[plan].budgets;
  return b.displayUnlimited ? "Unlimited" : b.max.toLocaleString("en-US");
}

/** "5 budgets", or "unlimited budgets". */
export function budgetsAllowance(plan: PersonalPlan): string {
  const b = PLAN_LIMITS[plan].budgets;
  return b.displayUnlimited ? "unlimited budgets" : quantity(b.max, "budget");
}

/** The cheapest plan above `plan` that allows more budgets — `nextPlanFor` for the object-shaped limit. */
export function nextPlanForBudgets(plan: PersonalPlan): PersonalPlan | null {
  const current = budgetsCap(plan);
  return PERSONAL_PLANS.find((p) => planAtLeast(p, plan) && budgetsCap(p) > current) ?? null;
}

export type MeterState = {
  /** 0–100, for a progress bar. */
  percent: number;
  /** ok → warn (85%+) → full (at or past the limit), the storage ring's tones. */
  tone: "ok" | "warn" | "full";
  /** At or past the limit: adding is blocked. */
  full: boolean;
  /** Past the limit (after a downgrade). Nothing is removed. */
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
