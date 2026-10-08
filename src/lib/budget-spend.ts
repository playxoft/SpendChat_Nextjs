import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles, transactions } from "@/db/schema";
import { monthBounds, type SpendCell } from "@/lib/budgets";
import { notTrashed } from "@/lib/trash-scope";

/**
 * A month's expenses in a workspace, grouped by profile × category — the one
 * query every budget number comes from. The budgets page, the analytics card,
 * the nav badge, the API and the alert emails all read this and work out each
 * budget's total with `spentFor` (`lib/budgets.ts`), so a rule about which
 * transactions count lives in exactly one `where`:
 *
 *  - **every live profile of the workspace** — a budget's number is the same
 *    for everyone who can see it; who may see it is `canSeeBudget`'s job;
 *  - **expenses only** — income never offsets spending;
 *  - **the calendar month of `occurred_on`**, the transaction's own date.
 *
 *  - **nothing in the trash** — neither a trashed transaction nor anything in
 *   a trashed profile (`notTrashed`, here and nowhere else).
 *
 * `profile_id in (…)` with the month range lets the planner walk
 * `transactions_profile_date_idx` once per profile, the way the feed does.
 */
export async function getMonthExpenseMatrix(
  workspaceId: string,
  monthKey: string,
  db: Pick<ReturnType<typeof getDb>, "select"> = getDb(),
): Promise<SpendCell[]> {
  const { first, last } = monthBounds(monthKey);
  const rows = await db
    .select({
      profileId: transactions.profileId,
      categoryId: transactions.categoryId,
      total: sql<string>`sum(${transactions.amountMinor})::text`,
    })
    .from(transactions)
    .where(
      and(
        notTrashed(transactions),
        inArray(
          transactions.profileId,
          db
            .select({ id: profiles.id })
            .from(profiles)
            .where(and(eq(profiles.workspaceId, workspaceId), notTrashed(profiles))),
        ),
        eq(transactions.type, "expense"),
        gte(transactions.occurredOn, first),
        lte(transactions.occurredOn, last),
      ),
    )
    .groupBy(transactions.profileId, transactions.categoryId);
  return rows.map((r) => ({
    profileId: r.profileId,
    categoryId: r.categoryId,
    totalMinor: Number(r.total),
  }));
}
