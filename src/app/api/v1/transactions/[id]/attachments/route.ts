import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { ApiError, badRequest } from "@/lib/errors";
import { isR2Configured } from "@/lib/r2";
import { createAttachments } from "@/services/attachments";
import { parseUploadForm } from "@/lib/upload-form";
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

    const uploads = await parseUploadForm(form, {
      maxFiles: ATTACHMENT_MAX_PER_TRANSACTION,
      maxBytes: ATTACHMENT_MAX_BYTES,
      tooManyMessage: `You can attach at most ${ATTACHMENT_MAX_PER_TRANSACTION} files at once`,
    });
    const attachments = await createAttachments(user.id, workspace.id, id, uploads);
    return apiOk(attachments, 201);
  });
}
