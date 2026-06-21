"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { CategoryEditorDialog } from "./category-editor-dialog";
import { deleteCategory, updateCategory } from "@/actions/categories";
import type { Category } from "@/db/schema";

export function CategoryManager({ categories }: { categories: Category[] }) {
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
          {categories.length} categor{categories.length === 1 ? "y" : "ies"}
        </p>
        <Button type="button" onClick={() => setEditorOpen(true)}>
          <Plus className="size-4" /> Add category
        </Button>
      </div>

      <CategoryEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        categories={categories}
        defaultKind="expense"
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <CategoryGroup
          title="Expense"
          items={expense}
          onRemove={handleRemove}
          onIcon={handleIcon}
          pending={pending}
        />
        <CategoryGroup
          title="Income"
          items={income}
          onRemove={handleRemove}
          onIcon={handleIcon}
          pending={pending}
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
}: {
  title: string;
  items: Category[];
  onRemove: (id: string) => void;
  onIcon: (id: string, value: string) => void;
  pending: boolean;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg border px-2 py-1.5 text-sm"
            >
              <span className="inline-flex items-center gap-1.5">
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
                {c.name}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${c.name}`}
                onClick={() => onRemove(c.id)}
                disabled={pending}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
