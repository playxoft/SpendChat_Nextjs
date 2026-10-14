import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { createSeller, listSellers } from "@/services/invoices";

export const dynamic = "force-dynamic";

/** GET /api/v1/invoice-sellers?profileId= — saved business details ("from") the caller can read. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const profileId = new URL(request.url).searchParams.get("profileId");
    return apiOk(await listSellers(user.id, workspace.id, profileId));
  });
}

/**
 * POST /api/v1/invoice-sellers — `{ profileId, name, address?, contact?, taxId?, upiId? }`.
 * 403 `plan_limit` (`limit: "invoiceSellers"`) past the tier's sets (one on the free tier).
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    return apiOk(await createSeller(user.id, workspace.id, await readJson(request)), 201);
  });
}
