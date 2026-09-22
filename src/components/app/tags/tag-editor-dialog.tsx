"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TAGS_PER_WORKSPACE_MAX } from "@/lib/validation";
import type { TxnTagDTO } from "@/lib/tags";
import { TagChip } from "./tag-chip";
import { TagFormDialog } from "./tag-form-dialog";

/**
 * Manage the workspace's tags without leaving what you were typing.
 *
 * The counterpart to `CategoryEditorDialog`, and the reason it exists rather
 * than a link: Settings → Tags is the full manager, but reaching it from the
 * composer means navigating away from an unsent transaction. This is the same
 * list with the same edit form (`TagFormDialog` handles rename, recolour and
 * delete), minus the "used on N transactions" counts — those need a server
 * query the composer has no reason to make.
 */
export function TagEditorDialog({
  open,
  onOpenChange,
  tags,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tags: TxnTagDTO[];
  /** A tag created from here, so the caller can hold it until the server list
   *  catches up (see `useCreatedTags`). */
  onCreated?: (tag: TxnTagDTO) => void;
}) {
  // One form, two modes — `null` is closed, a tag is edit, `""` is create.
  const [form, setForm] = useState<TxnTagDTO | "" | null>(null);
  const full = tags.length >= TAGS_PER_WORKSPACE_MAX;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit tags</DialogTitle>
            <DialogDescription>
              Shared with everyone in this workspace. Renaming or recolouring one
              updates every transaction carrying it.
            </DialogDescription>
          </DialogHeader>

          {tags.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              No tags yet. Create the first one below, or type “#” while writing a
              transaction.
            </p>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {tags.map((tag) => (
                <li
                  key={tag.id}
                  className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5"
                >
                  <TagChip tag={tag} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={`Edit ${tag.name}`}
                    onClick={() => setForm(tag)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              onClick={() => setForm("")}
              disabled={full}
              title={full ? `This workspace already has ${TAGS_PER_WORKSPACE_MAX} tags` : undefined}
            >
              <Plus className="size-4" /> Add tag
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Outside the dialog above: nesting one Radix dialog inside another's
          content makes the inner one close with the outer. */}
      <TagFormDialog
        open={form !== null}
        onOpenChange={(v) => {
          if (!v) setForm(null);
        }}
        tag={form || null}
        onSaved={(tag) => {
          onCreated?.(tag);
          setForm(null);
        }}
      />
    </>
  );
}
