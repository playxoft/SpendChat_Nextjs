"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addCategory, deleteCategory } from "@/actions/categories";
import type { Category } from "@/db/schema";

export function CategoryManager({ categories }: { categories: Category[] }) {
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [pending, startTransition] = useTransition();

  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Enter a category name");
      return;
    }
    startTransition(async () => {
      const res = await addCategory({
        name: name.trim(),
        kind,
        icon: icon.trim() || undefined,
      });
      if (res.ok) {
        toast.success("Category added");
        setName("");
        setIcon("");
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const res = await deleteCategory(id);
      if (res.ok) toast.success("Category removed");
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-muted/50 p-0.5 text-sm">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cn(
                "rounded-md px-3 py-1 capitalize transition-colors",
                kind === k
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <Input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="🙂"
          aria-label="Icon"
          className="w-14 text-center"
          maxLength={4}
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          aria-label="Category name"
          className="min-w-40 flex-1"
          maxLength={40}
        />
        <Button type="submit" size="sm" disabled={pending}>
          <Plus className="size-4" /> Add
        </Button>
      </form>

      <div className="grid gap-6 sm:grid-cols-2">
        <CategoryGroup
          title="Expense"
          items={expense}
          onRemove={handleRemove}
          pending={pending}
        />
        <CategoryGroup
          title="Income"
          items={income}
          onRemove={handleRemove}
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
  pending,
}: {
  title: string;
  items: Category[];
  onRemove: (id: string) => void;
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
              className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm"
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden>{c.icon ?? "•"}</span>
                {c.name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive"
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
