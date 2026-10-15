import type { NextRequest } from "next/server";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/auth";
import { setLogContext } from "@/lib/log-context";
import { rateLimitedResponse } from "@/lib/rate-limit";
import { readObject } from "@/lib/r2";
import { withRequestContext } from "@/lib/request-context";
import { getSellerLogo } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * A seller's logo for the web app's editor and preview (cookie session;
 * viewer on its profile). Proxied same-origin so the paper can draw it; the
 * URL carries the logo's version, so a changed logo is a new URL.
 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  return withRequestContext("web", async () => {
    const user = await getCurrentUser();
    if (!user) return new Response(null, { status: 401 });
    setLogContext({ userId: user.id });
    const workspace = await getCurrentWorkspace(user.id);
    const limited = await rateLimitedResponse(user.id, "read", () => workspace.plan);
    if (limited) return limited;
    const { id } = await ctx.params;
    const logo = await getSellerLogo(user.id, workspace.id, id);
    const bytes = logo ? await readObject(logo.key).catch(() => null) : null;
    if (!logo || !bytes) return new Response(null, { status: 404 });
    return new Response(bytes.slice().buffer as ArrayBuffer, {
      headers: {
        "content-type": logo.contentType,
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
