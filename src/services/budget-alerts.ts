import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetAlerts, budgets, users, workspaceMembers, workspaces } from "@/db/schema";
import { getMonthExpenseMatrix } from "@/lib/budget-spend";
import {
  canManageBudget,
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
import { budgetAlertEmailsLeft, recordBudgetAlertEmails } from "@/lib/email-quota";
import { budgetAlertEmail, siteUrl, type BudgetAlertItem } from "@/lib/email-templates";
import { openWorkspacePath } from "@/lib/invite-links";
import { logger } from "@/lib/logger";
import { budgetAccess, labelOf, loadWorkspaceBudgets, type BudgetRow } from "@/services/budgets";

/**
 * Budget alerts at 80% and 100% — by email, once per budget, per threshold, per
 * month (and again only if the budget's amount is raised past the one it fired
 * at). In-app alerts need none of this: the app computes them live from the
 * month's spending on every render.
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
  /** Whose write triggered it (for the logs). */
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
  /** Alert rows this check claimed or re-armed (budget × month × threshold). */
  claimed: number;
  /** Emails handed to the mailer. */
  emailed: number;
};

const NONE: BudgetCheckResult = { claimed: 0, emailed: 0 };

type Crossing = { budget: BudgetRow; month: string; threshold: BudgetThreshold; spentMinor: number };
type ClaimKey = { budgetId: string; month: string; threshold: number };

/** A claim's identity; `month` may be "YYYY-MM" or the stored "YYYY-MM-01". */
const keyOf = (k: ClaimKey) => `${k.budgetId}|${k.month.slice(0, 7)}|${k.threshold}`;

/**
 * Claim and email every alert the workspace's budgets have reached in `months`.
 *
 * 1. **Claim.** Each budget's spending for the month comes from the one matrix
 *    query; every threshold met is claimed with `insert … on conflict … do
 *    update … where excluded.amount_minor > budget_alerts.amount_minor
 *    returning`. A new crossing gets a row; one that already fired this month
 *    fires again only for a *higher* amount than it fired at — so lowering and
 *    raising an amount, or re-saving an expense, re-sends nothing. Rows are
 *    never deleted while the budget lives. Values go in key order, so two
 *    checks lock conflicting rows in the same order.
 * 2. **Owe.** Every claim of these months still unsent (`notified_at` null) —
 *    this check's and any an earlier check couldn't send — is owed an email if
 *    its budget still has email alerts on and still meets the threshold. Per
 *    budget only the highest threshold is told (50% → 120% in one write says
 *    100%).
 * 3. **Recipients:** the workspace's admins, and the budget's creator while
 *    they can still manage it (a creator who can only read couldn't switch the
 *    emails off, so they don't get them). One email per person per month.
 * 4. **Lock, reserve and mark, in one transaction.** The unsent claims are
 *    locked (`for update`, in key order — a racing check waits, then finds
 *    them sent), then the workspace's own monthly alert pool
 *    (`budgetAlertEmailsLeft`, never the writer's) is filled claim by claim —
 *    whole claims only, 100% before 80%, oldest first — up to what's left. Only
 *    the claims that fit (and those owed nothing) are marked sent; the rest
 *    stay unsent for the next check, after the pool refills on the 1st. A
 *    failure before the commit leaves every claim unsent the same way.
 * 5. **Send** (`sendEmail`, deferred and logged like every email). A send that
 *    fails after the commit is logged, not retried — the alert still shows in
 *    the app.
 */
export async function checkBudgetAlerts(input: {
  workspaceId: string;
  userId: string;
  months: readonly string[];
  now?: Date;
}): Promise<BudgetCheckResult> {
  const { workspaceId, months, now = new Date() } = input;
  const rows = await loadWorkspaceBudgets(workspaceId);
  if (rows.length === 0 || months.length === 0) return NONE;
  const db = getDb();

  // 1. Claim new crossings, or re-arm ones whose amount went up.
  const spent = new Map<string, number>(); // `${budgetId}|${month}`
  const crossings: Crossing[] = [];
  for (const month of months) {
    const matrix = await getMonthExpenseMatrix(workspaceId, month);
    for (const budget of rows) {
      const spentMinor = spentFor(budget, matrix);
      spent.set(`${budget.id}|${month}`, spentMinor);
      for (const threshold of thresholdsMet(spentMinor, budget.amountMinor)) {
        crossings.push({ budget, month, threshold, spentMinor });
      }
    }
  }
  let claimed = 0;
  if (crossings.length > 0) {
    const values = crossings
      .map((c) => ({
        budgetId: c.budget.id,
        month: monthBounds(c.month).first,
        threshold: c.threshold,
        amountMinor: c.budget.amountMinor,
      }))
      .sort(byKey);
    const won = await db
      .insert(budgetAlerts)
      .values(values)
      .onConflictDoUpdate({
        target: [budgetAlerts.budgetId, budgetAlerts.month, budgetAlerts.threshold],
        set: { amountMinor: sql`excluded.amount_minor`, notifiedAt: null, createdAt: sql`now()` },
        where: sql`excluded.amount_minor > ${budgetAlerts.amountMinor}`,
      })
      .returning({
        budgetId: budgetAlerts.budgetId,
        month: budgetAlerts.month,
        threshold: budgetAlerts.threshold,
      });
    claimed = won.length;
    if (claimed > 0) {
      logger.info(`Claimed ${claimed} budget alert${claimed === 1 ? "" : "s"}`, {
        event: "budget.alert_claimed",
        workspaceId,
        alerts: won,
      });
    }
  }

  // 2. Everything still unsent for these months, and what of it is owed.
  const pending = await db
    .select({
      budgetId: budgetAlerts.budgetId,
      month: budgetAlerts.month,
      threshold: budgetAlerts.threshold,
      createdAt: budgetAlerts.createdAt,
    })
    .from(budgetAlerts)
    .innerJoin(budgets, eq(budgets.id, budgetAlerts.budgetId))
    .where(
      and(
        eq(budgets.workspaceId, workspaceId),
        inArray(
          budgetAlerts.month,
          months.map((m) => monthBounds(m).first),
        ),
        isNull(budgetAlerts.notifiedAt),
      ),
    );
  // A budget added after this check loaded the list is the next check's to tell.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const known = pending.filter((p) => byId.has(p.budgetId));
  if (known.length === 0) return { claimed, emailed: 0 };

  const highest = new Map<string, Owed>(); // `${budgetId}|${month}`
  for (const p of known) {
    const budget = byId.get(p.budgetId)!;
    const month = monthKeyOf(p.month);
    const spentMinor = spent.get(`${budget.id}|${month}`) ?? 0;
    const threshold = p.threshold as BudgetThreshold;
    // Emails off, or no longer true (an expense deleted, the amount raised):
    // marked sent below with nothing to say.
    if (!budget.emailAlerts || !thresholdsMet(spentMinor, budget.amountMinor).includes(threshold)) {
      continue;
    }
    const k = `${budget.id}|${month}`;
    const prev = highest.get(k);
    if (!prev || threshold > prev.threshold) {
      highest.set(k, { budget, month, threshold, spentMinor, claimedAt: p.createdAt });
    }
  }
  // The order the pool is filled in: 100% before 80%, then oldest first.
  const owed = [...highest.values()].sort(
    (a, b) =>
      b.threshold - a.threshold ||
      a.claimedAt.getTime() - b.claimedAt.getTime() ||
      keyOf({ budgetId: a.budget.id, month: a.month, threshold: a.threshold }).localeCompare(
        keyOf({ budgetId: b.budget.id, month: b.month, threshold: b.threshold }),
      ),
  );

  // 3. Who would hear about each owed crossing.
  const recipients = owed.length > 0 ? await recipientsFor(workspaceId, owed) : [];
  const audience = new Map<Owed, Recipient[]>(
    owed.map((c) => [c, recipients.filter((r) => r.crossings.includes(c))]),
  );

  // 4. Lock the unsent claims, fill the pool claim by claim, mark what fits.
  const tuples = (list: ClaimKey[]) =>
    sql.join(
      list.map((p) => sql`(${p.budgetId}::uuid, ${p.month}::date, ${p.threshold}::smallint)`),
      sql`, `,
    );
  const { chosen, waiting } = await db.transaction(async (tx) => {
    const locked = await tx
      .select({
        budgetId: budgetAlerts.budgetId,
        month: budgetAlerts.month,
        threshold: budgetAlerts.threshold,
      })
      .from(budgetAlerts)
      .where(
        and(
          isNull(budgetAlerts.notifiedAt),
          sql`(${budgetAlerts.budgetId}, ${budgetAlerts.month}, ${budgetAlerts.threshold}) in (${tuples(known)})`,
        ),
      )
      .orderBy(asc(budgetAlerts.budgetId), asc(budgetAlerts.month), asc(budgetAlerts.threshold))
      .for("update");
    if (locked.length === 0) return { chosen: [] as Owed[], waiting: 0 };
    // A racing check may have sent some first: this one tells only what it locked.
    const mine = new Set(locked.map(keyOf));

    const left = await budgetAlertEmailsLeft(tx, workspaceId, now);
    const emails = new Set<string>(); // `${userId}|${month}` — one email each
    const chosen: Owed[] = [];
    const held = new Set<string>(); // `${budgetId}|${month}` owed but not sent
    for (const c of owed) {
      if (!mine.has(keyOf({ budgetId: c.budget.id, month: c.month, threshold: c.threshold }))) continue;
      const adds = audience
        .get(c)!
        .map((r) => `${r.userId}|${c.month}`)
        .filter((e) => !emails.has(e));
      if (emails.size + adds.length > left) {
        held.add(`${c.budget.id}|${c.month}`);
        continue;
      }
      for (const e of adds) emails.add(e);
      chosen.push(c);
    }
    // Sent, or owed nothing — everything except what's held (and the lower
    // thresholds of a held budget, which it will cover when it goes).
    const done = locked.filter((l) => !held.has(`${l.budgetId}|${monthKeyOf(l.month)}`));
    if (done.length > 0) {
      await tx
        .update(budgetAlerts)
        .set({ notifiedAt: now })
        .where(
          sql`(${budgetAlerts.budgetId}, ${budgetAlerts.month}, ${budgetAlerts.threshold}) in (${tuples(done)})`,
        );
    }
    await recordBudgetAlertEmails(tx, workspaceId, emails.size);
    return { chosen, waiting: held.size };
  });
  if (waiting > 0) {
    logger.warn(
      `${waiting} budget alert${waiting === 1 ? " is" : "s are"} waiting because this workspace's monthly alert email allowance is used up`,
      { event: "budget.alert_email_capped", workspaceId, waiting },
    );
  }
  if (chosen.length === 0) return { claimed, emailed: 0 };

  // 5. Send — one email per person per month, listing what this check chose.
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { name: true, currency: true, locale: true },
  });
  if (!workspace) return { claimed, emailed: 0 };
  const href = siteUrl(openWorkspacePath(workspaceId, "/app/budgets"));
  let emailed = 0;
  for (const person of recipients) {
    const theirs = chosen.filter((c) => audience.get(c)!.includes(person));
    for (const month of [...new Set(theirs.map((c) => c.month))].sort()) {
      const items: BudgetAlertItem[] = theirs
        .filter((c) => c.month === month)
        .map((c) => ({
          label: labelOf(c.budget),
          spentMinor: c.spentMinor,
          amountMinor: c.budget.amountMinor,
          threshold: c.threshold,
        }));
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
  return { claimed, emailed };
}

/** Claim-key order (budget, month, threshold) — the order rows are locked in. */
function byKey(a: ClaimKey, b: ClaimKey): number {
  // Plain code-unit comparison: lowercase hex uuids and ISO dates sort the way
  // Postgres sorts the columns.
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return cmp(a.budgetId, b.budgetId) || cmp(a.month, b.month) || a.threshold - b.threshold;
}

type Owed = Crossing & { claimedAt: Date };

type Recipient = {
  userId: string;
  email: string;
  reason: "admin" | "creator";
  crossings: Owed[];
};

/**
 * Who hears about which crossing: every admin about all of them, and each
 * budget's creator about their own — only while they can still **manage** it.
 * Someone removed from the workspace, narrowed out of a profile it covers, or
 * down to read-only couldn't turn its emails off, so they stop getting them.
 * Only accounts with an email address.
 */
async function recipientsFor(workspaceId: string, crossings: Owed[]): Promise<Recipient[]> {
  const db = getDb();
  const admins = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "admin")));
  const adminIds = new Set(admins.map((a) => a.userId));

  const byUser = new Map<string, { reason: "admin" | "creator"; crossings: Owed[] }>();
  for (const id of adminIds) byUser.set(id, { reason: "admin", crossings: [...crossings] });

  const creators = [...new Set(crossings.map((c) => c.budget.createdBy))].filter(
    (id) => !adminIds.has(id),
  );
  for (const creatorId of creators) {
    const access = await budgetAccess(creatorId, workspaceId);
    const theirs = crossings.filter(
      (c) => c.budget.createdBy === creatorId && canManageBudget(c.budget, access),
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
