import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { deleteAllTransactions } from "@/services/settings";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/transactions/delete-all — danger zone. Wipes every transaction
 * for the caller. Body: { "confirm": "DELETE" } (exact string required).
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const body = (await readJson(request)) as { confirm?: string };
    const result = await deleteAllTransactions(user.id, body?.confirm ?? "");
    return apiOk(result);
  });
}
