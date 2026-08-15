import type { FileCategory } from "@/lib/validation";
import { attachmentTypeLabel } from "@/lib/attachments";

/**
 * Client + server safe helpers for the files vault. No `"server-only"` guard
 * and no DB / R2 imports (same rationale as `lib/attachments.ts`): the vault's
 * grid/list/chat views and the server routes share these DTO shapes and URL
 * builders. Bytes always go through the authenticated `/api/files/:id` route
 * (or the tokenized `/api/share/...` route for public links) — the R2 key
 * never reaches a client.
 */

/**
 * The 20-swatch palette for folder accents and tags. Values are plain hex so
 * the DB accepts any color — a future custom picker just mints another hex.
 */
export const VAULT_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  "#64748b", // slate
  "#78716c", // stone
  "#737373", // neutral
] as const;

/**
 * The folder color when none was picked — one of the 20 swatches (slate), so
 * the picker shows exactly 20 options with this one pre-selected rather than
 * a separate "no color" state. A null `color` column means this.
 */
export const VAULT_DEFAULT_FOLDER_COLOR = "#64748b";

/** A folder's effective accent (its own color, or the default swatch). */
export const folderColor = (folder: { color: string | null }): string =>
  folder.color ?? VAULT_DEFAULT_FOLDER_COLOR;

/** Traffic-light tone for the storage indicator. */
export type StorageTone = "ok" | "warn" | "full";

/** `warn` from 85% of the quota, `full` at 100% — shared by ring and bar. */
export function storageUsageTone(usedBytes: number, limitBytes: number): StorageTone {
  if (usedBytes >= limitBytes) return "full";
  if (usedBytes >= limitBytes * 0.85) return "warn";
  return "ok";
}

const GIB = 1024 ** 3;

/**
 * The at-a-glance storage label ("0.1/1 GB"): used space to one decimal in GB,
 * the quota trimmed of trailing zeros. Deliberately coarse — the popover and
 * tooltips carry the exact `formatFileSize` numbers.
 */
export function formatStorageCompact(usedBytes: number, limitBytes: number): string {
  const limit = limitBytes / GIB;
  const limitStr = Number.isInteger(limit) ? String(limit) : limit.toFixed(1);
  return `${(usedBytes / GIB).toFixed(1)}/${limitStr} GB`;
}

/**
 * Total bytes per folder, descendants included, from the vault working set the
 * page already holds: files count toward their folder, transaction files
 * toward their profile's predefined system folder, and every folder's total
 * rolls up into its ancestors. Exact for what the views show (the working set
 * is capped at `VAULT_FILES_LIMIT`, so a capped vault undercounts the same way
 * the file list does).
 */
export function computeFolderSizes(
  folders: Pick<FolderDTO, "id" | "parentId" | "profileId" | "system">[],
  files: Pick<FileDTO, "folderId" | "sizeBytes">[],
  txnFiles: Pick<TxnFileDTO, "profileId" | "sizeBytes">[],
): Map<string, number> {
  const totals = new Map<string, number>();
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]));
  const systemByProfile = new Map(
    folders.filter((f) => f.system).map((f) => [f.profileId, f.id]),
  );

  const addToChain = (folderId: string | null, bytes: number) => {
    // Walk up the ancestor chain; a `seen` guard keeps a (never expected)
    // parent cycle from hanging the page.
    const seen = new Set<string>();
    for (let id = folderId; id != null && !seen.has(id); id = parentOf.get(id) ?? null) {
      seen.add(id);
      totals.set(id, (totals.get(id) ?? 0) + bytes);
    }
  };

  for (const f of files) addToChain(f.folderId, f.sizeBytes);
  for (const t of txnFiles) addToChain(systemByProfile.get(t.profileId) ?? null, t.sizeBytes);
  return totals;
}

/** A vault tag (per-profile entity; items reference it by id). */
export type TagDTO = {
  id: string;
  profileId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

/** The wire/UI shape for a vault folder. */
export type FolderDTO = {
  id: string;
  profileId: string;
  /** null = a root folder. */
  parentId: string | null;
  name: string;
  /** Accent hex, or null for the neutral default. */
  color: string | null;
  tagIds: string[];
  /** True for a predefined folder (e.g. "Transaction attachments"): can be
   * recolored/tagged but never renamed, moved, deleted, shared, or given
   * children. */
  system: boolean;
  createdAt: string;
  updatedAt: string;
  /** Creator attribution (from the joined `users` row; null if unknown). */
  createdByName: string | null;
};

/** The wire/UI shape for a vault file. Never carries the R2 key. */
export type FileDTO = {
  id: string;
  profileId: string;
  /** null = the profile's root. */
  folderId: string | null;
  name: string;
  contentType: string;
  sizeBytes: number;
  category: FileCategory | null;
  tagIds: string[];
  /** True when a small preview object exists (see `fileThumbUrl`). */
  hasThumbnail: boolean;
  createdAt: string;
  /** Uploader attribution (from the joined `users` row; null if unknown). */
  uploaderName: string | null;
  /** Profile display info, for the "all profiles" views. */
  profileName: string | null;
  profileIcon: string | null;
};

/** A share link, as the share dialog sees it (the creator may see the token). */
export type FileShareDTO = {
  id: string;
  fileId: string | null;
  folderId: string | null;
  token: string;
  allowDownload: boolean;
  /** null = the link never expires. */
  expiresAt: string | null;
  createdAt: string;
};

/**
 * A transaction attachment surfaced in the files page, flattened with the
 * transaction info the user needs to recognize it ("receipt on ₹450 Groceries,
 * Jul 12"). Viewed through the existing `/api/attachments/:id` route.
 */
export type TxnFileDTO = {
  id: string;
  transactionId: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  hasThumbnail: boolean;
  createdAt: string;
  txnTitle: string | null;
  txnType: "income" | "expense";
  txnAmountMinor: number;
  txnOccurredOn: string;
  profileId: string;
  profileName: string | null;
  profileIcon: string | null;
};

const toISO = (v: Date | string): string =>
  v instanceof Date ? v.toISOString() : String(v);

export function serializeTag(row: {
  id: string;
  profileId: string;
  name: string;
  color: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}): TagDTO {
  return {
    id: row.id,
    profileId: row.profileId,
    name: row.name,
    color: row.color,
    createdAt: toISO(row.createdAt),
    updatedAt: toISO(row.updatedAt),
  };
}

/** Map a `folders` DB row to the UI DTO. */
export function serializeFolder(row: {
  id: string;
  profileId: string;
  parentId: string | null;
  name: string;
  color: string | null;
  systemKey: string | null;
  tagIds: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
  createdByName?: string | null;
}): FolderDTO {
  return {
    id: row.id,
    profileId: row.profileId,
    parentId: row.parentId,
    name: row.name,
    color: row.color,
    tagIds: row.tagIds,
    system: row.systemKey != null,
    createdAt: toISO(row.createdAt),
    updatedAt: toISO(row.updatedAt),
    createdByName: row.createdByName ?? null,
  };
}

/** Map a `files` DB row (plus joined display fields) to the UI DTO. */
export function serializeFile(row: {
  id: string;
  profileId: string;
  folderId: string | null;
  name: string;
  contentType: string;
  sizeBytes: number;
  category: string | null;
  tagIds: string[];
  thumbnailKey: string | null;
  createdAt: Date | string;
  uploaderName?: string | null;
  profileName?: string | null;
  profileIcon?: string | null;
}): FileDTO {
  return {
    id: row.id,
    profileId: row.profileId,
    folderId: row.folderId,
    name: row.name,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    category: (row.category as FileCategory | null) ?? null,
    tagIds: row.tagIds,
    hasThumbnail: row.thumbnailKey != null,
    createdAt: toISO(row.createdAt),
    uploaderName: row.uploaderName ?? null,
    profileName: row.profileName ?? null,
    profileIcon: row.profileIcon ?? null,
  };
}

export function serializeFileShare(row: {
  id: string;
  fileId: string | null;
  folderId: string | null;
  token: string;
  allowDownload: boolean;
  expiresAt: Date | string | null;
  createdAt: Date | string;
}): FileShareDTO {
  return {
    id: row.id,
    fileId: row.fileId,
    folderId: row.folderId,
    token: row.token,
    allowDownload: row.allowDownload,
    expiresAt: row.expiresAt == null ? null : toISO(row.expiresAt),
    createdAt: toISO(row.createdAt),
  };
}

/**
 * Build a `Content-Disposition` value with both an ASCII-safe filename and an
 * RFC 5987 UTF-8 filename, so non-ASCII names survive without letting a hostile
 * name break out of the header. Shared by every route that serves stored bytes
 * — vault files and transaction attachments, authenticated or tokenized — so
 * the header is hardened in exactly one place.
 *
 * `inline` is a decision the caller makes from an allowlist
 * (`FILE_INLINE_TYPES` / `ATTACHMENT_INLINE_TYPES`), never from the stored
 * content type directly: an uploaded HTML/SVG served inline would execute.
 */
export function contentDisposition(fileName: string, inline: boolean): string {
  const type = inline ? "inline" : "attachment";
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** The authenticated view URL (inline preview when the type supports it). */
export const fileViewUrl = (id: string): string => `/api/files/${id}`;
/** The authenticated download URL (always `Content-Disposition: attachment`). */
export const fileDownloadUrl = (id: string): string => `/api/files/${id}?download=1`;
/** The small preview URL (redirects to the stored thumbnail, not the original). */
export const fileThumbUrl = (id: string): string => `/api/files/${id}?variant=thumb`;

/** The public share page path for a link token (append to the site origin). */
export const sharePath = (token: string): string => `/share/${token}`;
/** Content URL a share page uses for one file under a token (view or download). */
export const shareFileUrl = (token: string, fileId: string, download = false): string =>
  `/api/share/${token}/file/${fileId}${download ? "?download=1" : ""}`;
/** Thumbnail URL for a shared file (allowed even on view-only links). */
export const shareFileThumbUrl = (token: string, fileId: string): string =>
  `/api/share/${token}/file/${fileId}?variant=thumb`;

/** What the vault shows inside a predefined system folder. */
export const SYSTEM_FOLDER_NOTICE =
  "This is a predefined folder for files attached to transactions. It can't be renamed, moved, or deleted, and folders or uploads can't be added here — attach a file to a transaction and it appears here automatically.";

/** Human labels for the preset document categories. */
export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  "board-resolution": "Board resolution",
  company: "Company document",
  personal: "Personal document",
  land: "Land document",
  house: "House document",
  certificate: "Certificate",
  other: "Other",
};

export const isVideoContentType = (contentType: string): boolean =>
  contentType.startsWith("video/");
export const isAudioContentType = (contentType: string): boolean =>
  contentType.startsWith("audio/");

/** Short type label for tiles/rows ("PDF", "Video", "Audio", "ZIP", …). */
export function fileTypeLabel(contentType: string): string {
  if (isVideoContentType(contentType)) return "Video";
  if (isAudioContentType(contentType)) return "Audio";
  const extra: Record<string, string> = {
    "application/zip": "ZIP",
    "application/json": "JSON",
    "text/markdown": "Markdown",
    "application/vnd.ms-powerpoint": "PowerPoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
    "application/octet-stream": "File",
  };
  const known = extra[contentType];
  if (known) return known;
  if (contentType.startsWith("image/")) {
    return contentType.slice("image/".length).toUpperCase();
  }
  return attachmentTypeLabel(contentType);
}
