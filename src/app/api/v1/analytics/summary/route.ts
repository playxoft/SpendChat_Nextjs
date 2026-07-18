import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { currencyMeta } from "@/lib/api-query";
import { parseTxnFilters } from "@/lib/filters";
import { getSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/analytics/summary — income, expense and balance for the current
 * filters (type, category, profile, from, to, q). All amounts are minor units;
 * `meta.currency` describes how to format them.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const url = new URL(request.url);
    const filters = parseTxnFilters((k) => url.searchParams.get(k));
    const summary = await getSummary(user.id, workspace.id, filters);
    return apiOk(summary, 200, currencyMeta(workspace.currency));
  });
}
