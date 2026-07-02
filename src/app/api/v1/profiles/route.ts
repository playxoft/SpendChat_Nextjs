import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle, readJson } from "@/lib/api-response";
import { serializeProfile } from "@/lib/api-serializers";
import { listProfiles, createProfile } from "@/services/profiles";

export const dynamic = "force-dynamic";

/** GET /api/v1/profiles — the caller's profiles in sidebar order. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const rows = await listProfiles(user.id);
    return apiOk(rows.map(serializeProfile));
  });
}

/** POST /api/v1/profiles — create a profile (appended to the end). */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await getApiContext(request);
    const body = await readJson(request);
    const created = await createProfile(user.id, body);
    return apiOk(serializeProfile(created), 201);
  });
}
