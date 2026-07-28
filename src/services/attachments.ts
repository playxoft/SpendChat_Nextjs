import "server-only";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { transactionAttachments, transactions } from "@/db/schema";
import { badRequest, forbidden, notFound, validationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/api-response";
import { setLogContext } from "@/lib/log-context";
import { rolesAtLeast } from "@/lib/rbac";
import { getEffectiveProfileRole } from "@/lib/workspaces";
import { deleteObject, uploadObject } from "@/lib/r2";
import {
  getAttachmentById,
  listTransactionAttachments,
  type AttachmentRow,
} from "@/lib/queries";
import {
  serializeAttachment,
  type AttachmentDTO,
} from "@/lib/attachments";
import {
  ATTACHMENT_FILENAME_MAX,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_PER_TRANSACTION,
  attachmentMetaSchema,
  resolveAttachmentType,
} from "@/lib/validation";

/**
 * Attachment business logic — the layer a web server action or (later) a mobile
 * route calls. Access is inherited from the parent transaction's profile:
 * uploading/editing/deleting needs the **editor** role there; listing/viewing
 * needs **viewer**. Reads are scoped by `src/lib/queries.ts` (accessible
 * profiles in the current workspace); writes re-check the role here. The bytes
 * live in R2 — the DB row is metadata, and a transaction delete cascades the
 * rows (this layer also removes the R2 objects on explicit delete).
 */

/** One file handed to `createAttachments` (already read into memory by the route). */
export type AttachmentUpload = {
  fileName: string;
  contentType: string | null;
  bytes: ArrayBuffer;
  size: number;
  /** Optional client-generated preview (image attachments), stored alongside. */
  thumbnail?: { bytes: ArrayBuffer; contentType: string };
};

const isUuid = (value: string): boolean => z.string().uuid().safeParse(value).success;

/**
 * Strip any path components and control characters and cap the length, so a
 * hostile filename can't traverse or inject when we echo it back in the
 * download's `Content-Disposition`.
 */
function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  // Drop C0 control chars + DEL so a filename can't inject into the header.
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "file").slice(0, ATTACHMENT_FILENAME_MAX);
}

/** Editor-or-better on a profile that lives in the current workspace. Throws a
 * 404 when the profile isn't reachable here (so a foreign id never leaks its
 * existence) and a 403 when the caller is only a viewer. */
async function assertEditorOnProfile(userId: string, workspaceId: string, profileId: string) {
  const access = await getEffectiveProfileRole(userId, profileId);
  if (!access || access.workspaceId !== workspaceId) throw notFound("Transaction not found");
  if (!rolesAtLeast("editor").includes(access.role)) {
    throw forbidden("You don't have permission to change attachments here");
  }
}

/** Resolve the transaction's profile and assert the caller can edit it. */
async function requireTransactionEditable(
  userId: string,
  workspaceId: string,
  transactionId: string,
): Promise<string> {
  if (!isUuid(transactionId)) throw validationError("Invalid transaction");
  const db = getDb();
  const existing = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
    columns: { id: true, profileId: true },
  });
  if (!existing) throw notFound("Transaction not found");
  await assertEditorOnProfile(userId, workspaceId, existing.profileId);
  setLogContext({ profileId: existing.profileId });
  return existing.profileId;
}

/**
 * Attach one or more files to a transaction. Validates the whole batch (type,
 * size, per-transaction count) *before* uploading anything, then uploads to R2
 * and inserts the rows in a single statement. On any failure the R2 objects
 * this call created are removed, so a partial batch never orphans bytes.
 */
export async function createAttachments(
  userId: string,
  workspaceId: string,
  transactionId: string,
  files: AttachmentUpload[],
): Promise<AttachmentDTO[]> {
  if (files.length === 0) throw badRequest("No files were provided");
  const profileId = await requireTransactionEditable(userId, workspaceId, transactionId);
  const db = getDb();

  // Per-transaction count cap (soft; the small race window between count and
  // insert is acceptable for an anti-abuse ceiling).
  const [counted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactionAttachments)
    .where(eq(transactionAttachments.transactionId, transactionId));
  const remaining = ATTACHMENT_MAX_PER_TRANSACTION - (counted?.count ?? 0);
  if (files.length > remaining) {
    throw badRequest(
      remaining <= 0
        ? `This transaction already has the maximum of ${ATTACHMENT_MAX_PER_TRANSACTION} files`
        : `Only ${remaining} more file${remaining === 1 ? "" : "s"} can be attached (max ${ATTACHMENT_MAX_PER_TRANSACTION})`,
    );
  }

  // Validate everything first so we never upload a partially-valid batch.
  // Messages stay generic (no filenames) — they surface to the user *and* the
  // log, and a filename is user data we keep out of log messages.
  const prepared = files.map((f) => {
    if (f.size === 0) throw badRequest("One of the files is empty");
    if (f.size > ATTACHMENT_MAX_BYTES) throw validationError("Each file must be 5 MB or smaller");
    const resolved = resolveAttachmentType(f.fileName, f.contentType);
    if (!resolved) {
      throw validationError(
        "Unsupported file type — use an image, PDF, Word, Excel, CSV, or text file",
      );
    }
    return {
      bytes: f.bytes,
      size: f.size,
      fileName: sanitizeFileName(f.fileName),
      contentType: resolved.contentType,
      ext: resolved.ext,
      thumbnail: f.thumbnail,
    };
  });

  // Upload the bytes to R2 up front; track keys so we can roll them back. The
  // optional thumbnail shares the original's uuid with a `_thumb` suffix.
  const uploaded: { key: string; thumbnailKey: string | null; item: (typeof prepared)[number] }[] =
    [];
  try {
    for (const item of prepared) {
      const id = crypto.randomUUID();
      const key = `attachments/${workspaceId}/${transactionId}/${id}.${item.ext}`;
      await uploadObject(key, item.bytes, item.contentType);
      let thumbnailKey: string | null = null;
      if (item.thumbnail) {
        thumbnailKey = `attachments/${workspaceId}/${transactionId}/${id}_thumb.webp`;
        await uploadObject(thumbnailKey, item.thumbnail.bytes, item.thumbnail.contentType);
      }
      uploaded.push({ key, thumbnailKey, item });
    }

    const rows = await db
      .insert(transactionAttachments)
      .values(
        uploaded.map(({ key, thumbnailKey, item }) => ({
          transactionId,
          profileId,
          workspaceId,
          userId,
          r2Key: key,
          thumbnailKey,
          fileName: item.fileName,
          contentType: item.contentType,
          sizeBytes: item.size,
        })),
      )
      .returning();
    return rows.map(serializeAttachment);
  } catch (err) {
    // Best-effort cleanup of anything this call put in R2 (deleteObject never
    // throws), so a failed insert or a failed later upload leaves no orphans.
    for (const { key, thumbnailKey } of uploaded) {
      await deleteObject(key);
      if (thumbnailKey) await deleteObject(thumbnailKey);
    }
    throw err;
  }
}

/** All attachments for a transaction the caller can view (viewer-or-better). */
export async function listAttachments(
  userId: string,
  workspaceId: string,
  transactionId: string,
): Promise<AttachmentDTO[]> {
  if (!isUuid(transactionId)) throw validationError("Invalid transaction");
  const rows = await listTransactionAttachments(userId, workspaceId, transactionId);
  return rows.map(serializeAttachment);
}

/**
 * Update an attachment's optional label/kind. PATCH semantics: a field left
 * `undefined` is untouched, an explicit `null` clears it. Requires editor.
 */
export async function updateAttachment(
  userId: string,
  workspaceId: string,
  attachmentId: string,
  input: unknown,
): Promise<AttachmentDTO> {
  if (!isUuid(attachmentId)) throw validationError("Invalid attachment");
  const meta = parseOrThrow(attachmentMetaSchema, input);
  const row = await getAttachmentById(userId, workspaceId, attachmentId);
  if (!row) throw notFound("Attachment not found");
  await assertEditorOnProfile(userId, workspaceId, row.profileId);

  const set: { label?: string | null; kind?: AttachmentRow["kind"] } = {};
  if (meta.label !== undefined) set.label = meta.label && meta.label.trim() ? meta.label.trim() : null;
  if (meta.kind !== undefined) set.kind = meta.kind ?? null;
  if (Object.keys(set).length === 0) throw badRequest("Nothing to update");

  const db = getDb();
  const [updated] = await db
    .update(transactionAttachments)
    .set(set)
    .where(eq(transactionAttachments.id, attachmentId))
    .returning();
  return serializeAttachment(updated!);
}

/**
 * Delete an attachment (requires editor on its transaction's profile). Returns
 * whether a row was removed — false when it doesn't exist or isn't accessible
 * in the current workspace. Also removes the R2 object.
 */
export async function deleteAttachment(
  userId: string,
  workspaceId: string,
  attachmentId: string,
): Promise<boolean> {
  if (!isUuid(attachmentId)) throw validationError("Invalid attachment");
  const row = await getAttachmentById(userId, workspaceId, attachmentId);
  if (!row) return false;
  await assertEditorOnProfile(userId, workspaceId, row.profileId);

  const db = getDb();
  const deleted = await db
    .delete(transactionAttachments)
    .where(eq(transactionAttachments.id, attachmentId))
    .returning({ id: transactionAttachments.id });
  if (deleted.length === 0) return false;
  // Remove both the original and its thumbnail (best-effort; never throws).
  await deleteObject(row.r2Key);
  if (row.thumbnailKey) await deleteObject(row.thumbnailKey);
  return true;
}

/**
 * The row behind a download, scoped to the caller's viewable profiles, or null
 * when it doesn't exist / isn't accessible. Carries the R2 key + content-type +
 * filename the download route needs to mint a presigned URL.
 */
export async function getAttachmentForDownload(
  userId: string,
  workspaceId: string,
  attachmentId: string,
): Promise<AttachmentRow | null> {
  if (!isUuid(attachmentId)) return null;
  return getAttachmentById(userId, workspaceId, attachmentId);
}
