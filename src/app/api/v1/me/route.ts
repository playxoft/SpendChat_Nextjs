import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { serializeSettings } from "@/lib/api-serializers";

export const dynamic = "force-dynamic";

/** GET /api/v1/me — the authenticated user and their settings. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, settings, workspace } = await getApiContext(request);
    return apiOk({
      user: { id: user.id, email: user.email, name: user.name },
      settings: serializeSettings(settings),
      workspace: { id: workspace.id, name: workspace.name, role: workspace.role },
    });
  });
}
