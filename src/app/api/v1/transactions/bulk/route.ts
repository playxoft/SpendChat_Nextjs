import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { createManyTransactions } from "@/services/transactions";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/transactions/bulk — insert up to 500 transactions at once.
 * Body: { "items": [ <transaction>, ... ] } (categories referenced by id).
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const body = await readJson(request);
    const result = await createManyTransactions(user.id, body);
    return apiOk(result, 201);
  });
}
