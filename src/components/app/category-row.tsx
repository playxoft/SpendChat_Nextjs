"use client";

import * as React from "react";
import { ChevronDown, Tags } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Category } from "@/db/schema";

type Cat = Pick<Category, "id" | "name" | "kind" | "icon">;

/**
 * Category picker. Two shapes:
 * - default: a horizontally-scrollable row of chips with a "More" popover
 *   (full grid + "Edit") pinned at the end.
 * - `compact`: a single tag-icon button (showing the picked category as a chip)
 *   that opens the same picker — for tight mobile rows where the inline list
 *   won't fit alongside the profile control.
 *
 * `dense` is a modifier on the default shape, not a third shape: the chip row is
 * unchanged, but the trailing "More" trigger drops its label at every width so
 * the row can share a line with the rest of the compact composer.
 */
export function CategoryRow({
  categories,
  value,
  onChange,
  onEdit,
  compact = false,
  dense = false,
}: {
  categories: Cat[];
  value: string | null;
  onChange: (id: string | null) => void;
  onEdit?: () => void;
  compact?: boolean;
  dense?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const selected = value ? (categories.find((c) => c.id === value) ?? null) : null;

  // Keep the selected chip visible in the scroller — e.g. when it's chosen via
  // the "/" command in the title and lives off-screen in the horizontal scroll.
  React.useEffect(() => {
    if (!value) return;
    const el = scrollRef.current?.querySelector(`[data-cat-id="${value}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [value]);

  // Full-list grid + "Edit categories" — shared by the "More" popover and the
  // compact tag-icon picker.
  const pickerContent = (
    <PopoverContent
      align="end"
      side="top"
      closeOnOutsideClick
      className="w-auto max-w-[min(92vw,30rem)]"
    >
      {categories.length > 0 && (
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
      )}
      {onEdit && (
        <>
          {categories.length > 0 && <div className="my-2 border-t" />}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            <Tags className="size-4 text-muted-foreground" />
            Edit categories
          </button>
        </>
      )}
    </PopoverContent>
  );

  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={selected ? `Category: ${selected.name}` : "Choose a category"}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-sm transition-colors",
              selected
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {selected ? (
              <>
                <span aria-hidden>{selected.icon ?? "🏷️"}</span>
                <span className="max-w-24 truncate">{selected.name}</span>
              </>
            ) : (
              <Tags className="size-4" />
            )}
            <ChevronDown className="size-3.5 opacity-70" />
          </button>
        </PopoverTrigger>
        {pickerContent}
      </Popover>
    );
  }

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

      {(categories.length > 0 || onEdit) && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="More categories"
              title={dense ? "More categories" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border py-1 text-sm text-muted-foreground hover:bg-muted",
                dense ? "px-2" : "px-2 sm:px-2.5",
              )}
            >
              {/* Mobile: just an expand icon; desktop keeps the "More" label —
                  unless dense, where the label never earns its width. */}
              {!dense && <span className="hidden sm:inline">More</span>}
              {dense ? <Tags className="size-4" /> : <ChevronDown className="size-3.5" />}
            </button>
          </PopoverTrigger>
          {pickerContent}
        </Popover>
      )}
    </div>
  );
}
