import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeSettings } from "@/lib/api-serializers";
import { patchSettings } from "@/services/settings";

export const dynamic = "force-dynamic";

/** GET /api/v1/settings — the caller's settings. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { settings } = await getApiContext(request);
    return apiOk(serializeSettings(settings));
  });
}

/**
 * PATCH /api/v1/settings — partial update. Any subset of
 * { currency, locale, theme, inputMode }; at least one required.
 */
export async function PATCH(request: NextRequest) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const body = await readJson(request);
    const updated = await patchSettings(user.id, body);
    return apiOk(serializeSettings(updated));
  });
}
