"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TagChip } from "./tags/tag-chip";
import { TagFormDialog } from "./tags/tag-form-dialog";
import { TAGS_PER_WORKSPACE_MAX } from "@/lib/validation";
import type { TxnTagDTO } from "@/lib/tags";

export type ManagedTag = TxnTagDTO & { usage: number };

/**
 * Settings → Tags: the full list, with add / rename / recolor / delete.
 *
 * The second of the two places a tag can be created — the first is the
 * composer's "#" picker, which is where you make one mid-sentence. This is
 * where you tidy up: it's the only surface that shows what a tag costs to
 * delete (how many transactions it's on) before you do it.
 *
 * Editing and deleting both live in `TagFormDialog`, the same dialog the
 * composer opens, so there is one form for a tag in the whole app.
 */
export function TagManager({
  tags,
  canEdit,
}: {
  tags: ManagedTag[];
  /** Editors and admins can add/rename/delete; viewers see it read-only. */
  canEdit: boolean;
}) {
  // One dialog, two modes — mounted once and re-seeded on open (see
  // `TagFormDialog`), so `null` closes it and the shape says which mode it is.
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "edit"; tag: ManagedTag } | null
  >(null);
  const full = tags.length >= TAGS_PER_WORKSPACE_MAX;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {tags.length} tag{tags.length === 1 ? "" : "s"} · shared with everyone in this
          workspace
        </p>
        {canEdit && (
          <Button
            type="button"
            onClick={() => setDialog({ mode: "create" })}
            // The server rejects the create anyway; refusing here means the
            // form never opens on a request that can't succeed.
            disabled={full}
            title={full ? `This workspace already has ${TAGS_PER_WORKSPACE_MAX} tags` : undefined}
          >
            <Plus className="size-4" /> Add tag
          </Button>
        )}
      </div>

      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tags yet. Create one here, or type “#” in the tracker while adding a
          transaction.
        </p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <TagChip tag={tag} />
                <span className="truncate text-xs text-muted-foreground">
                  {tag.usage === 0
                    ? "unused"
                    : `on ${tag.usage} transaction${tag.usage === 1 ? "" : "s"}`}
                </span>
              </span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Edit ${tag.name}`}
                  onClick={() => setDialog({ mode: "edit", tag })}
                >
                  <Pencil className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <TagFormDialog
          open={dialog !== null}
          onOpenChange={(v) => {
            if (!v) setDialog(null);
          }}
          tag={dialog?.mode === "edit" ? dialog.tag : null}
        />
      )}
    </div>
  );
}
