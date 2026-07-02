import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { validationError } from "@/lib/errors";
import { currencyMeta } from "@/lib/api-query";
import { parseActiveProfile } from "@/lib/filters";
import { getMonthlyTrend, type MonthlyPoint } from "@/lib/queries";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/v1/analytics/monthly?from=YYYY-MM-DD&profile=<id> — income vs expense
 * per calendar month from `from` onward (minor units). `profile` is optional.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, settings } = await getApiContext(request);
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    if (!from || !DATE_RE.test(from)) {
      throw validationError("Query param `from` must be a YYYY-MM-DD date");
    }
    const profileId = parseActiveProfile(url.searchParams.get("profile"));
    const rows = await getMonthlyTrend(user.id, from, profileId);

    // Collapse the (month, type) rows into one point per month.
    const byMonth = new Map<string, MonthlyPoint>();
    for (const r of rows) {
      const point = byMonth.get(r.month) ?? { month: r.month, income: 0, expense: 0 };
      point[r.type] = r.total;
      byMonth.set(r.month, point);
    }
    const points = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
    return apiOk(points, 200, currencyMeta(settings.currency));
  });
}
