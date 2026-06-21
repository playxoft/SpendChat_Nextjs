"use client";

import * as React from "react";
import { ChevronDown, Tags } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Category } from "@/db/schema";

type Cat = Pick<Category, "id" | "name" | "kind" | "icon">;

/**
 * Category picker shown as a single horizontally-scrollable row of chips (thin
 * scrollbar), with "More" (the full list as a grid) and "Edit" pinned at the
 * end of the same row.
 */
export function CategoryRow({
  categories,
  value,
  onChange,
  onEdit,
}: {
  categories: Cat[];
  value: string | null;
  onChange: (id: string | null) => void;
  onEdit?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Keep the selected chip visible — e.g. when it's chosen via the "/" command
  // in the title and lives off-screen in the horizontal scroll area.
  React.useEffect(() => {
    if (!value) return;
    const el = scrollRef.current?.querySelector(`[data-cat-id="${value}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [value]);

  return (
    <div className="flex items-center gap-1.5">
      <div
        ref={scrollRef}
        className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-1"
      >
        {categories.length === 0 ? (
          <span className="text-xs text-muted-foreground">No categories yet.</span>
        ) : (
          categories.map((c) => (
            <button
              key={c.id}
              type="button"
              data-cat-id={c.id}
              onClick={() => onChange(value === c.id ? null : c.id)}
              aria-pressed={value === c.id}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors",
                value === c.id
                  ? "border-foreground bg-foreground text-background"
                  : "hover:bg-muted",
              )}
            >
              <span aria-hidden>{c.icon ?? "🏷️"}</span>
              <span className="max-w-28 truncate">{c.name}</span>
            </button>
          ))
        )}
      </div>

      {categories.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted"
            >
              More <ChevronDown className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto max-w-[min(92vw,30rem)]">
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
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Tags className="size-3.5" />
          <span className="hidden sm:inline">Edit</span>
        </button>
      )}
    </div>
  );
}
