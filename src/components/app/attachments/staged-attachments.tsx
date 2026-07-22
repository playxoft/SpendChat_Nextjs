"use client";

import { useCallback, useState } from "react";
import { resolveAttachmentType, type AttachmentKind } from "@/lib/validation";
import { AttachmentTile } from "./attachment-tile";
import type { StagedInput } from "./upload-client";

/** A file the user has picked but not yet uploaded (no transaction exists yet). */
export type StagedAttachment = {
  id: string;
  file: File;
  label: string | null;
  kind: AttachmentKind | null;
};

/**
 * Owns a list of staged files, shared by the add dialog and the chat composer;
 * the parent uploads `items` once the transaction is created. Tiles show a type
 * icon (no thumbnails yet), so there are no object URLs to manage here.
 */
export function useStagedAttachments() {
  const [items, setItems] = useState<StagedAttachment[]>([]);

  const add = useCallback((files: File[]) => {
    setItems((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        label: null as string | null,
        kind: null as AttachmentKind | null,
      })),
    ]);
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const update = useCallback(
    (id: string, meta: { label: string | null; kind: AttachmentKind | null }) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...meta } : i)));
    },
    [],
  );

  const clear = useCallback(() => setItems([]), []);

  const toInputs = useCallback(
    (): StagedInput[] => items.map((i) => ({ file: i.file, label: i.label, kind: i.kind })),
    [items],
  );

  return { items, add, remove, update, clear, toInputs };
}

/** Renders staged files as editable tiles (rename/tag + remove). */
export function StagedAttachmentList({
  items,
  onRemove,
  onUpdate,
  disabled = false,
}: {
  items: StagedAttachment[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, meta: { label: string | null; kind: AttachmentKind | null }) => void;
  disabled?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const contentType =
          resolveAttachmentType(it.file.name, it.file.type)?.contentType ?? it.file.type;
        return (
          <li key={it.id}>
            <AttachmentTile
              fileName={it.file.name}
              contentType={contentType}
              sizeBytes={it.file.size}
              label={it.label}
              kind={it.kind}
              editable={!disabled}
              onSave={(meta) => onUpdate(it.id, meta)}
              onRemove={disabled ? undefined : () => onRemove(it.id)}
            />
          </li>
        );
      })}
    </ul>
  );
}
