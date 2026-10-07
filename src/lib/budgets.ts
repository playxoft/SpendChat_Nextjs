// Relative imports only: `src/db/schema.ts` reads the enums below, and
// drizzle-kit's schema loader doesn't know the `@/` alias.
import { monthRange } from "./dates";

/**
 * Budgets — the rules, pure and client-safe. A budget is a monthly limit on
 * **expenses** for the whole workspace, one space (every live profile in it),
 * one profile, or one expense category (across every profile). The server
 * reads a month's spending once (`getMonthExpenseMatrix` in `budget-spend.ts`)
 * and everything else — the budgets page, the analytics card, the nav badge,
 * the alert emails — is worked out from that here, so they can never disagree
 * about a number.
 *
 * - **This month** is the calendar month of `transactions.occurred_on`, a date
 *   with no zone — the same month analytics shows. The web reads it in the
 *   viewer's zone; the API takes `?month=YYYY-MM`.
 * - **Only expenses count.** Income never offsets spending, so a refund
 *   recorded as income doesn't lower a budget's usage.
 * - **Integer maths only.** Amounts are minor units and thresholds compare
 *   `spent × 100` with `amount × t`, so 79.99% is never rounded up to 80%.
 */

/**
 * The `budget_scope` enum, in the database's order — Postgres appends a value
 * it gains (`space` came last), so this order is the schema's, not the
 * display order (`SCOPE_ORDER`).
 */
export const BUDGET_SCOPES = ["workspace", "profile", "category", "space"] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];

/** How budgets are listed: the widest first. */
const SCOPE_ORDER: readonly BudgetScope[] = ["workspace", "space", "profile", "category"];

export const BUDGET_PERIODS = ["monthly"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

/** A budget's title and its optional description — the column widths too. */
export const BUDGET_TITLE_MAX = 60;
export const BUDGET_DESCRIPTION_MAX = 140;

/** The percentages that raise an alert — in the app and by email. */
export const BUDGET_THRESHOLDS = [80, 100] as const;
export type BudgetThreshold = (typeof BUDGET_THRESHOLDS)[number];

/** ok → warn (80%+) → over (100%+). */
export type BudgetStatus = "ok" | "warn" | "over";

/**
 * One month's expenses for one profile × category pair, in minor units, with
 * the space the profile is in **now** — so a space budget always follows the
 * space's current profiles: move a profile to another space and its spending
 * this month moves with it.
 */
export type SpendCell = {
  profileId: string;
  spaceId: string;
  categoryId: string | null;
  totalMinor: number;
};

/** What a budget covers: exactly one of the ids is set, or none for the whole workspace. */
export type BudgetTarget = {
  scope: BudgetScope;
  profileId: string | null;
  categoryId: string | null;
  spaceId: string | null;
};

// ── Progress ───────────────────────────────────────────────────────────────

/**
 * What a budget has used this month: every cell for the whole workspace, one
 * space's cells (its profiles as they are now), one profile's cells, or one
 * category's cells across every profile.
 */
export function spentFor(target: BudgetTarget, matrix: readonly SpendCell[]): number {
  let total = 0;
  for (const cell of matrix) {
    if (target.scope === "profile" && cell.profileId !== target.profileId) continue;
    if (target.scope === "category" && cell.categoryId !== target.categoryId) continue;
    if (target.scope === "space" && cell.spaceId !== target.spaceId) continue;
    total += cell.totalMinor;
  }
  return total;
}

/** Whole percent used, rounded down (82.9% → 82). 0 for a non-positive amount. */
export function percentUsed(spentMinor: number, amountMinor: number): number {
  if (amountMinor <= 0) return 0;
  return Math.floor((Math.max(0, spentMinor) * 100) / amountMinor);
}

/** The thresholds this much spending has reached, lowest first. */
export function thresholdsMet(spentMinor: number, amountMinor: number): BudgetThreshold[] {
  if (amountMinor <= 0) return [];
  return BUDGET_THRESHOLDS.filter((t) => spentMinor * 100 >= amountMinor * t);
}

export function budgetStatus(spentMinor: number, amountMinor: number): BudgetStatus {
  const met = thresholdsMet(spentMinor, amountMinor);
  if (met.includes(100)) return "over";
  if (met.includes(80)) return "warn";
  return "ok";
}

/** How many budgets need a look: at 80% or more (`warn`), and of those, at 100% or more (`over`). */
export function countAlerts(statuses: readonly BudgetStatus[]): { warn: number; over: number } {
  let warn = 0;
  let over = 0;
  for (const s of statuses) {
    if (s === "over") over++;
    if (s !== "ok") warn++;
  }
  return { warn, over };
}

// ── Who sees and manages a budget ──────────────────────────────────────────

/**
 * What the caller can do in the workspace, resolved once per request from the
 * same SQL every read uses (`accessibleProfileIds`).
 */
export type BudgetViewer = {
  /** Workspace admin (the owner always is one): sees and manages everything. */
  isAdmin: boolean;
  /** Profiles the caller can at least read. */
  readable: ReadonlySet<string>;
  /** Profiles the caller can write (empty in a view-only workspace). */
  writable: ReadonlySet<string>;
  /** Every live profile in the workspace (none in the trash), whoever can see it. */
  totalProfiles: number;
  /** The live profiles in each space, whoever can see them. */
  spaceProfiles: ReadonlyMap<string, readonly string[]>;
};

/**
 * The live profiles a space budget covers — none for a space that's empty (or
 * gone), and then only admins see or manage its budget.
 */
function spaceMembersOf(target: BudgetTarget, viewer: BudgetViewer): readonly string[] {
  return (target.spaceId && viewer.spaceProfiles.get(target.spaceId)) || [];
}

const all = (ids: readonly string[], set: ReadonlySet<string>) =>
  ids.length > 0 && ids.every((id) => set.has(id));

/**
 * A budget is shown only to people who can read **every** profile it covers —
 * otherwise its total would reveal spending they can't see. The whole
 * workspace and a category both cover every live profile; a space covers the
 * live profiles in it; a profile budget covers one, and shows to whoever can
 * read that profile — which an admin always can, unless it's in the trash
 * (then nobody sees the budget until it's restored). Admins see every
 * workspace, space and category budget.
 */
export function canSeeBudget(target: BudgetTarget, viewer: BudgetViewer): boolean {
  if (target.scope === "profile") return target.profileId != null && viewer.readable.has(target.profileId);
  if (viewer.isAdmin) return true;
  if (target.scope === "space") return all(spaceMembersOf(target, viewer), viewer.readable);
  return viewer.readable.size >= viewer.totalProfiles;
}

/**
 * Managing (add, change, delete) needs edit access to every profile the budget
 * covers — admins and editors manage, viewers only look. The same reach as
 * renaming a shared category (`requireSharedListEdit`).
 */
export function canManageBudget(target: BudgetTarget, viewer: BudgetViewer): boolean {
  if (viewer.isAdmin) return true;
  if (target.scope === "profile") return target.profileId != null && viewer.writable.has(target.profileId);
  if (target.scope === "space") return all(spaceMembersOf(target, viewer), viewer.writable);
  return viewer.writable.size > 0 && viewer.writable.size >= viewer.totalProfiles;
}

/** The scopes the caller may add a budget for — what the "New budget" form offers. */
export type ManageableScopes = {
  workspace: boolean;
  category: boolean;
  profileIds: string[];
  /** Spaces the caller can manage a budget for — only ones they can see. */
  spaceIds: string[];
};

const NO_TARGET = { profileId: null, categoryId: null, spaceId: null };

export function manageableScopes(viewer: BudgetViewer): ManageableScopes {
  const wide = canManageBudget({ scope: "workspace", ...NO_TARGET }, viewer);
  const spaceIds = [...viewer.spaceProfiles.keys()].filter((spaceId) =>
    canManageBudget({ scope: "space", ...NO_TARGET, spaceId }, viewer),
  );
  return { workspace: wide, category: wide, profileIds: [...viewer.writable], spaceIds };
}

/** Whether the caller can add any budget at all. */
export function canAddAnyBudget(scopes: ManageableScopes): boolean {
  return (
    scopes.workspace || scopes.category || scopes.profileIds.length > 0 || scopes.spaceIds.length > 0
  );
}

// ── Months ─────────────────────────────────────────────────────────────────

/**
 * Years 1970–2999 only: a month key becomes a date in SQL, and a year below
 * 1000 isn't four digits there (`99-01-01`), which Postgres refuses.
 */
const MONTH_KEY = /^(19[7-9]\d|2\d{3})-(0[1-9]|1[0-2])$/;

/** "2026-10" — a real month between 1970 and 2999. */
export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && MONTH_KEY.test(value);
}

/** "2026-10-17" → "2026-10". */
export function monthKeyOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

/** The first and last day (YYYY-MM-DD) of a "YYYY-MM" month. */
export function monthBounds(monthKey: string): { first: string; last: string } {
  const { start, end } = monthRange(`${monthKey}-01`);
  return { first: start, last: end };
}

/** The current month in UTC — the API's default when a client sends no `month`. */
export function utcMonthKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

const HOUR = 3_600_000;

/**
 * The months that are "this month" somewhere on Earth right now: the month of
 * UTC−12 and the month of UTC+14. One key on almost every day; two in the
 * hours either side of a month boundary.
 *
 * An alert is only ever about one of these, so a backfill or a CSV of last
 * quarter never emails "you've used 100% of July" in October — and the check
 * needs no idea of the writer's zone (the API doesn't send one).
 */
export function currentMonthKeys(now: Date = new Date()): string[] {
  const earliest = utcMonthKey(new Date(now.getTime() - 12 * HOUR));
  const latest = utcMonthKey(new Date(now.getTime() + 14 * HOUR));
  return earliest === latest ? [earliest] : [earliest, latest];
}

/** "October 2026" — English by default (emails), or in a workspace's locale. */
export function monthName(monthKey: string, locale = "en-US"): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Words ──────────────────────────────────────────────────────────────────

export const WORKSPACE_BUDGET_LABEL = "Whole workspace";

type ScopeNames = {
  scope: BudgetScope;
  profileName?: string | null;
  categoryName?: string | null;
  spaceName?: string | null;
};

/** What a budget covers, by name: the space's, profile's or category's, or "Whole workspace". */
export function budgetLabel(input: ScopeNames): string {
  if (input.scope === "profile") return input.profileName ?? "Profile";
  if (input.scope === "category") return input.categoryName ?? "Category";
  if (input.scope === "space") return input.spaceName ?? "Space";
  return WORKSPACE_BUDGET_LABEL;
}

/** "Space · Home", "Category · Groceries" — the scope in a few words, under a title. */
export function budgetScopeText(input: ScopeNames): string {
  if (input.scope === "workspace") return WORKSPACE_BUDGET_LABEL;
  const kind = { profile: "Profile", category: "Category", space: "Space" }[input.scope];
  return `${kind} · ${budgetLabel(input)}`;
}

/**
 * The title a new budget starts with — "Groceries this month", "Home space",
 * "All spending this month" — editable before saving. Also what titles were
 * back-filled with for budgets made before titles existed (the hand-written
 * block in the `budget_spaces` migration says the same in SQL).
 */
export function suggestedBudgetTitle(input: ScopeNames): string {
  const title =
    input.scope === "workspace"
      ? "All spending this month"
      : input.scope === "space"
        ? `${budgetLabel(input)} space`
        : `${budgetLabel(input)} this month`;
  return title.slice(0, BUDGET_TITLE_MAX);
}

/** Display order: the widest scope first (workspace, space, profile, category), then by title. */
export function compareBudgets(
  a: { scope: BudgetScope; title: string },
  b: { scope: BudgetScope; title: string },
): number {
  const rank = SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope);
  return rank !== 0 ? rank : a.title.localeCompare(b.title);
}
