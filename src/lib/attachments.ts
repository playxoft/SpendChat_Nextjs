import type { AttachmentKind } from "@/lib/validation";

/**
 * Client + server safe helpers for transaction attachments. Deliberately has no
 * `"server-only"` guard and no DB / R2 imports so the dropzone and tile
 * components can share the DTO shape, display helpers, and route URLs. The
 * bytes are never referenced here — the client always goes through the
 * authenticated `/api/attachments/:id` route, which authorizes and redirects to
 * a short-lived presigned URL.
 */

/** The wire/UI shape for an attachment. Never carries the R2 key. */
export type AttachmentDTO = {
  id: string;
  transactionId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  kind: AttachmentKind | null;
  /** Optional custom name; falls back to `fileName` for display. */
  label: string | null;
  /** True when a small preview object exists (image attachments), so the tile
   * shows the thumbnail rather than pulling the full-size original. */
  hasThumbnail: boolean;
  createdAt: string;
};

/** Map a DB row (or any structurally-compatible object) to the UI DTO. Pure, so
 * it lives here rather than in a server-only module. */
export function serializeAttachment(row: {
  id: string;
  transactionId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  kind: AttachmentKind | null;
  label: string | null;
  thumbnailKey: string | null;
  createdAt: Date | string;
}): AttachmentDTO {
  return {
    id: row.id,
    transactionId: row.transactionId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    kind: row.kind,
    label: row.label,
    hasThumbnail: row.thumbnailKey != null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

/** The authenticated view URL (inline preview when the type supports it). */
export const attachmentViewUrl = (id: string): string => `/api/attachments/${id}`;
/** The authenticated download URL (always `Content-Disposition: attachment`). */
export const attachmentDownloadUrl = (id: string): string => `/api/attachments/${id}?download=1`;
/** The small preview URL (redirects to the stored thumbnail, not the original). */
export const attachmentThumbUrl = (id: string): string => `/api/attachments/${id}?variant=thumb`;

/** What to show as the file's name: the custom label if set, else the filename. */
export const attachmentDisplayName = (a: Pick<AttachmentDTO, "label" | "fileName">): string =>
  a.label && a.label.trim() ? a.label : a.fileName;

export const isImageContentType = (contentType: string): boolean =>
  contentType.startsWith("image/");

/** Human labels for the optional preset tag. */
export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  receipt: "Receipt",
  bill: "Bill",
  invoice: "Invoice",
  other: "Other",
};

/** A short type label for the tile (e.g. "PDF", "Word", "JPEG"). */
export function attachmentTypeLabel(contentType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
    "image/gif": "GIF",
    "application/msword": "Word",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "application/vnd.ms-excel": "Excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
    "text/csv": "CSV",
    "text/plain": "Text",
  };
  return map[contentType] ?? "File";
}

/** Compact byte-size label ("820 KB", "3.4 MB", "1.0 GB"). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}
