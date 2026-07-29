import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { ApiError, badRequest } from "@/lib/errors";
import { isR2Configured } from "@/lib/r2";
import { createAttachments, type AttachmentUpload } from "@/services/attachments";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_PER_TRANSACTION } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/transactions/:id/attachments — attach files (receipts / bills /
 * invoices) to a transaction. Bearer-auth twin of the web upload route; RBAC
 * (editor on the transaction's profile), type/size/count validation, the R2
 * upload and the DB rows all live in `src/services/attachments.ts`.
 *
 * Request: multipart form data, files under `files` (or `file`). An optional
 * client-generated preview for image files rides along under `thumb_<index>`
 * (webp; shown as the tile thumbnail so the list never pulls full originals).
 * Response: `data: Attachment[]` — the created rows, which also appear embedded
 * on the transaction (`Transaction.attachments`) from then on.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    if (!isR2Configured()) {
      throw new ApiError(503, "storage_unavailable", "File uploads aren't configured on this server.");
    }
    const { id } = await ctx.params;

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw badRequest("Send the files as multipart form data");
    }

    const files = [...form.getAll("files"), ...form.getAll("file")].filter(
      (v): v is File => v instanceof File,
    );
    if (files.length === 0) throw badRequest("No files were provided.");
    if (files.length > ATTACHMENT_MAX_PER_TRANSACTION) {
      throw badRequest(`You can attach at most ${ATTACHMENT_MAX_PER_TRANSACTION} files at once.`);
    }
    // Reject oversized files by their known size before reading them into memory.
    for (const f of files) {
      if (f.size > ATTACHMENT_MAX_BYTES) {
        throw new ApiError(413, "payload_too_large", "Each file must be 5 MB or smaller.");
      }
    }

    const uploads: AttachmentUpload[] = await Promise.all(
      files.map(async (f, i) => {
        const thumb = form.get(`thumb_${i}`);
        const thumbnail =
          thumb instanceof File && thumb.size > 0
            ? { bytes: await thumb.arrayBuffer(), contentType: thumb.type || "image/webp" }
            : undefined;
        return {
          fileName: f.name,
          contentType: f.type || null,
          bytes: await f.arrayBuffer(),
          size: f.size,
          thumbnail,
        };
      }),
    );
    const attachments = await createAttachments(user.id, workspace.id, id, uploads);
    return apiOk(attachments, 201);
  });
}
