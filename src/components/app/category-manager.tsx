"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { CategoryEditorDialog } from "./category-editor-dialog";
import { deleteCategory, updateCategory } from "@/actions/categories";
import { useCategoryRename } from "@/hooks/use-category-rename";
import { cn } from "@/lib/utils";
import type { Category } from "@/db/schema";

export function CategoryManager({
  categories,
  canEdit,
}: {
  categories: Category[];
  /** Editors and admins can add/rename/delete; viewers see the list read-only. */
  canEdit: boolean;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");

  function handleRemove(id: string) {
    startTransition(async () => {
      const res = await deleteCategory(id);
      if (res.ok) toast.success("Category removed");
      else toast.error(res.error);
    });
  }

  function handleIcon(id: string, value: string) {
    startTransition(async () => {
      const res = await updateCategory({ id, icon: value });
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {categories.length} categor{categories.length === 1 ? "y" : "ies"} · shared with
          everyone in this workspace
        </p>
        {canEdit && (
          <Button type="button" onClick={() => setEditorOpen(true)}>
            <Plus className="size-4" /> Add category
          </Button>
        )}
      </div>

      {canEdit && (
        <CategoryEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          categories={categories}
          defaultKind="expense"
        />
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <CategoryGroup
          title="Expense"
          items={expense}
          onRemove={handleRemove}
          onIcon={handleIcon}
          pending={pending}
          canEdit={canEdit}
        />
        <CategoryGroup
          title="Income"
          items={income}
          onRemove={handleRemove}
          onIcon={handleIcon}
          pending={pending}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}

function CategoryGroup({
  title,
  items,
  onRemove,
  onIcon,
  pending,
  canEdit,
}: {
  title: string;
  items: Category[];
  onRemove: (id: string) => void;
  onIcon: (id: string, value: string) => void;
  pending: boolean;
  canEdit: boolean;
}) {
  const rename = useCategoryRename(items);

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rename.items.map((c) => {
            const editing = rename.editingId === c.id;
            const saving = rename.savingId === c.id;
            const busy = pending || rename.pending;
            return (
              <li
                key={c.id}
                aria-busy={saving || undefined}
                className={cn(
                  "flex items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-sm",
                  saving && "pointer-events-none opacity-60",
                )}
              >
                <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
                  {canEdit ? (
                    <EmojiPicker
                      onSelect={(v) => onIcon(c.id, v)}
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Change icon for ${c.name}`}
                        >
                          <span className="text-base">{c.icon ?? "🏷️"}</span>
                        </Button>
                      }
                    />
                  ) : (
                    <span className="flex size-7 items-center justify-center text-base">
                      {c.icon ?? "🏷️"}
                    </span>
                  )}
                  {editing ? (
                    <Input
                      value={rename.draft}
                      onChange={(e) => rename.setDraft(e.target.value)}
                      onKeyDown={rename.keyHandler(c)}
                      aria-label={`Rename ${c.name}`}
                      maxLength={20}
                      autoFocus
                      className="h-7"
                    />
                  ) : (
                    <span className="truncate">{c.name}</span>
                  )}
                </span>
                {canEdit && (
                <span className="flex shrink-0 items-center">
                  {editing ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Save name for ${c.name}`}
                        onClick={() => rename.commit(c)}
                        disabled={busy}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Cancel rename"
                        onClick={rename.cancel}
                        disabled={busy}
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      {saving ? (
                        <span
                          role="status"
                          aria-label={`Saving ${c.name}`}
                          className="flex size-7 items-center justify-center"
                        >
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={`Rename ${c.name}`}
                          onClick={() => rename.start(c)}
                          disabled={busy}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${c.name}`}
                        onClick={() => onRemove(c.id)}
                        disabled={busy || saving}
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  )}
                </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
