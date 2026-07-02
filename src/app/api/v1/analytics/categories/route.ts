import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { validationError } from "@/lib/errors";
import { currencyMeta } from "@/lib/api-query";
import { parseTxnFilters } from "@/lib/filters";
import { getCategoryBreakdown } from "@/lib/queries";
import { txnTypeSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/analytics/categories?type=expense — spend/earn totals grouped by
 * category (minor units, largest first). `type` (income|expense) is required;
 * the usual filters (profile, from, to, q) also apply.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, settings } = await getApiContext(request);
    const url = new URL(request.url);
    const parsedType = txnTypeSchema.safeParse(url.searchParams.get("type"));
    if (!parsedType.success) {
      throw validationError("Query param `type` must be 'income' or 'expense'");
    }
    const filters = parseTxnFilters((k) => url.searchParams.get(k));
    const rows = await getCategoryBreakdown(user.id, parsedType.data, filters);
    return apiOk(rows, 200, currencyMeta(settings.currency));
  });
}
