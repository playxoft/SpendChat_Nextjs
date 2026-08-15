import { apiOk, handle } from "@/lib/api-response";
import { getVersionInfo } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * GET /version — the root alias of `GET /api/v1/version`, for humans and uptime
 * checks (`curl https://spendchat.app/version`). Byte-for-byte the same
 * response, built from the same `getVersionInfo()`.
 *
 * It lives outside `/api/v1` on purpose: the version of the API is exactly what
 * you need when you don't yet know which API versions the server still serves.
 * Mobile clients should still call the documented `/api/v1/version`.
 */
export async function GET() {
  return handle(async () => apiOk(getVersionInfo()));
}
