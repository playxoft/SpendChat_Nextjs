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
  //
  // Scrolls the strip itself rather than calling `scrollIntoView`, which is
  // free to scroll every scrollable ancestor including the page. That's what it
  // did: this effect runs on mount with whatever category is already selected,
  // and on the marketing pages — where the same composer is on show halfway
  // down a long page — landing on the homepage dragged the visitor a thousand
  // pixels past the hero before they had touched anything. The intent here is
  // horizontal and local; this does only that.
  React.useEffect(() => {
    if (!value) return;
    const box = scrollRef.current;
    const el = box?.querySelector(`[data-cat-id="${value}"]`);
    if (!box || !el) return;
    const boxRect = box.getBoundingClientRect();
    const chip = el.getBoundingClientRect();
    // Measured through the rects rather than `offsetLeft`, which is relative to
    // whichever ancestor happens to be positioned — not necessarily this strip.
    const left =
      box.scrollLeft + (chip.left - boxRect.left) - (boxRect.width - chip.width) / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
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
              // `h-8` at every density — the single control height shared with
              // the type, date and profile controls beside it in the composer.
              // `min-w-0` so the name below can actually truncate: without it
              // the flex item refuses to shrink past its content and a long
              // category name overflows the composer on a phone.
              "inline-flex h-8 min-w-0 items-center gap-1 rounded-full border px-2.5 text-sm transition-colors",
              selected
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {selected ? (
              <>
                <span aria-hidden className="shrink-0">
                  {selected.icon ?? "🏷️"}
                </span>
                {/* Fluid rather than a fixed cap: the name takes whatever the
                    row has left after the type and date controls (both
                    `shrink-0`) and truncates into it, so it fits a 320px phone
                    as readily as a 430px one instead of overflowing below
                    whatever width the cap was tuned for. `basis-0 grow` makes
                    the leftover space the *starting* size, so it shrinks
                    without the row having to overflow first. From `md` up the
                    desktop slider takes over and a plain cap is enough. */}
                {/* `min-w-0` + `truncate` is what actually prevents the
                    overflow — it lets the row's shrink pressure reach the text
                    instead of the button pushing past the card. `max-w-24` is
                    only a starting cap so a long name doesn't claim half the
                    strip on a roomy screen; the name still shrinks below it
                    when the row is tight, which is how a 393px phone fits. */}
                <span className="min-w-0 max-w-24 truncate">{selected.name}</span>
              </>
            ) : (
              <Tags className="size-4 shrink-0" />
            )}
            <ChevronDown className="size-3.5 shrink-0 opacity-70" />
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
                "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-sm transition-colors",
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
                "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border text-sm text-muted-foreground hover:bg-muted",
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
