"use client";

import * as React from "react";
import { useTransition } from "react";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { addCategory, deleteCategory } from "@/actions/categories";
import { useCategoryRename } from "@/hooks/use-category-rename";
import { cn } from "@/lib/utils";
import type { Category } from "@/db/schema";

type Cat = Pick<Category, "id" | "name" | "kind" | "icon">;

/** Lightweight add/rename/remove category editor, opened from the tracker via "/". */
export function CategoryEditorDialog({
  open,
  onOpenChange,
  categories,
  defaultKind,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: Cat[];
  defaultKind: "income" | "expense";
}) {
  const [kind, setKind] = React.useState<"income" | "expense">(defaultKind);
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState("🏷️");
  const [pending, startTransition] = useTransition();

  // Reset the active tab to the composer's type each time the dialog opens.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setKind(defaultKind);
  }

  const rename = useCategoryRename(categories.filter((c) => c.kind === kind));
  const list = rename.items;

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    // This dialog is portaled but still a React-tree child of the tracker's
    // composer <form>, so its submit would otherwise bubble up and trigger the
    // composer's "Start with an amount…" validation. Keep it self-contained.
    e.stopPropagation();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a category name");
      return;
    }
    startTransition(async () => {
      const res = await addCategory({ name: trimmed, kind, icon });
      if (res.ok) {
        setName("");
        setIcon("🏷️");
        toast.success("Category added");
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteCategory(id);
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit categories</DialogTitle>
          <DialogDescription>Add or remove categories for income and expenses.</DialogDescription>
        </DialogHeader>

        <div className="inline-flex w-full rounded-lg border bg-muted/50 p-0.5 text-sm">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 capitalize transition-colors",
                kind === k
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k}
            </button>
          ))}
        </div>

        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <EmojiPicker
            onSelect={setIcon}
            trigger={
              <Button type="button" variant="outline" size="icon" aria-label="Pick an icon">
                <span className="text-base">{icon}</span>
              </Button>
            }
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category name"
            maxLength={20}
            className="flex-1"
            autoFocus
          />
          <Button type="submit" size="icon" disabled={pending} aria-label="Add category">
            <Plus className="size-4" />
          </Button>
        </form>

        {/* Fixed height (not max-height) so the dialog stays the same size
            regardless of how many categories a tab has. */}
        <div className="h-64 overflow-y-auto">
          <div className="grid grid-cols-2 gap-1.5">
            {list.map((c) => {
              const editing = rename.editingId === c.id;
              const saving = rename.savingId === c.id;
              const busy = pending || rename.pending;
              return (
                <div
                  key={c.id}
                  aria-busy={saving || undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm",
                    saving && "pointer-events-none opacity-60",
                  )}
                >
                  <span aria-hidden>{c.icon ?? "🏷️"}</span>
                  {editing ? (
                    <Input
                      value={rename.draft}
                      onChange={(e) => rename.setDraft(e.target.value)}
                      onKeyDown={rename.keyHandler(c)}
                      aria-label={`Rename ${c.name}`}
                      maxLength={20}
                      autoFocus
                      className="h-6 min-w-0 flex-1 px-1.5 md:text-sm"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  )}
                  {editing ? (
                    <>
                      <button
                        type="button"
                        aria-label={`Save name for ${c.name}`}
                        onClick={() => rename.commit(c)}
                        disabled={busy}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel rename"
                        onClick={rename.cancel}
                        disabled={busy}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      {saving ? (
                        <span role="status" aria-label={`Saving ${c.name}`}>
                          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Rename ${c.name}`}
                          onClick={() => rename.start(c)}
                          disabled={busy}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Delete ${c.name}`}
                        onClick={() => handleDelete(c.id)}
                        disabled={busy || saving}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            {list.length === 0 && (
              <p className="col-span-2 py-4 text-center text-sm text-muted-foreground">
                No {kind} categories yet.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
