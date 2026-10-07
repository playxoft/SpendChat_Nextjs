import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
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
 * Joined to the workspace's live profiles with the month range, the planner
 * walks `transactions_profile_date_idx` once per profile, the way the feed does.
 */
export async function getMonthExpenseMatrix(
  workspaceId: string,
  monthKey: string,
  db: Pick<ReturnType<typeof getDb>, "select"> = getDb(),
): Promise<SpendCell[]> {
  const { first, last } = monthBounds(monthKey);
  // Each profile's space is read as it is *now*: a space budget measures the
  // profiles in the space today, so moving a profile moves its month with it.
  const rows = await db
    .select({
      profileId: transactions.profileId,
      spaceId: profiles.spaceId,
      categoryId: transactions.categoryId,
      total: sql<string>`sum(${transactions.amountMinor})::text`,
    })
    .from(transactions)
    .innerJoin(profiles, eq(profiles.id, transactions.profileId))
    .where(
      and(
        notTrashed(transactions),
        eq(profiles.workspaceId, workspaceId),
        notTrashed(profiles),
        eq(transactions.type, "expense"),
        gte(transactions.occurredOn, first),
        lte(transactions.occurredOn, last),
      ),
    )
    .groupBy(transactions.profileId, profiles.spaceId, transactions.categoryId);
  return rows.map((r) => ({
    profileId: r.profileId,
    spaceId: r.spaceId,
    categoryId: r.categoryId,
    totalMinor: Number(r.total),
  }));
}
