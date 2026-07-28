import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_PER_TRANSACTION,
  resolveAttachmentType,
  type AttachmentKind,
} from "@/lib/validation";
import type { AttachmentDTO } from "@/lib/attachments";
import { generateThumbnail } from "./thumbnail";
import { updateAttachment } from "@/actions/attachments";

/**
 * Client-side helpers shared by the dropzone, the composer, and the edit dialog.
 * Mirrors the server's type/size/count rules so the UI can reject bad files
 * before a round-trip; the route re-checks everything authoritatively.
 */

export type FilePick = { accepted: File[]; errors: string[] };

/**
 * Filter raw dropped/selected files to the ones we accept, capping to
 * `remaining` free slots and collecting one message per distinct reason so we
 * don't spam a toast per rejected file.
 */
export function pickAcceptedFiles(files: File[], remaining: number): FilePick {
  const accepted: File[] = [];
  const errors = new Set<string>();
  for (const file of files) {
    if (accepted.length >= remaining) {
      errors.add(
        remaining <= 0
          ? `Up to ${ATTACHMENT_MAX_PER_TRANSACTION} files per transaction`
          : `Only ${remaining} more file${remaining === 1 ? "" : "s"} can be added`,
      );
      continue;
    }
    if (file.size === 0) {
      errors.add("Empty files are skipped");
      continue;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      errors.add("Each file must be 5 MB or smaller");
      continue;
    }
    if (!resolveAttachmentType(file.name, file.type)) {
      errors.add("Only images, PDF, Word, Excel, CSV and text files are allowed");
      continue;
    }
    accepted.push(file);
  }
  return { accepted, errors: [...errors] };
}

/**
 * Upload files to a transaction. The route returns the created attachments in
 * input order, so callers can line up per-file metadata with the results. Each
 * file also uploads a client-generated thumbnail under `thumb_<index>` when one
 * could be rendered (images, CSV/text, PDF); other types skip it and show an icon.
 */
export async function uploadAttachments(
  transactionId: string,
  files: File[],
): Promise<AttachmentDTO[]> {
  const form = new FormData();
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    form.append("files", file, file.name);
    const thumb = await generateThumbnail(file);
    if (thumb) form.append(`thumb_${i}`, thumb, "thumb.webp");
  }
  const res = await fetch(`/api/transactions/${transactionId}/attachments`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as {
    attachments?: AttachmentDTO[];
    error?: string;
  };
  if (!res.ok || !data.attachments) {
    throw new Error(data.error ?? "Upload failed. Please try again.");
  }
  return data.attachments;
}

/** A staged file plus its optional (pre-upload) metadata. */
export type StagedInput = {
  file: File;
  label: string | null;
  kind: AttachmentKind | null;
};

/**
 * Upload staged files to a just-created transaction, then apply any per-file
 * label/tag the user set. The route returns attachments in input order, so we
 * line each result up with its staged metadata. Returns how many were stored.
 */
export async function uploadStagedAttachments(
  transactionId: string,
  staged: StagedInput[],
): Promise<number> {
  if (staged.length === 0) return 0;
  const created = await uploadAttachments(
    transactionId,
    staged.map((s) => s.file),
  );
  await Promise.all(
    created.map((attachment, i) => {
      const meta = staged[i];
      if (meta && (meta.label || meta.kind)) {
        return updateAttachment({
          id: attachment.id,
          label: meta.label ?? undefined,
          kind: meta.kind ?? undefined,
        });
      }
      return undefined;
    }),
  );
  return created.length;
}
