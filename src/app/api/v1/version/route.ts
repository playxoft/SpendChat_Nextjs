import { apiOk, handle } from "@/lib/api-response";
import { getVersionInfo } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/version — what's deployed: app release, `/api/v1` contract
 * version, environment, and the deployed Worker build.
 *
 * **The one unauthenticated `/api/v1` endpoint.** A client has to be able to
 * check the contract version *before* it has a token (and while showing an
 * "update required" screen), so requiring a bearer token here would defeat the
 * purpose. It reads nothing per-user and touches no database, so there's
 * nothing to scope to a caller — see `src/lib/version.ts` for what the payload
 * deliberately leaves out.
 *
 * Not cached (`Cache-Control: no-store`, like every other JSON endpoint): a
 * client polls this to notice a new deploy, and a cached answer would hide one.
 */
export async function GET() {
  return handle(async () => apiOk(getVersionInfo()));
}
