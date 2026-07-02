import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeCategory } from "@/lib/api-serializers";
import { listCategories, createCategory } from "@/services/categories";

export const dynamic = "force-dynamic";

/** GET /api/v1/categories — the caller's categories (income first, then name). */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const rows = await listCategories(user.id);
    return apiOk(rows.map(serializeCategory));
  });
}

/** POST /api/v1/categories — create a category. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const body = await readJson(request);
    const created = await createCategory(user.id, body);
    return apiOk(serializeCategory(created), 201);
  });
}
