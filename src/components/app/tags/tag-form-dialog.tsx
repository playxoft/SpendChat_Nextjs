"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addTag, countTransactionsForTag, deleteTag, updateTag } from "@/actions/tags";
import { TAG_NAME_MAX } from "@/lib/validation";
import { defaultTagColor, type TxnTagDTO } from "@/lib/tags";
import { ColorSwatch } from "./color-swatch";
import { TagChip } from "./tag-chip";

/**
 * Create or edit a transaction tag: a name and one of twenty colors, with
 * delete living here in edit mode.
 *
 * Tags are workspace entities, so a rename or a recolor changes every
 * transaction carrying the tag at once — the description says so, because that
 * is the thing a user can't undo by editing one row.
 */
export function TagFormDialog({
  open,
  onOpenChange,
  tag,
  initialName = "",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Present = edit mode. Absent = create. */
  tag?: TxnTagDTO | null;
  /** Seeds the name in create mode — the composer passes whatever was typed
   *  after the "#", so "Create #trav" opens with "trav" already filled in. */
  initialName?: string;
  /** The saved tag, so a caller that created one from a picker can apply it
   *  immediately instead of re-fetching the list and matching on name. */
  onSaved?: (tag: TxnTagDTO) => void;
}) {
  const editing = !!tag;
  const [name, setName] = useState(tag?.name ?? initialName);
  const [color, setColor] = useState(tag?.color ?? defaultTagColor(initialName));
  const [usage, setUsage] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-seed each time the dialog opens: it is mounted once and reused, so
  // without this the second "Create #travel" would still show the first name.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(tag?.name ?? initialName);
      setColor(tag?.color ?? defaultTagColor(initialName));
      setUsage(null);
      // How many transactions the tag is on — read when the dialog opens so the
      // delete button can say what it will actually detach, rather than asking
      // the user to accept an unknown.
      if (tag) {
        void countTransactionsForTag(tag.id).then((res) => {
          if (res.ok) setUsage(res.count);
        });
      }
    }
  }

  // The color only follows the name while the user hasn't chosen one, and only
  // in create mode: typing further into "trav" → "travel" should keep moving
  // the suggested swatch, but a deliberate pick must survive the next keystroke.
  const [colorPicked, setColorPicked] = useState(false);
  function changeName(value: string) {
    setName(value);
    if (!editing && !colorPicked) setColor(defaultTagColor(value));
  }
  function changeColor(value: string) {
    setColorPicked(true);
    setColor(value);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    // Portaled but still a React-tree child of the composer's <form>, so this
    // submit would otherwise bubble up and fire the composer's own validation.
    e.stopPropagation();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a tag name");
      return;
    }
    startTransition(async () => {
      // Branched before the await, not after: the two actions return different
      // payloads, and a single `res` holding the union loses `tag` to `unknown`.
      if (tag) {
        const res = await updateTag({ id: tag.id, name: trimmed, color });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Tag updated");
      } else {
        const res = await addTag({ name: trimmed, color });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Tag created");
        onSaved?.(res.tag);
      }
      onOpenChange(false);
    });
  }

  function remove() {
    if (!tag) return;
    startTransition(async () => {
      const res = await deleteTag(tag.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tag deleted");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit tag" : "New tag"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Renaming or recoloring updates every transaction with this tag."
                : "Tags are shared with everyone in this workspace."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">Name</Label>
              <Input
                id="tag-name"
                value={name}
                onChange={(e) => changeName(e.target.value)}
                maxLength={TAG_NAME_MAX}
                placeholder="Travel"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <ColorSwatch value={color} onChange={changeColor} />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Preview</span>
              <TagChip tag={{ name: name.trim() || "Tag", color }} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button type="button" variant="ghost" onClick={remove} disabled={pending}>
                <Trash2 className="size-4" />
                {/* Names the consequence once it's known, rather than warning
                    about an unknown. `usage === null` = still loading. */}
                {usage === null
                  ? "Delete"
                  : usage === 0
                    ? "Delete"
                    : `Delete (untags ${usage})`}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {editing ? "Save" : "Create"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
