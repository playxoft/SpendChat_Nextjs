import "server-only";
import { cache } from "react";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { budgets, categories, profiles, spaces } from "@/db/schema";
import { parseOrThrow } from "@/lib/api-response";
import { getMonthExpenseMatrix } from "@/lib/budget-spend";
import {
  budgetLabel,
  budgetScopeText,
  budgetStatus,
  canManageBudget,
  canSeeBudget,
  compareBudgets,
  countAlerts,
  manageableScopes,
  percentUsed,
  spentFor,
  suggestedBudgetTitle,
  type BudgetPeriod,
  type BudgetScope,
  type BudgetStatus,
  type BudgetTarget,
  type BudgetViewer,
  type ManageableScopes,
} from "@/lib/budgets";
import { assertCanAddBudget, getWorkspaceEntitlements } from "@/lib/entitlements";
import { conflict, forbidden, isUniqueViolation, validationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { notTrashed } from "@/lib/trash-scope";
import { getCurrency } from "@/lib/currencies";
import { toMinorUnits } from "@/lib/money";
import { createBudgetSchema, updateBudgetSchema } from "@/lib/validation";
import {
  accessibleProfileIds,
  getWorkspaceMoneyFormat,
  getWorkspaceRole,
  readOnlyWorkspaceError,
  readOnlyWorkspaceSql,
} from "@/lib/workspaces";

/**
 * Budgets, shared by the web server actions (`src/actions/budgets.ts`) and the
 * REST API (`/api/v1/budgets`). The rules are pure and live in
 * `lib/budgets.ts`; this file loads what they need and writes.
 *
 *  - **Who sees a budget:** admins, and anyone who can read every profile it
 *    covers — for a space, every live profile in it (`canSeeBudget`). One that isn't visible is never listed and reads
 *    as not found.
 *  - **Who manages one:** admins, and anyone with edit access to every profile
 *    it covers (`canManageBudget`). Viewers only look.
 *  - **Progress** is this month's expenses from `getMonthExpenseMatrix` — the
 *    one query every budget number comes from.
 */

export type BudgetView = {
  id: string;
  scope: BudgetScope;
  profileId: string | null;
  categoryId: string | null;
  spaceId: string | null;
  /** What people call it — "Groceries this month". */
  title: string;
  /** An optional note. */
  description: string | null;
  /** What it covers: "Whole workspace", or the space's / profile's / category's name. */
  label: string;
  /** The same, as a short line under the title: "Space · Home". */
  scopeText: string;
  /** The space's, profile's or category's emoji, when it has one. */
  icon: string | null;
  period: BudgetPeriod;
  amountMinor: number;
  emailAlerts: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  /** The month the progress is for, "YYYY-MM". */
  month: string;
  spentMinor: number;
  /** Whole percent used, rounded down; can pass 100. */
  percent: number;
  status: BudgetStatus;
  /** The caller can change it (never in a view-only workspace). */
  canManage: boolean;
  /**
   * The caller can delete it — like `canManage`, but still true in a view-only
   * workspace, where removing stays open.
   */
  canDelete: boolean;
};

export type BudgetAccess = BudgetViewer & {
  /** The workspace is view-only (an extra free one): no budget can be added or changed. */
  readOnly: boolean;
};

/**
 * What the caller can see and change in the workspace, in one round of
 * parallel reads — the same SQL every other read scopes by.
 */
export async function budgetAccess(userId: string, workspaceId: string): Promise<BudgetAccess> {
  const db = getDb();
  const [role, readable, writable, live, spaceRows, ro] = await Promise.all([
    getWorkspaceRole(userId, workspaceId),
    accessibleProfileIds(userId, workspaceId, "viewer"),
    accessibleProfileIds(userId, workspaceId, "editor"),
    // Every live profile and the space it's in now, whoever can see it.
    db
      .select({ id: profiles.id, spaceId: profiles.spaceId })
      .from(profiles)
      .where(and(eq(profiles.workspaceId, workspaceId), notTrashed(profiles))),
    db.select({ id: spaces.id }).from(spaces).where(eq(spaces.workspaceId, workspaceId)),
    db.execute<{ ro: boolean }>(sql`select ${readOnlyWorkspaceSql(workspaceId)} as ro`),
  ]);
  const spaceProfiles = new Map<string, string[]>(spaceRows.map((r) => [r.id, []]));
  for (const p of live) spaceProfiles.get(p.spaceId)?.push(p.id);
  return {
    isAdmin: role === "admin",
    readable: new Set(readable.map((r) => r.id)),
    writable: new Set(writable.map((r) => r.id)),
    totalProfiles: live.length,
    spaceProfiles,
    readOnly: Boolean(ro.rows[0]?.ro),
  };
}

const budgetColumns = {
  id: budgets.id,
  scope: budgets.scope,
  profileId: budgets.profileId,
  categoryId: budgets.categoryId,
  spaceId: budgets.spaceId,
  title: budgets.title,
  description: budgets.description,
  amountMinor: budgets.amountMinor,
  period: budgets.period,
  emailAlerts: budgets.emailAlerts,
  createdBy: budgets.createdBy,
  createdAt: budgets.createdAt,
  updatedAt: budgets.updatedAt,
  profileName: profiles.name,
  profileIcon: profiles.icon,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  spaceName: spaces.name,
  spaceIcon: spaces.icon,
};

/**
 * Every live budget of a workspace with the names it's labelled by — no access
 * filter. A budget on a profile in the trash is left out: it's hidden (from
 * admins too), spends nothing and alerts nobody until the profile is restored,
 * and goes with the profile when the trash is emptied.
 */
export async function loadWorkspaceBudgets(workspaceId: string) {
  return (
    getDb()
      .select(budgetColumns)
      .from(budgets)
      .leftJoin(profiles, eq(profiles.id, budgets.profileId))
      .leftJoin(categories, eq(categories.id, budgets.categoryId))
      .leftJoin(spaces, eq(spaces.id, budgets.spaceId))
      // Null for a workspace, space or category budget (no profile joined), so
      // only a trashed profile's budget drops out.
      .where(and(eq(budgets.workspaceId, workspaceId), notTrashed(profiles)))
  );
}

export type BudgetRow = Awaited<ReturnType<typeof loadWorkspaceBudgets>>[number];

/** What a budget row covers, by name. */
export function labelOf(row: BudgetRow): string {
  return budgetLabel(row);
}

/** Its emoji: the space's, profile's or category's. */
function iconOf(row: BudgetRow): string | null {
  if (row.scope === "profile") return row.profileIcon;
  if (row.scope === "category") return row.categoryIcon;
  if (row.scope === "space") return row.spaceIcon;
  return null;
}

/**
 * The budgets the caller can see, with `month`'s progress, in display order
 * (the whole workspace, then spaces, profiles and categories). Two reads when the
 * workspace has budgets, one when it has none.
 *
 * Memoized per RSC render (`cache`): the layout's nav badge and the budgets or
 * analytics page ask for the same list in one render. Nothing writes during a
 * render, and outside one (actions, the API) it runs every time.
 */
export const listBudgets = cache(listBudgetsUncached);

async function listBudgetsUncached(
  userId: string,
  workspaceId: string,
  month: string,
): Promise<BudgetView[]> {
  const rows = await loadWorkspaceBudgets(workspaceId);
  if (rows.length === 0) return [];
  const [access, matrix] = await Promise.all([
    budgetAccess(userId, workspaceId),
    getMonthExpenseMatrix(workspaceId, month),
  ]);
  return rows
    .filter((row) => canSeeBudget(row, access))
    .map((row): BudgetView => {
      const spentMinor = spentFor(row, matrix);
      return {
        id: row.id,
        scope: row.scope,
        profileId: row.profileId,
        categoryId: row.categoryId,
        spaceId: row.spaceId,
        title: row.title,
        description: row.description,
        label: labelOf(row),
        scopeText: budgetScopeText(row),
        icon: iconOf(row),
        period: row.period,
        amountMinor: row.amountMinor,
        emailAlerts: row.emailAlerts,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        month,
        spentMinor,
        percent: percentUsed(spentMinor, row.amountMinor),
        status: budgetStatus(spentMinor, row.amountMinor),
        canManage: !access.readOnly && canManageBudget(row, access),
        canDelete: canManageBudget(row, access),
      };
    })
    .sort(compareBudgets);
}

/** One visible budget with `month`'s progress, or null. */
export async function getBudget(
  userId: string,
  workspaceId: string,
  id: string,
  month: string,
): Promise<BudgetView | null> {
  return (await listBudgets(userId, workspaceId, month)).find((b) => b.id === id) ?? null;
}

/**
 * The in-app alert count — visible budgets at 80% or more this month, and how
 * many of those are at 100%. Computed live; there is no notifications table.
 */
export async function getBudgetAlertCount(
  userId: string,
  workspaceId: string,
  month: string,
): Promise<{ warn: number; over: number }> {
  const list = await listBudgets(userId, workspaceId, month);
  return countAlerts(list.map((b) => b.status));
}

/** What the "New budget" form may offer this person. */
export async function getBudgetManagement(
  userId: string,
  workspaceId: string,
): Promise<{ scopes: ManageableScopes; readOnly: boolean }> {
  const access = await budgetAccess(userId, workspaceId);
  return { scopes: manageableScopes(access), readOnly: access.readOnly };
}

function manageError(target: BudgetTarget) {
  return forbidden(
    target.scope === "profile"
      ? "You need edit access to this profile to set its budget"
      : target.scope === "space"
        ? "Only someone who can edit every profile in this space can set its budget"
        : "Only someone who can edit every profile in this workspace can set this budget",
  );
}

/**
 * The amount in the workspace's minor units — refused when it rounds to
 * nothing (0.001, or 0.4 in yen), which the schema's `> 0` would otherwise
 * turn into a 500.
 */
function budgetMinorUnits(amount: number, money: { currency: string; locale: string }): number {
  const minor = toMinorUnits(amount, money.currency, money.locale);
  if (minor <= 0) {
    const smallest = 1 / 10 ** getCurrency(money.currency).decimals;
    throw validationError(`The amount must be at least ${smallest} ${money.currency}`);
  }
  return minor;
}

const SCOPE_TAKEN: Record<BudgetScope, string> = {
  workspace: "This workspace already has a budget for all its spending — change that one instead",
  profile: "This profile already has a budget — change that one instead",
  category: "This category already has a budget — change that one instead",
  space: "This space already has a budget — change that one instead",
};

/**
 * Add a budget. In order: the input; what it covers belongs to this workspace
 * (a profile or space the caller can't see reads as invalid, like a
 * stranger's); the
 * workspace isn't view-only; the caller may manage that scope; the plan has
 * room (`assertCanAddBudget`, under a lock, in the insert's transaction); and
 * nothing covers that scope yet.
 */
export async function createBudget(
  userId: string,
  workspaceId: string,
  input: unknown,
): Promise<{ id: string }> {
  const data = parseOrThrow(createBudgetSchema, input);
  const target: BudgetTarget = {
    scope: data.scope,
    profileId: data.scope === "profile" ? data.profileId : null,
    categoryId: data.scope === "category" ? data.categoryId : null,
    spaceId: data.scope === "space" ? data.spaceId : null,
  };
  const db = getDb();
  const [access, money, ent] = await Promise.all([
    budgetAccess(userId, workspaceId),
    getWorkspaceMoneyFormat(workspaceId),
    getWorkspaceEntitlements(workspaceId),
  ]);
  const amountMinor = budgetMinorUnits(data.amount, money);

  // What it covers, by name — for the suggested title. `readable` and
  // `spaceProfiles` only ever hold this workspace's profiles and spaces, so
  // these are also the "same workspace" checks.
  const names: { profileName?: string; categoryName?: string; spaceName?: string } = {};
  if (target.profileId) {
    if (!access.readable.has(target.profileId)) throw validationError("Invalid profile");
    const profile = await db.query.profiles.findFirst({
      where: and(eq(profiles.id, target.profileId), notTrashed(profiles)),
      columns: { name: true },
    });
    names.profileName = profile?.name;
  }
  if (target.categoryId) {
    const category = await db.query.categories.findFirst({
      where: and(eq(categories.id, target.categoryId), eq(categories.workspaceId, workspaceId)),
      columns: { kind: true, name: true },
    });
    if (!category) throw validationError("Invalid category");
    if (category.kind !== "expense") {
      throw validationError("Budgets track spending — pick an expense category");
    }
    names.categoryName = category.name;
  }
  if (target.spaceId) {
    if (!access.spaceProfiles.has(target.spaceId) || !canSeeBudget(target, access)) {
      throw validationError("Invalid space");
    }
    const space = await db.query.spaces.findFirst({
      where: eq(spaces.id, target.spaceId),
      columns: { name: true },
    });
    names.spaceName = space?.name;
  }
  if (access.readOnly) throw readOnlyWorkspaceError();
  if (!canManageBudget(target, access)) throw manageError(target);

  try {
    const id = await db.transaction(async (tx) => {
      await assertCanAddBudget(tx, ent);
      const [row] = await tx
        .insert(budgets)
        .values({
          workspaceId,
          scope: target.scope,
          profileId: target.profileId,
          categoryId: target.categoryId,
          spaceId: target.spaceId,
          title: data.title ?? suggestedBudgetTitle({ scope: target.scope, ...names }),
          description: data.description ?? null,
          amountMinor,
          emailAlerts: data.emailAlerts ?? true,
          createdBy: userId,
        })
        .returning({ id: budgets.id });
      return row!.id;
    });
    logger.info(`Budget added for a ${target.scope} scope`, {
      event: "budget.created",
      budgetId: id,
      scope: target.scope,
    });
    return { id };
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(SCOPE_TAKEN[target.scope]);
    throw err;
  }
}

const isUuid = (id: string) => z.string().uuid().safeParse(id).success;

/** The budget row in this workspace, if the caller can see it. */
async function visibleBudget(userId: string, workspaceId: string, id: string) {
  if (!isUuid(id)) return null;
  const row = await getDb().query.budgets.findFirst({
    where: and(eq(budgets.id, id), eq(budgets.workspaceId, workspaceId)),
  });
  if (!row) return null;
  const access = await budgetAccess(userId, workspaceId);
  return canSeeBudget(row, access) ? { row, access } : null;
}

/**
 * Change a budget's amount, email alerts, title or description. Returns false
 * when there's no such budget the caller can see (callers answer 404).
 *
 * The alert log is left alone: a threshold that already fired this month
 * fires again only once the amount is *above* the one it fired at
 * (`checkBudgetAlerts`), so lowering and raising an amount can't re-send it.
 */
export async function updateBudget(
  userId: string,
  workspaceId: string,
  id: string,
  input: unknown,
): Promise<boolean> {
  const data = parseOrThrow(updateBudgetSchema, input);
  const found = await visibleBudget(userId, workspaceId, id);
  if (!found) return false;
  const { row, access } = found;
  if (access.readOnly) throw readOnlyWorkspaceError();
  if (!canManageBudget(row, access)) throw manageError(row);

  const patch: Partial<typeof budgets.$inferInsert> = { updatedAt: new Date() };
  if (data.amount !== undefined) {
    patch.amountMinor = budgetMinorUnits(data.amount, await getWorkspaceMoneyFormat(workspaceId));
  }
  if (data.emailAlerts !== undefined) patch.emailAlerts = data.emailAlerts;
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description;

  await getDb().update(budgets).set(patch).where(eq(budgets.id, id));
  return true;
}

/**
 * Delete a budget (its alert log goes with it). Returns false when there's no
 * such budget the caller can see. Allowed in a view-only workspace — removing
 * stays open there, like every other limit.
 */
export async function deleteBudget(
  userId: string,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const found = await visibleBudget(userId, workspaceId, id);
  if (!found) return false;
  if (!canManageBudget(found.row, found.access)) throw manageError(found.row);
  await getDb().delete(budgets).where(eq(budgets.id, id));
  logger.info("Budget deleted", { event: "budget.deleted", budgetId: id });
  return true;
}
