import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetAlerts, users, workspaceMembers, workspaces } from "@/db/schema";
import { getMonthExpenseMatrix } from "@/lib/budget-spend";
import {
  canSeeBudget,
  currentMonthKeys,
  monthBounds,
  monthKeyOf,
  monthName,
  spentFor,
  thresholdsMet,
  type BudgetThreshold,
} from "@/lib/budgets";
import { afterResponse } from "@/lib/defer";
import { redactEmail, sendEmail } from "@/lib/email";
import { assertEmailSendAllowed } from "@/lib/email-quota";
import { budgetAlertEmail, siteUrl, type BudgetAlertItem } from "@/lib/email-templates";
import { ApiError } from "@/lib/errors";
import { openWorkspacePath } from "@/lib/invite-links";
import { logger } from "@/lib/logger";
import { budgetAccess, labelOf, loadWorkspaceBudgets, type BudgetRow } from "@/services/budgets";

/**
 * Budget alerts at 80% and 100% — by email, once per budget, per threshold, per
 * month. (In-app alerts need none of this: the app computes them live from the
 * month's spending on every render.)
 *
 * **Every transaction write that can raise spending calls
 * `scheduleBudgetCheck`** once it has written — create, edit, bulk edit, bulk
 * add / import / AI confirm, the API's single and bulk create, and moving a
 * profile's transactions. It does no I/O itself: it keeps the dates whose month
 * is current somewhere on Earth (`currentMonthKeys`) and, if any are left,
 * defers `checkBudgetAlerts` until after the response (`afterResponse`). The
 * write never waits for it and never fails because of it.
 */

export type BudgetCheckRequest = {
  workspaceId: string;
  /** Whose write triggered it — the sender the email quota is counted against. */
  userId: string;
  /**
   * The `occurred_on` dates of the expenses written, or `"current"` when they
   * aren't known (a whole profile's transactions moved). Income, deletes and
   * tag edits can't raise spending, so their callers pass nothing.
   */
  dates: readonly string[] | "current";
};

/** Defer a budget check for the months this write touched, if any are current. */
export function scheduleBudgetCheck(request: BudgetCheckRequest, now: Date = new Date()): void {
  const current = currentMonthKeys(now);
  const months =
    request.dates === "current"
      ? current
      : [...new Set(request.dates.map(monthKeyOf))].filter((m) => current.includes(m));
  if (months.length === 0) return;
  afterResponse("budget check", async () => {
    await checkBudgetAlerts({ workspaceId: request.workspaceId, userId: request.userId, months });
  });
}

export type BudgetCheckResult = {
  /** Alert rows this check claimed (budget × month × threshold). */
  claimed: number;
  /** Emails handed to the mailer. */
  emailed: number;
};

type Crossing = { budget: BudgetRow; month: string; threshold: BudgetThreshold; spentMinor: number };

const NONE: BudgetCheckResult = { claimed: 0, emailed: 0 };

/**
 * Claim and email every alert the workspace's budgets have reached in `months`.
 *
 * 1. Each budget's spending for the month, from the one matrix query.
 * 2. Every threshold met is claimed in one `insert … on conflict do nothing
 *    returning` — so of two checks racing over the same crossing exactly one
 *    gets the row, and a crossing alerts once a month however many writes
 *    follow it.
 * 3. Per budget, only the highest newly claimed threshold is told (50% → 120%
 *    in one write claims 80 and 100 and says 100). Budgets with email alerts
 *    off are claimed, not emailed.
 * 4. Recipients: the workspace's admins, and whoever set the budget if they can
 *    still see it. One email per person per month, listing every budget it's
 *    about.
 * 5. Each email counts against the writer's hourly email allowance
 *    (`email-quota.ts`); once that's spent, the rest are skipped and logged.
 *    The claims stay, and the app still shows the alert.
 */
export async function checkBudgetAlerts(input: {
  workspaceId: string;
  userId: string;
  months: readonly string[];
}): Promise<BudgetCheckResult> {
  const { workspaceId, userId, months } = input;
  const rows = await loadWorkspaceBudgets(workspaceId);
  if (rows.length === 0 || months.length === 0) return NONE;

  const crossings: Crossing[] = [];
  for (const month of months) {
    const matrix = await getMonthExpenseMatrix(workspaceId, month);
    for (const budget of rows) {
      const spentMinor = spentFor(budget, matrix);
      for (const threshold of thresholdsMet(spentMinor, budget.amountMinor)) {
        crossings.push({ budget, month, threshold, spentMinor });
      }
    }
  }
  if (crossings.length === 0) return NONE;

  const db = getDb();
  const claimed = await db
    .insert(budgetAlerts)
    .values(
      crossings.map((c) => ({
        budgetId: c.budget.id,
        month: monthBounds(c.month).first,
        threshold: c.threshold,
      })),
    )
    .onConflictDoNothing()
    .returning({ budgetId: budgetAlerts.budgetId, month: budgetAlerts.month, threshold: budgetAlerts.threshold });
  if (claimed.length === 0) return NONE;

  logger.info(`Claimed ${claimed.length} budget alert${claimed.length === 1 ? "" : "s"}`, {
    event: "budget.alert_claimed",
    workspaceId,
    alerts: claimed.map((c) => ({ budgetId: c.budgetId, month: c.month, threshold: c.threshold })),
  });

  // The highest threshold newly claimed, per budget and month.
  const key = (budgetId: string, month: string) => `${budgetId}|${month}`;
  const won = new Set(claimed.map((c) => `${key(c.budgetId, monthKeyOf(c.month))}|${c.threshold}`));
  const newest = new Map<string, Crossing>();
  for (const c of crossings) {
    if (!won.has(`${key(c.budget.id, c.month)}|${c.threshold}`)) continue;
    const k = key(c.budget.id, c.month);
    const prev = newest.get(k);
    if (!prev || c.threshold > prev.threshold) newest.set(k, c);
  }
  const toTell = [...newest.values()].filter((c) => c.budget.emailAlerts);
  if (toTell.length === 0) return { claimed: claimed.length, emailed: 0 };

  const emailed = await emailCrossings(workspaceId, userId, toTell);
  return { claimed: claimed.length, emailed };
}

type Recipient = { userId: string; email: string; reason: "admin" | "creator"; crossings: Crossing[] };

/**
 * Who hears about which crossing: every admin about all of them, and each
 * budget's creator about their own — while they can still see it (someone
 * removed from the workspace, or narrowed out of a profile it covers, gets
 * nothing). Only accounts with an email address.
 */
async function recipientsFor(workspaceId: string, crossings: Crossing[]): Promise<Recipient[]> {
  const db = getDb();
  const admins = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "admin")));
  const adminIds = new Set(admins.map((a) => a.userId));

  const byUser = new Map<string, { reason: "admin" | "creator"; crossings: Crossing[] }>();
  for (const id of adminIds) byUser.set(id, { reason: "admin", crossings: [...crossings] });

  const creators = [...new Set(crossings.map((c) => c.budget.createdBy))].filter(
    (id) => !adminIds.has(id),
  );
  for (const creatorId of creators) {
    const access = await budgetAccess(creatorId, workspaceId);
    const theirs = crossings.filter(
      (c) => c.budget.createdBy === creatorId && canSeeBudget(c.budget, access),
    );
    if (theirs.length > 0) byUser.set(creatorId, { reason: "creator", crossings: theirs });
  }
  if (byUser.size === 0) return [];

  const people = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, [...byUser.keys()]));
  const out: Recipient[] = [];
  for (const person of people) {
    const entry = byUser.get(person.id);
    if (!entry || !person.email) continue;
    out.push({ userId: person.id, email: person.email, ...entry });
  }
  return out.sort((a, b) => a.userId.localeCompare(b.userId));
}

async function emailCrossings(
  workspaceId: string,
  senderId: string,
  crossings: Crossing[],
): Promise<number> {
  const db = getDb();
  const [workspace, recipients] = await Promise.all([
    db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
      columns: { name: true, currency: true, locale: true },
    }),
    recipientsFor(workspaceId, crossings),
  ]);
  if (!workspace || recipients.length === 0) return 0;

  const href = siteUrl(openWorkspacePath(workspaceId, "/app/budgets"));
  let emailed = 0;
  for (const person of recipients) {
    const months = [...new Set(person.crossings.map((c) => c.month))].sort();
    for (const month of months) {
      const items: BudgetAlertItem[] = person.crossings
        .filter((c) => c.month === month)
        .map((c) => ({
          label: labelOf(c.budget),
          spentMinor: c.spentMinor,
          amountMinor: c.budget.amountMinor,
          threshold: c.threshold,
        }));
      try {
        await assertEmailSendAllowed(senderId, "budget_alert");
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          logger.warn("Budget alert emails stopped — the writer's hourly email allowance is used up", {
            event: "budget.alert_email_skipped",
            workspaceId,
            sent: emailed,
          });
          return emailed;
        }
        throw err;
      }
      sendEmail({
        to: person.email,
        ...budgetAlertEmail({
          workspaceName: workspace.name,
          monthLabel: monthName(month),
          items,
          money: { currency: workspace.currency, locale: workspace.locale },
          href,
          reason: person.reason,
        }),
      });
      emailed++;
      logger.info(`Budget alert email queued for ${redactEmail(person.email)}`, {
        event: "budget.alert_email_queued",
        workspaceId,
        recipientId: person.userId,
        budgets: items.length,
      });
    }
  }
  return emailed;
}
