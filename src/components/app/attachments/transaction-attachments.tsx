"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { AttachmentBox } from "./attachment-box";
import { AttachmentTile } from "./attachment-tile";
import { useAttachmentViewer } from "./attachment-viewer";
import { uploadAttachments } from "./upload-client";
import {
  deleteAttachment as deleteAttachmentAction,
  updateAttachment as updateAttachmentAction,
} from "@/actions/attachments";
import { attachmentThumbUrl, type AttachmentDTO } from "@/lib/attachments";
import { ATTACHMENT_MAX_PER_TRANSACTION } from "@/lib/validation";

/**
 * The attachments section of the edit/detail dialog for an existing transaction.
 * Renders instantly from `initialAttachments` (embedded in the transaction row,
 * so there's no load spinner and nothing is fetched from R2 to list) — a file's
 * bytes are only pulled when the user opens its preview. Uploads land immediately,
 * rename/tag saves inline, and delete confirms. Viewers get a read-only list.
 */
export function TransactionAttachments({
  transactionId,
  canEdit,
  initialAttachments,
}: {
  transactionId: string;
  canEdit: boolean;
  initialAttachments: AttachmentDTO[];
}) {
  const router = useRouter();
  const openViewer = useAttachmentViewer();
  const [items, setItems] = useState<AttachmentDTO[]>(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remaining = ATTACHMENT_MAX_PER_TRANSACTION - items.length;

  async function handleUpload(files: File[]) {
    setUploading(true);
    try {
      const created = await uploadAttachments(transactionId, files);
      setItems((prev) => [...prev, ...created]);
      router.refresh(); // keep the feed/table chips in sync
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveMeta(
    id: string,
    meta: { label: string | null; kind: AttachmentDTO["kind"] },
  ) {
    const res = await updateAttachmentAction({ id, label: meta.label, kind: meta.kind });
    if (!res.ok) {
      toast.error(res.error);
      throw new Error(res.error); // keep the inline editor open
    }
    setItems((prev) => prev.map((a) => (a.id === id ? res.attachment : a)));
  }

  async function confirmDelete() {
    if (!confirmId) return;
    setDeleting(true);
    const id = confirmId;
    const res = await deleteAttachmentAction(id);
    setDeleting(false);
    setConfirmId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setItems((prev) => prev.filter((a) => a.id !== id));
    toast.success("File removed");
    router.refresh();
  }

  // The file rows, shared by the editable box and the read-only list.
  const tiles = (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.id}>
          <AttachmentTile
            fileName={a.fileName}
            contentType={a.contentType}
            sizeBytes={a.sizeBytes}
            label={a.label}
            kind={a.kind}
            thumbnailUrl={a.hasThumbnail ? attachmentThumbUrl(a.id) : null}
            editable={canEdit}
            onOpen={() =>
              openViewer({
                id: a.id,
                fileName: a.fileName,
                contentType: a.contentType,
                label: a.label,
              })
            }
            onSave={(meta) => handleSaveMeta(a.id, meta)}
            onRemove={canEdit ? () => setConfirmId(a.id) : undefined}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-2">
      {canEdit ? (
        // The box IS the dropzone: drag onto it (or the "Add file" row) to upload.
        // Fixed height so the dialog doesn't grow with the file count.
        <AttachmentBox
          onFiles={handleUpload}
          remaining={remaining}
          uploading={uploading}
          hasItems={items.length > 0}
        >
          {tiles}
        </AttachmentBox>
      ) : items.length > 0 ? (
        <div className="max-h-44 overflow-y-auto rounded-lg border p-2">{tiles}</div>
      ) : (
        <p className="py-1 text-sm text-muted-foreground">No files attached.</p>
      )}

      <AlertDialog open={confirmId !== null} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this file?</AlertDialogTitle>
            <AlertDialogDescription>
              The file is permanently deleted from this transaction. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className={buttonVariants({ variant: "destructive" })}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" aria-label="Removing" /> : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
