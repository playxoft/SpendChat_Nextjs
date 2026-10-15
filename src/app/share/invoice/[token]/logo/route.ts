import type { NextRequest } from "next/server";
import { readObject } from "@/lib/r2";
import { withRequestContext } from "@/lib/request-context";
import { getSharedInvoiceLogo } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** The seller's logo on a shared invoice — no session; the token is the authorization. */
export async function GET(_request: NextRequest, ctx: Ctx) {
  return withRequestContext("web", async () => {
    const { token } = await ctx.params;
    const logo = await getSharedInvoiceLogo(token);
    const bytes = logo ? await readObject(logo.key).catch(() => null) : null;
    if (!logo || !bytes) return new Response(null, { status: 404 });
    return new Response(bytes.slice().buffer as ArrayBuffer, {
      headers: {
        "content-type": logo.contentType,
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex",
      },
    });
  });
}
