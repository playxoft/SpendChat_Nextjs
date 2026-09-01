import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { ApiError, badRequest } from "@/lib/errors";
import { parseActiveProfile } from "@/lib/filters";
import { isR2Configured } from "@/lib/r2";
import { VAULT_FILES_LIMIT } from "@/lib/queries";
import { readUploadForm } from "@/lib/upload-form";
import { getVaultWorkingSet, uploadVaultFiles } from "@/services/files";
import { FILE_MAX_BYTES, FILE_MAX_PER_UPLOAD, STORAGE_QUOTA_BYTES } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/files — the vault working set in one call, mirroring the web
 * page load: every folder, file, transaction file, and tag the caller can view
 * in the current workspace. `?profile=<uuid>` scopes to one profile; anything
 * else (incl. `all` or omitted) means every accessible profile. Files are
 * capped at `VAULT_FILES_LIMIT` (newest first) — `meta.filesCapped` says when
 * the cap was hit. Also lazily materializes each profile's "Transaction
 * attachments" system folder, exactly like the web page. `meta.storage` is the
 * workspace-wide usage (vault files + transaction attachments) against the
 * flat quota — workspace-wide even when `?profile=` scopes the list.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const profileId = parseActiveProfile(new URL(request.url).searchParams.get("profile"));

    const { folders, files, transactionFiles, tags, storageUsedBytes, filesCapped } =
      await getVaultWorkingSet(user.id, workspace.id, profileId);

    return apiOk(
      { folders, files, transactionFiles, tags },
      200,
      {
        filesCapped,
        filesLimit: VAULT_FILES_LIMIT,
        storage: { usedBytes: storageUsedBytes, limitBytes: STORAGE_QUOTA_BYTES },
      },
    );
  });
}

/**
 * POST /api/v1/files — upload files into the vault (multipart, editor only).
 * Bearer-auth twin of the web upload route. Form fields: `profileId`
 * (required), `folderId` (optional; omit for the profile's root), files under
 * `files` (repeatable; `file` also accepted), and an optional client-generated
 * preview per file under `thumb_<index>` (webp). Types are permissive (unlike
 * transaction attachments); the 5 MB cap applies to each file **and** each
 * preview, with `FILE_MAX_PER_UPLOAD` files per request (see
 * `parseUploadForm`). The predefined "Transaction attachments" folder is never
 * a valid destination.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    if (!isR2Configured()) {
      throw new ApiError(503, "storage_unavailable", "File uploads aren't configured on this server.");
    }

    const { form, uploads } = await readUploadForm(request, {
      maxFiles: FILE_MAX_PER_UPLOAD,
      maxBytes: FILE_MAX_BYTES,
      tooManyMessage: `You can upload at most ${FILE_MAX_PER_UPLOAD} files at once`,
      malformedMessage: "Send the files as multipart form data",
    });

    const profileId = form.get("profileId");
    if (typeof profileId !== "string" || !profileId) {
      throw badRequest("Provide the profileId form field");
    }
    const folderRaw = form.get("folderId");
    const folderId = typeof folderRaw === "string" && folderRaw ? folderRaw : null;

    const created = await uploadVaultFiles(user.id, workspace.id, { profileId, folderId }, uploads);
    return apiOk(created, 201);
  });
}
