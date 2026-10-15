import type { NextRequest } from "next/server";
import { contentDisposition } from "@/lib/files";
import { describeError, logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/request-context";
import { getSharedInvoicePdf } from "@/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * The PDF behind an invoice share link — no session; the token is the whole
 * authorization (checked again here). One generic 404 for every failure.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  return withRequestContext("web", async () => {
    const { token } = await ctx.params;
    try {
      const pdf = await getSharedInvoicePdf(token);
      if (!pdf) return Response.json({ error: "Not found" }, { status: 404 });
      const download = new URL(request.url).searchParams.get("download") === "1";
      return new Response(pdf.bytes.slice().buffer as ArrayBuffer, {
        headers: {
          "content-type": "application/pdf",
          "content-length": String(pdf.bytes.byteLength),
          "content-disposition": contentDisposition(pdf.fileName, !download),
          "cache-control": "private, no-store",
          "x-robots-tag": "noindex",
        },
      });
    } catch (err) {
      logger.error(`Shared invoice PDF failed: ${describeError(err)}`, { event: "invoice.shared_pdf_failed", error: err });
      return Response.json({ error: "Couldn't load the PDF. Try again." }, { status: 500 });
    }
  });
}
