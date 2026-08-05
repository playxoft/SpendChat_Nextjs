import type { NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { apiOk, handle } from "@/lib/api-response";
import { ApiError, badRequest } from "@/lib/errors";
import { parseActiveProfile } from "@/lib/filters";
import { isR2Configured } from "@/lib/r2";
import {
  VAULT_FILES_LIMIT,
  getProfiles,
  listTransactionFilesForVault,
  listVaultFiles,
  listVaultFolders,
  listVaultTags,
} from "@/lib/queries";
import { ensureSystemFolders, uploadVaultFiles, type VaultUpload } from "@/services/files";
import { FILE_MAX_BYTES, FILE_MAX_PER_UPLOAD } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/files — the vault working set in one call, mirroring the web
 * page load: every folder, file, transaction file, and tag the caller can view
 * in the current workspace. `?profile=<uuid>` scopes to one profile; anything
 * else (incl. `all` or omitted) means every accessible profile. Files are
 * capped at `VAULT_FILES_LIMIT` (newest first) — `meta.filesCapped` says when
 * the cap was hit. Also lazily materializes each profile's "Transaction
 * attachments" system folder, exactly like the web page.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    const profileId = parseActiveProfile(new URL(request.url).searchParams.get("profile"));

    const profiles = await getProfiles(user.id, workspace.id);
    await ensureSystemFolders(
      user.id,
      workspace.id,
      (profileId ? profiles.filter((p) => p.id === profileId) : profiles).map((p) => p.id),
    );

    const [folders, files, transactionFiles, tags] = await Promise.all([
      listVaultFolders(user.id, workspace.id, profileId),
      listVaultFiles(user.id, workspace.id, profileId),
      listTransactionFilesForVault(user.id, workspace.id, profileId),
      listVaultTags(user.id, workspace.id, profileId),
    ]);

    return apiOk(
      { folders, files, transactionFiles, tags },
      200,
      { filesCapped: files.length >= VAULT_FILES_LIMIT, filesLimit: VAULT_FILES_LIMIT },
    );
  });
}

/**
 * POST /api/v1/files — upload files into the vault (multipart, editor only).
 * Bearer-auth twin of the web upload route. Form fields: `profileId`
 * (required), `folderId` (optional; omit for the profile's root), files under
 * `files` (repeatable; `file` also accepted), and an optional client-generated
 * preview per file under `thumb_<index>` (webp). Types are permissive (unlike
 * transaction attachments); size is capped at 5 MB per file and
 * `FILE_MAX_PER_UPLOAD` files per request. The predefined "Transaction
 * attachments" folder is never a valid destination.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, workspace } = await getApiContext(request);
    if (!isR2Configured()) {
      throw new ApiError(503, "storage_unavailable", "File uploads aren't configured on this server.");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw badRequest("Send the files as multipart form data");
    }

    const profileId = form.get("profileId");
    if (typeof profileId !== "string" || !profileId) {
      throw badRequest("Provide the profileId form field");
    }
    const folderRaw = form.get("folderId");
    const folderId = typeof folderRaw === "string" && folderRaw ? folderRaw : null;

    const files = [...form.getAll("files"), ...form.getAll("file")].filter(
      (v): v is File => v instanceof File,
    );
    if (files.length === 0) throw badRequest("No files were provided.");
    if (files.length > FILE_MAX_PER_UPLOAD) {
      throw badRequest(`You can upload at most ${FILE_MAX_PER_UPLOAD} files at once`);
    }
    // Reject oversized files by their known size before reading them into memory.
    for (const f of files) {
      if (f.size > FILE_MAX_BYTES) {
        throw new ApiError(413, "payload_too_large", "Each file must be 5 MB or smaller.");
      }
    }

    const uploads: VaultUpload[] = await Promise.all(
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
    const created = await uploadVaultFiles(user.id, workspace.id, { profileId, folderId }, uploads);
    return apiOk(created, 201);
  });
}
