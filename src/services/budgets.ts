import "server-only";
import { cache } from "react";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { budgetAlerts, budgets, categories, profiles } from "@/db/schema";
import { parseOrThrow } from "@/lib/api-response";
import { getMonthExpenseMatrix } from "@/lib/budget-spend";
import {
  budgetLabel,
  budgetStatus,
  canManageBudget,
  canSeeBudget,
  compareBudgets,
  countAlerts,
  currentMonthKeys,
  manageableScopes,
  monthBounds,
  percentUsed,
  spentFor,
  thresholdsMet,
  type BudgetPeriod,
  type BudgetScope,
  type BudgetStatus,
  type BudgetTarget,
  type BudgetViewer,
  type ManageableScopes,
} from "@/lib/budgets";
import { assertCanAddBudget } from "@/lib/entitlements";
import { conflict, forbidden, isUniqueViolation, validationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
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
 *    covers (`canSeeBudget`). One that isn't visible is never listed and reads
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
  /** "Whole workspace", or the profile's / category's name. */
  label: string;
  /** The profile's or category's emoji, when it has one. */
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
  /** The caller can change or delete it. */
  canManage: boolean;
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
  const [role, readable, writable, totals] = await Promise.all([
    getWorkspaceRole(userId, workspaceId),
    accessibleProfileIds(userId, workspaceId, "viewer"),
    accessibleProfileIds(userId, workspaceId, "editor"),
    db.execute<{ total: string; ro: boolean }>(sql`
      select
        (select count(*) from ${profiles} where ${profiles.workspaceId} = ${workspaceId})::text as total,
        ${readOnlyWorkspaceSql(workspaceId)} as ro
    `),
  ]);
  const row = totals.rows[0];
  return {
    isAdmin: role === "admin",
    readable: new Set(readable.map((r) => r.id)),
    writable: new Set(writable.map((r) => r.id)),
    totalProfiles: Number(row?.total ?? 0),
    readOnly: Boolean(row?.ro),
  };
}

const budgetColumns = {
  id: budgets.id,
  scope: budgets.scope,
  profileId: budgets.profileId,
  categoryId: budgets.categoryId,
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
};

/** Every budget of a workspace with the names it's labelled by — no access filter. */
export async function loadWorkspaceBudgets(workspaceId: string) {
  return getDb()
    .select(budgetColumns)
    .from(budgets)
    .leftJoin(profiles, eq(profiles.id, budgets.profileId))
    .leftJoin(categories, eq(categories.id, budgets.categoryId))
    .where(eq(budgets.workspaceId, workspaceId));
}

export type BudgetRow = Awaited<ReturnType<typeof loadWorkspaceBudgets>>[number];

/** A budget row as the label and target the pure rules take. */
export function labelOf(row: BudgetRow): string {
  return budgetLabel({
    scope: row.scope,
    profileName: row.profileName,
    categoryName: row.categoryName,
  });
}

/**
 * The budgets the caller can see, with `month`'s progress, in display order
 * (the whole workspace, then profiles, then categories). Two reads when the
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
        label: labelOf(row),
        icon: row.scope === "profile" ? row.profileIcon : row.scope === "category" ? row.categoryIcon : null,
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
      : "Only someone who can edit every profile in this workspace can set this budget",
  );
}

const SCOPE_TAKEN: Record<BudgetScope, string> = {
  workspace: "This workspace already has a budget for all its spending — change that one instead",
  profile: "This profile already has a budget — change that one instead",
  category: "This category already has a budget — change that one instead",
};

/**
 * Add a budget. In order: the input; what it covers belongs to this workspace
 * (a profile the caller can't see reads as invalid, like a stranger's); the
 * workspace isn't view-only; the caller may manage that scope; the plan has
 * room (`assertCanAddBudget`); and nothing covers that scope yet.
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
  };
  const db = getDb();
  const [access, money] = await Promise.all([
    budgetAccess(userId, workspaceId),
    getWorkspaceMoneyFormat(workspaceId),
  ]);

  // `readable` only ever holds this workspace's profiles, so this is also the
  // "same workspace" check.
  if (target.profileId && !access.readable.has(target.profileId)) {
    throw validationError("Invalid profile");
  }
  if (target.categoryId) {
    const category = await db.query.categories.findFirst({
      where: and(eq(categories.id, target.categoryId), eq(categories.workspaceId, workspaceId)),
      columns: { kind: true },
    });
    if (!category) throw validationError("Invalid category");
    if (category.kind !== "expense") {
      throw validationError("Budgets track spending — pick an expense category");
    }
  }
  if (access.readOnly) throw readOnlyWorkspaceError();
  if (!canManageBudget(target, access)) throw manageError(target);
  await assertCanAddBudget(workspaceId);

  try {
    const [row] = await db
      .insert(budgets)
      .values({
        workspaceId,
        scope: target.scope,
        profileId: target.profileId,
        categoryId: target.categoryId,
        amountMinor: toMinorUnits(data.amount, money.currency, money.locale),
        emailAlerts: data.emailAlerts ?? true,
        createdBy: userId,
      })
      .returning({ id: budgets.id });
    logger.info(`Budget added for a ${target.scope} scope`, {
      event: "budget.created",
      budgetId: row!.id,
      scope: target.scope,
    });
    return { id: row!.id };
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
 * Change a budget's amount or its email alerts. Returns false when there's no
 * such budget the caller can see (callers answer 404).
 *
 * A new amount re-arms this month's alerts that it no longer meets: a budget
 * that alerted at 100% and is then raised to sit at 60% alerts again when it
 * passes 80% of the new amount.
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
    const money = await getWorkspaceMoneyFormat(workspaceId);
    patch.amountMinor = toMinorUnits(data.amount, money.currency, money.locale);
  }
  if (data.emailAlerts !== undefined) patch.emailAlerts = data.emailAlerts;

  const db = getDb();
  await db.update(budgets).set(patch).where(eq(budgets.id, id));
  if (patch.amountMinor !== undefined && patch.amountMinor !== row.amountMinor) {
    await rearmAlerts(workspaceId, row, patch.amountMinor);
  }
  return true;
}

/** Forget this month's claimed alerts that `amountMinor` no longer reaches. */
async function rearmAlerts(
  workspaceId: string,
  target: BudgetTarget & { id: string },
  amountMinor: number,
): Promise<void> {
  const db = getDb();
  for (const month of currentMonthKeys()) {
    const spent = spentFor(target, await getMonthExpenseMatrix(workspaceId, month));
    await db
      .delete(budgetAlerts)
      .where(
        and(
          eq(budgetAlerts.budgetId, target.id),
          eq(budgetAlerts.month, monthBounds(month).first),
          notInArray(budgetAlerts.threshold, thresholdsMet(spent, amountMinor)),
        ),
      );
  }
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
