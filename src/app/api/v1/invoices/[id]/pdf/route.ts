import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { handle } from "@/lib/api-response";
import { contentDisposition } from "@/lib/files";
import { getInvoicePdf } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/invoices/:id/pdf — the document as a PDF (`application/pdf`
 * bytes, not JSON): the copy stored when it was finalised, or a draft drawn on
 * the spot. Errors are the usual JSON envelope.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const { id } = await ctx.params;
    const pdf = await getInvoicePdf(user.id, workspace.id, id);
    return new Response(pdf.bytes.slice().buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(pdf.bytes.byteLength),
        "content-disposition": contentDisposition(pdf.fileName, new URL(request.url).searchParams.get("download") !== "1"),
        "cache-control": "private, no-store",
      },
    });
  });
}
