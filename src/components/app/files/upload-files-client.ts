import { FILE_MAX_BYTES, FILE_MAX_PER_UPLOAD } from "@/lib/validation";
import type { FileDTO } from "@/lib/files";

/**
 * Client-side vault upload: multipart POST to `/api/files/upload` (same
 * transport as transaction attachments — no presigned PUT), via XHR so the
 * page can render real upload progress. The server is authoritative on
 * size/count/RBAC; the checks here just fail fast with a friendly message
 * before any bytes leave the browser.
 */

export type VaultUploadResult =
  | { ok: true; files: FileDTO[] }
  | { ok: false; error: string };

/** Splits a picked set into acceptable files + a human reason for the rest. */
export function pickVaultFiles(
  picked: File[],
): { accepted: File[]; rejected: string | null } {
  const oversize = picked.filter((f) => f.size > FILE_MAX_BYTES);
  const accepted = picked.filter((f) => f.size <= FILE_MAX_BYTES).slice(0, FILE_MAX_PER_UPLOAD);
  if (oversize.length > 0) {
    return {
      accepted,
      rejected: `${oversize.length === 1 ? "One file is" : `${oversize.length} files are`} over 5 MB and can't be uploaded`,
    };
  }
  if (picked.length > FILE_MAX_PER_UPLOAD) {
    return { accepted, rejected: `Uploading the first ${FILE_MAX_PER_UPLOAD} files (that's the per-batch limit)` };
  }
  return { accepted, rejected: null };
}

export async function uploadVaultFilesRequest(
  profileId: string,
  folderId: string | null,
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<VaultUploadResult> {
  const form = new FormData();
  form.set("profileId", profileId);
  if (folderId) form.set("folderId", folderId);
  for (const f of files) form.append("files", f);
  // Client-rendered previews (images/PDF/CSV — same generator as attachments)
  // ride along as `thumb_<index>`; a null thumb simply means no tile preview.
  const { generateThumbnail } = await import("@/components/app/attachments/thumbnail");
  await Promise.all(
    files.map(async (f, i) => {
      try {
        const thumb = await generateThumbnail(f);
        if (thumb) form.set(`thumb_${i}`, new File([thumb], "thumb.webp", { type: "image/webp" }));
      } catch {
        /* thumbnail is best-effort — the upload proceeds without one */
      }
    }),
  );

  // XHR instead of fetch: `upload.onprogress` is the only way to get real
  // upload progress for the bottom-right progress card.
  return new Promise<VaultUploadResult>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/upload");
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress?.(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      type UploadResponse = { files?: FileDTO[]; error?: string };
      let data: UploadResponse | null = null;
      try {
        data = JSON.parse(xhr.responseText) as UploadResponse;
      } catch {
        data = null;
      }
      if (xhr.status < 200 || xhr.status >= 300 || !data?.files) {
        resolve({ ok: false, error: data?.error ?? "Upload failed. Please try again." });
        return;
      }
      onProgress?.(100);
      resolve({ ok: true, files: data.files });
    };
    xhr.onerror = () =>
      resolve({ ok: false, error: "Upload failed. Check your connection and try again." });
    xhr.send(form);
  });
}
