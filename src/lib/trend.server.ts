import "server-only";
import { getDailyTotals, getMonthlyTotals } from "@/lib/queries";
import { monthStart } from "@/lib/insights";
import { bucketFor, buildTrend, needsDaily, trendSpan, type Trend, type TrendSpan } from "@/lib/trend";

/**
 * The analytics trend for the caller: income and expenses over the page's
 * range (never less than a month), in day, week, month or year columns. Reads
 * go through `getDailyTotals` / `getMonthlyTotals`, so they carry the feed's
 * access scoping and trash rule. "All time" starts at the first month with
 * any entry. `kept` (Plus and Pro) adds what was kept and the savings rate.
 */
export async function getTrend(
  userId: string,
  workspaceId: string,
  opts: {
    from?: string;
    to?: string;
    profileId?: string;
    /** The sidebar's selection, intersected with what the caller can view
     *  (`TxnFilters.profileIds`). */
    profileIds?: string[];
    /** The viewer's local date, for "All time". */
    today: string;
    firstDay: 0 | 1;
    kept: boolean;
  },
): Promise<Trend> {
  const { profileId, profileIds, firstDay, kept } = opts;
  let span: TrendSpan;
  let monthly: Awaited<ReturnType<typeof getMonthlyTotals>> | undefined;
  if (opts.from && opts.to) {
    span = trendSpan(opts.from, opts.to);
  } else {
    // All time: every month there is, which also serves month and year columns.
    monthly = await getMonthlyTotals(userId, workspaceId, { profileId, profileIds, to: opts.today });
    const first = monthly[0]?.month ?? opts.today.slice(0, 7);
    span = trendSpan(monthStart(first), opts.today);
  }

  const range = { from: span.from, to: span.to, profileId, profileIds };
  if (needsDaily(bucketFor(span))) {
    return buildTrend({ span, firstDay, kept, daily: await getDailyTotals(userId, workspaceId, range) });
  }
  return buildTrend({
    span,
    firstDay,
    kept,
    monthly: monthly ?? (await getMonthlyTotals(userId, workspaceId, range)),
  });
}
