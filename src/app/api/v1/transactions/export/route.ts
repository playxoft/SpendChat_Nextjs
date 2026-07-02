import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { handle } from "@/lib/api-response";
import { parseTxnFilters } from "@/lib/filters";
import { listTransactions } from "@/lib/queries";
import { transactionsToCsv } from "@/lib/transactions-csv";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/transactions/export — CSV of the caller's transactions (same
 * filters as the list endpoint). Returns `text/csv`, not the JSON envelope.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, settings } = await getApiContext(request);
    const url = new URL(request.url);
    const filters = parseTxnFilters((k) => url.searchParams.get(k));
    const rows = await listTransactions(user.id, { ...filters, limit: 5000, offset: 0 });
    const csv = transactionsToCsv(rows, settings.currency);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="spendchat-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
