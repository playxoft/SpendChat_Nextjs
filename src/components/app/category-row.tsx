"use client";

import * as React from "react";
import { ChevronDown, Tags } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import type { Category } from "@/db/schema";

type Cat = Pick<Category, "id" | "name" | "kind" | "icon">;

const HOT_COUNT = 6;

/**
 * Category picker shown as a row of "hot" chips for quick taps, with the full
 * list behind a dropdown (laid out in a grid so nothing needs scrolling).
 */
export function CategoryRow({
  categories,
  value,
  onChange,
  onEdit,
  editCombo,
}: {
  categories: Cat[];
  value: string | null;
  onChange: (id: string | null) => void;
  onEdit?: () => void;
  editCombo?: string;
}) {
  const [open, setOpen] = React.useState(false);

  let hot = categories.slice(0, HOT_COUNT);
  const selected = value ? categories.find((c) => c.id === value) : null;
  // Always keep the selected category visible among the chips.
  if (selected && !hot.some((c) => c.id === selected.id)) {
    hot = [selected, ...categories.slice(0, HOT_COUNT - 1)];
  }
  const hasOverflow = categories.length > hot.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hot.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(value === c.id ? null : c.id)}
          aria-pressed={value === c.id}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors",
            value === c.id
              ? "border-foreground bg-foreground text-background"
              : "hover:bg-muted",
          )}
        >
          <span aria-hidden>{c.icon ?? "🏷️"}</span>
          <span className="max-w-28 truncate">{c.name}</span>
        </button>
      ))}

      {hasOverflow && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted"
            >
              More <ChevronDown className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto max-w-[min(92vw,30rem)]">
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(value === c.id ? null : c.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                    value === c.id && "bg-muted font-medium",
                  )}
                >
                  <span aria-hidden>{c.icon ?? "🏷️"}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          title="Edit categories"
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Tags className="size-3.5" />
          <span className="hidden sm:inline">Edit</span>
          {editCombo ? <Kbd combo={editCombo} className="hidden sm:inline-flex" /> : null}
        </button>
      )}
    </div>
  );
}
