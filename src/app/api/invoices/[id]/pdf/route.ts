import type { NextRequest } from "next/server";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { contentDisposition } from "@/lib/files";
import { setLogContext } from "@/lib/log-context";
import { describeError, logger } from "@/lib/logger";
import { rateLimitedResponse } from "@/lib/rate-limit";
import { withRequestContext } from "@/lib/request-context";
import { getInvoicePdf } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The web app's PDF of an invoice or quote (cookie session; viewer on its
 * profile in the current workspace). Inline for the in-app preview,
 * `?download=1` to save it. The mobile app uses `/api/v1/invoices/:id/pdf`.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return withRequestContext("web", async () => {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    setLogContext({ userId: user.id });
    const workspace = await getCurrentWorkspace(user.id);
    setLogContext({ workspaceId: workspace.id });
    const limited = await rateLimitedResponse(user.id, "read", () => workspace.plan);
    if (limited) return limited;

    const { id } = await ctx.params;
    try {
      const pdf = await getInvoicePdf(user.id, workspace.id, id);
      const download = new URL(request.url).searchParams.get("download") === "1";
      return new Response(pdf.bytes.slice().buffer as ArrayBuffer, {
        headers: {
          "content-type": "application/pdf",
          "content-length": String(pdf.bytes.byteLength),
          "content-disposition": contentDisposition(pdf.fileName, !download),
          "cache-control": "private, no-store",
        },
      });
    } catch (err) {
      if (err instanceof ApiError) return Response.json({ error: err.message }, { status: err.status });
      logger.error(`Invoice PDF failed: ${describeError(err)}`, { event: "invoice.pdf_failed", error: err });
      return Response.json({ error: "Couldn't make the PDF. Try again." }, { status: 500 });
    }
  });
}
