import type { NextRequest } from "next/server";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/auth";
import { setLogContext } from "@/lib/log-context";
import { withRequestContext } from "@/lib/request-context";
import { ApiError } from "@/lib/errors";
import { describeError, logger } from "@/lib/logger";
import { isR2Configured } from "@/lib/r2";
import { createAttachments, type AttachmentUpload } from "@/services/attachments";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_PER_TRANSACTION } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Upload one or more files (receipts / bills / invoices) to a transaction. Not
 * part of the versioned mobile API (`/api/v1`), so no OpenAPI contract. Mirrors
 * the avatar route's cookie-session + CSRF pattern; RBAC (editor on the
 * transaction's profile), type/size/count validation, R2 upload and the DB rows
 * all live in `src/services/attachments.ts`.
 *
 * Request: multipart form data, files under field `files` (or `file`).
 * Response: `{ attachments: AttachmentDTO[] }` or `{ error }`.
 */

/**
 * CSRF guard: a cookie-authenticated mutation must reject cross-site callers
 * (Next server actions get this for free; route handlers don't). Identical to
 * the avatar route.
 */
function isCrossSite(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.headers.get("host");
  } catch {
    return true;
  }
}

/** Map a thrown value to a `{ error }` response, preserving an ApiError's status. */
function fail(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  logger.error(`Attachment upload failed: ${describeError(err)}`, {
    event: "attachment.upload_failed",
    error: err instanceof Error ? err : String(err),
  });
  return Response.json({ error: "Upload failed. Please try again." }, { status: 502 });
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  return withRequestContext("web", async () => {
    if (isCrossSite(request)) {
      return Response.json({ error: "Cross-site request rejected" }, { status: 403 });
    }
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    setLogContext({ userId: user.id });

    if (!isR2Configured()) {
      return Response.json(
        { error: "File uploads aren't configured on this server." },
        { status: 503 },
      );
    }

    const { id } = await ctx.params;

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "Invalid upload." }, { status: 400 });
    }

    const files = [...form.getAll("files"), ...form.getAll("file")].filter(
      (v): v is File => v instanceof File,
    );
    if (files.length === 0) {
      return Response.json({ error: "No files were provided." }, { status: 400 });
    }
    if (files.length > ATTACHMENT_MAX_PER_TRANSACTION) {
      return Response.json(
        { error: `You can attach at most ${ATTACHMENT_MAX_PER_TRANSACTION} files at once.` },
        { status: 400 },
      );
    }
    // Reject oversized files by their known size before reading them into memory.
    for (const f of files) {
      if (f.size > ATTACHMENT_MAX_BYTES) {
        return Response.json({ error: "Each file must be 5 MB or smaller." }, { status: 413 });
      }
    }

    try {
      const workspace = await getCurrentWorkspace(user.id);
      setLogContext({ workspaceId: workspace.id });
      const uploads: AttachmentUpload[] = await Promise.all(
        files.map(async (f, i) => {
          // A client-generated preview rides along under `thumb_<index>`.
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
      return Response.json({ attachments });
    } catch (err) {
      return fail(err);
    }
  });
}
