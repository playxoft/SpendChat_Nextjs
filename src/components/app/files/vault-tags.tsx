"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Loader2, Pencil, Plus, Tag as TagIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTag, deleteTag, updateTag } from "@/actions/files";
import { VAULT_COLORS, type TagDTO } from "@/lib/files";
import { FILE_TAG_MAX, FILE_TAGS_MAX } from "@/lib/validation";
import { cn } from "@/lib/utils";

/** A colored tag label ("show the text as label"). */
export function TagChip({
  tag,
  className,
}: {
  tag: Pick<TagDTO, "name" | "color">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-28 items-center gap-1 truncate rounded-full border px-1.5 py-px text-[10px] font-medium",
        className,
      )}
      style={{
        color: tag.color,
        borderColor: `${tag.color}55`,
        backgroundColor: `${tag.color}1a`,
      }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
        aria-hidden
      />
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

/** Exactly the 20-swatch palette — no "no color" cell; callers pass their
 * default swatch as the initial value instead. */
export function ColorSwatch({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="grid grid-cols-10 gap-1.5">
      {VAULT_COLORS.map((color) => {
        const selected = value.toLowerCase() === color;
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            aria-label={`Color ${color}`}
            aria-pressed={selected}
            title={color}
            className={cn(
              "flex size-6 items-center justify-center rounded-full",
              selected && "ring-2 ring-ring ring-offset-1 ring-offset-background",
            )}
            style={{ backgroundColor: color }}
          >
            {selected ? <Check className="size-3.5 text-white" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Create or edit a tag (name + palette color; delete lives here in edit mode).
 * Tags are per-profile entities — renaming/recoloring updates every tagged
 * item at once.
 */
export function TagFormDialog({
  profileId,
  tag,
  open,
  onOpenChange,
  onSaved,
}: {
  profileId: string;
  /** Present = edit mode. */
  tag: TagDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the created/updated tag (null after a delete). */
  onSaved?: (tag: TagDTO | null) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState<string>(tag?.color ?? VAULT_COLORS[0]);
  const [pending, startTransition] = useTransition();

  // Reset the form when the dialog re-opens for a different tag.
  const [seen, setSeen] = useState<string | null>(tag?.id ?? null);
  if ((tag?.id ?? null) !== seen) {
    setSeen(tag?.id ?? null);
    setName(tag?.name ?? "");
    setColor(tag?.color ?? VAULT_COLORS[0]);
  }

  const submit = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      const res = tag
        ? await updateTag({ id: tag.id, name: name.trim(), color })
        : await createTag({ profileId, name: name.trim(), color });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(tag ? "Tag updated" : "Tag created");
      onSaved?.(res.tag);
      if (!tag) setName("");
      onOpenChange(false);
      router.refresh();
    });
  };

  const remove = () => {
    if (!tag) return;
    startTransition(async () => {
      const res = await deleteTag(tag.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tag deleted");
      onSaved?.(null);
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tag ? "Edit tag" : "New tag"}</DialogTitle>
          <DialogDescription>
            {tag
              ? "Renaming or recoloring updates every item with this tag."
              : "Tags belong to this profile; only created tags can be applied."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            // This dialog often opens from INSIDE another dialog's form (e.g.
            // "create tag" while creating a folder). The DOM is portaled apart,
            // but React bubbles submit through the REACT tree — without this,
            // saving a tag would also submit the parent folder form.
            e.stopPropagation();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tag-name">Name</Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {name.length}/{FILE_TAG_MAX}
              </span>
            </div>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={FILE_TAG_MAX}
              placeholder="legal"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorSwatch value={color} onChange={setColor} />
          </div>
          <DialogFooter className="gap-2">
            {tag ? (
              <Button
                type="button"
                variant="outline"
                onClick={remove}
                disabled={pending}
                className="mr-auto text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            ) : null}
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {tag ? "Save" : "Create tag"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pick tags for a file/folder from the profile's created tags — with "Create
 * new tag" right in the flow, and a pencil per tag to edit/delete it. A
 * DropdownMenu (not a popover): it dismisses reliably on any outside click,
 * including when this picker sits inside a modal dialog.
 */
export function TagPicker({
  profileId,
  tags,
  value,
  onChange,
}: {
  profileId: string;
  /** All tags of this profile (server-provided; newly created ones merge in). */
  tags: TagDTO[];
  value: string[];
  onChange: (tagIds: string[]) => void;
}) {
  const [extra, setExtra] = useState<TagDTO[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TagDTO | null>(null);

  const known = new Map<string, TagDTO>();
  for (const t of [...tags, ...extra]) {
    if (t.profileId === profileId) known.set(t.id, t);
  }
  const all = [...known.values()].sort((a, b) => a.name.localeCompare(b.name));
  const selected = value.map((id) => known.get(id)).filter((t): t is TagDTO => t != null);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < FILE_TAGS_MAX) onChange([...value, id]);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-start font-normal">
            <TagIcon className="size-4 text-muted-foreground" />
            {selected.length === 0 ? (
              <span className="text-muted-foreground">Add tags…</span>
            ) : (
              // One line, never wraps: first two chips + a "+N" for the rest.
              <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                {selected.slice(0, 2).map((t) => (
                  <TagChip key={t.id} tag={t} className="text-xs" />
                ))}
                {selected.length > 2 ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    +{selected.length - 2}
                  </span>
                ) : null}
              </span>
            )}
            <ChevronDown className="ml-auto size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {all.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              No tags yet — create the first one.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              {all.map((tag) => {
                const active = value.includes(tag.id);
                return (
                  <DropdownMenuItem
                    key={tag.id}
                    // Keep the menu open while multi-selecting.
                    onSelect={(e) => {
                      e.preventDefault();
                      toggle(tag.id);
                    }}
                    className="group gap-2 py-1.5"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        active && "border-transparent",
                      )}
                      style={active ? { backgroundColor: tag.color } : undefined}
                    >
                      {active ? <Check className="size-3 text-white" aria-hidden /> : null}
                    </span>
                    <TagChip tag={tag} className="text-xs" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditing(tag);
                      }}
                      aria-label={`Edit tag ${tag.name}`}
                      className="ml-auto rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)} className="py-1.5">
            <Plus className="size-4" /> Create new tag
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TagFormDialog
        profileId={profileId}
        tag={null}
        open={creating}
        onOpenChange={setCreating}
        onSaved={(tag) => {
          if (!tag) return;
          setExtra((prev) => [...prev, tag]);
          if (value.length < FILE_TAGS_MAX) onChange([...value, tag.id]);
        }}
      />
      <TagFormDialog
        profileId={profileId}
        tag={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={(tag) => {
          if (tag) {
            setExtra((prev) => [...prev.filter((t) => t.id !== tag.id), tag]);
          } else if (editing) {
            // Deleted: drop it from the selection too.
            onChange(value.filter((v) => v !== editing.id));
            setExtra((prev) => prev.filter((t) => t.id !== editing.id));
          }
        }}
      />
    </>
  );
}
