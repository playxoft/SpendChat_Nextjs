import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeTransaction } from "@/lib/api-serializers";
import { currencyMeta, parsePagination } from "@/lib/api-query";
import { parseTxnFilters } from "@/lib/filters";
import { listTransactions, countTransactions } from "@/lib/queries";
import { createTransaction } from "@/services/transactions";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/transactions — the caller's transactions, newest first.
 * Filters: type, category, profile, from, to, q. Paginated with limit/offset.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const url = new URL(request.url);
    const filters = parseTxnFilters((k) => url.searchParams.get(k));
    const { limit, offset } = parsePagination(url.searchParams);

    const [rows, total] = await Promise.all([
      listTransactions(user.id, workspace.id, { ...filters, limit, offset }),
      countTransactions(user.id, workspace.id, filters),
    ]);

    return apiOk(
      rows.map((r) => serializeTransaction(r, workspace.currency)),
      200,
      { total, limit, offset, ...currencyMeta(workspace.currency) },
    );
  });
}

/** POST /api/v1/transactions — create a transaction. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const body = await readJson(request);
    // Currency/locale come from the workspace we already resolved — no re-select.
    const created = await createTransaction(user.id, workspace.id, body, {
      currency: workspace.currency,
      locale: workspace.locale,
    });
    return apiOk(serializeTransaction(created, workspace.currency), 201);
  });
}
