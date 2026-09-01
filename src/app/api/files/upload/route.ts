import type { NextRequest } from "next/server";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/auth";
import { setLogContext } from "@/lib/log-context";
import { withRequestContext } from "@/lib/request-context";
import { ApiError } from "@/lib/errors";
import { describeError, logger } from "@/lib/logger";
import { isR2Configured } from "@/lib/r2";
import { uploadVaultFiles } from "@/services/files";
import { assertUploadBodySize, parseUploadForm } from "@/lib/upload-form";
import { FILE_MAX_BYTES, FILE_MAX_PER_UPLOAD } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Upload files into the vault. Mirrors the transaction-attachments upload
 * route's cookie-session + CSRF pattern; RBAC (editor on the target profile),
 * size/count validation, R2 upload and the DB rows all live in
 * `src/services/files.ts`.
 *
 * Request: multipart form data — `profileId`, optional `folderId`, files under
 * field `files` (or `file`).
 * Response: `{ files: FileDTO[] }` or `{ error }`.
 */

/** CSRF guard, identical to the attachments/avatar routes. */
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

function fail(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  logger.error(`Vault upload failed: ${describeError(err)}`, {
    event: "vault.upload_failed",
    error: err instanceof Error ? err : String(err),
  });
  return Response.json({ error: "Upload failed. Please try again." }, { status: 502 });
}

export async function POST(request: NextRequest) {
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

    try {
      assertUploadBodySize(request, {
        maxFiles: FILE_MAX_PER_UPLOAD,
        maxBytes: FILE_MAX_BYTES,
      });
    } catch (err) {
      return fail(err);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "Invalid upload." }, { status: 400 });
    }

    const profileId = form.get("profileId");
    if (typeof profileId !== "string" || !profileId) {
      return Response.json({ error: "Pick a profile to upload into." }, { status: 400 });
    }
    const folderRaw = form.get("folderId");
    const folderId = typeof folderRaw === "string" && folderRaw ? folderRaw : null;

    try {
      // Shape/size rejections throw; `fail()` preserves their status (400/413).
      const prepared = await parseUploadForm(form, {
        maxFiles: FILE_MAX_PER_UPLOAD,
        maxBytes: FILE_MAX_BYTES,
        tooManyMessage: `You can upload at most ${FILE_MAX_PER_UPLOAD} files at once`,
      });
      const workspace = await getCurrentWorkspace(user.id);
      setLogContext({ workspaceId: workspace.id });
      const files = await uploadVaultFiles(
        user.id,
        workspace.id,
        { profileId, folderId },
        prepared,
      );
      return Response.json({ files });
    } catch (err) {
      return fail(err);
    }
  });
}
