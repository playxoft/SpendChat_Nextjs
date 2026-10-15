"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateAttachment } from "@/actions/attachments";
import { updateFile } from "@/actions/files";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/attachments";
import { fileTypeLabel, type FileDTO, type TxnFileDTO } from "@/lib/files";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/tools/date-math";
import { ATTACHMENT_LABEL_MAX, FILE_NAME_MAX, VAULT_DESCRIPTION_MAX } from "@/lib/validation";
import { formatVaultDate } from "./files-views";

const FIELD =
  "w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-70 dark:bg-input/30";

type Saved = { name: string; description: string };
type SaveResult = { ok: true; saved: Saved } | { ok: false; error: string };

/**
 * An item's details, editable in place — the name (and, for a vault file, the
 * description), then what it is and where it lives. Beside the full-screen
 * preview (like Google Drive's details pane) and in the column view's detail
 * pane.
 *
 * Save shows once something has changed; Escape in a field puts it back
 * (`data-dirty` tells the preview that Escape there means "undo", not
 * "close"). Key it on the item's id: a different item starts fresh.
 */
function EditableDetails({
  initial,
  withDescription,
  canWrite,
  nameMax,
  rows,
  save: persist,
}: {
  initial: Saved;
  withDescription: boolean;
  canWrite: boolean;
  nameMax: number;
  rows: [string, string][];
  save: (next: Saved) => Promise<SaveResult>;
}) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const changed = name !== saved.name || description !== saved.description;

  const revert = () => {
    setName(saved.name);
    setDescription(saved.description);
  };

  const save = () => {
    if (!name.trim()) {
      toast.error("Give it a name.");
      return;
    }
    startTransition(async () => {
      const res = await persist({ name: name.trim(), description: description.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSaved(res.saved);
      setName(res.saved.name);
      setDescription(res.saved.description);
      toast.success("Saved");
      router.refresh();
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && changed) {
      e.preventDefault();
      revert();
    }
  };

  return (
    <div className="space-y-4" data-dirty={changed ? "" : undefined}>
      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor={`${id}-name`} className="text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            id={`${id}-name`}
            value={name}
            maxLength={nameMax}
            disabled={!canWrite || pending}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              onKeyDown(e);
              if (e.key === "Enter" && changed) save();
            }}
            className={`${FIELD} h-9`}
          />
        </div>
        {withDescription && (
          <div className="space-y-1">
            <label htmlFor={`${id}-description`} className="text-xs font-medium text-muted-foreground">
              Description
            </label>
            <textarea
              id={`${id}-description`}
              value={description}
              maxLength={VAULT_DESCRIPTION_MAX}
              disabled={!canWrite || pending}
              placeholder={canWrite ? "What is it? Who's it from?" : "No description"}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={onKeyDown}
              aria-describedby={canWrite ? `${id}-shared` : undefined}
              rows={3}
              className={`${FIELD} field-sizing-content min-h-20 resize-y py-2 leading-relaxed`}
            />
            {canWrite && (
              <p className="flex justify-between gap-2 text-[11px] text-muted-foreground">
                <span id={`${id}-shared`}>Anyone with a share link sees this too.</span>
                <span className="tabular-nums">
                  {description.length}/{VAULT_DESCRIPTION_MAX}
                </span>
              </p>
            )}
          </div>
        )}
        {canWrite && changed && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={pending || !name.trim()}>
              {pending && <Loader2 className="animate-spin" />} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={revert} disabled={pending}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      <dl className="space-y-2 border-t pt-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A vault file: its name and description, then type, size, place, uploader and date. */
export function FileDetails({
  file,
  canWrite,
  locale,
  location,
  onSaved,
}: {
  file: FileDTO;
  canWrite: boolean;
  locale: string;
  /** "Profile / Folder / Sub-folder". */
  location: string;
  /** The saved file, after a save (the preview's title follows it). */
  onSaved?: (file: FileDTO) => void;
}) {
  return (
    <EditableDetails
      initial={{ name: file.name, description: file.description ?? "" }}
      withDescription
      canWrite={canWrite}
      nameMax={FILE_NAME_MAX}
      rows={[
        ["Type", fileTypeLabel(file.contentType)],
        ["Size", formatFileSize(file.sizeBytes)],
        ["Location", location],
        ...(file.uploaderName ? ([["Uploaded by", file.uploaderName]] as [string, string][]) : []),
        ["Added", formatVaultDate(file.createdAt, locale)],
      ]}
      save={async (next) => {
        const res = await updateFile({ id: file.id, name: next.name, description: next.description });
        if (!res.ok) return { ok: false, error: res.error };
        onSaved?.(res.file);
        return { ok: true, saved: { name: res.file.name, description: res.file.description ?? "" } };
      }}
    />
  );
}

/**
 * A transaction's attachment, as the Files page lists it: its name (renaming
 * it renames the attachment on the transaction too), then the transaction it
 * belongs to. It has no description — attachments don't carry one.
 */
export function TxnFileDetails({
  txn,
  canWrite,
  locale,
  currency,
  onSaved,
}: {
  txn: TxnFileDTO;
  canWrite: boolean;
  locale: string;
  /** The workspace's — what the transaction's amount is in. */
  currency: string;
  onSaved?: (txn: TxnFileDTO) => void;
}) {
  const signed = `${txn.txnType === "income" ? "+" : "−"}${formatMoney(txn.txnAmountMinor, currency, locale)}`;
  return (
    <EditableDetails
      initial={{ name: txn.name, description: "" }}
      withDescription={false}
      canWrite={canWrite}
      nameMax={ATTACHMENT_LABEL_MAX}
      rows={[
        ["Type", fileTypeLabel(txn.contentType)],
        ["Size", formatFileSize(txn.sizeBytes)],
        ["Attached to", txn.txnTitle?.trim() || "A transaction with no title"],
        ["Amount", signed],
        ["Date", formatDate(txn.txnOccurredOn, locale, "medium")],
        ...(txn.profileName
          ? ([["Profile", `${txn.profileIcon ? `${txn.profileIcon} ` : ""}${txn.profileName}`]] as [string, string][])
          : []),
        ["Added", formatVaultDate(txn.createdAt, locale)],
      ]}
      save={async (next) => {
        const res = await updateAttachment({ id: txn.id, label: next.name });
        if (!res.ok) return { ok: false, error: res.error };
        const name = res.attachment.label?.trim() || res.attachment.fileName;
        onSaved?.({ ...txn, name });
        return { ok: true, saved: { name, description: "" } };
      }}
    />
  );
}
