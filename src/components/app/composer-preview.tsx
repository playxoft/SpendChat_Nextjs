import { ArrowUp, CalendarDays, Hash, Minus, Paperclip, Pencil, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateLabel, formatDateShort } from "@/lib/dates";
import { TAG_COLORS } from "@/lib/tags";
import { TagChip } from "./tags/tag-chip";
import type { ComposerDensity, InputMode } from "@/lib/validation";

/**
 * A still of the tracker's composer, for the settings that change its shape.
 *
 * It is a **mirror** of `transaction-composer.tsx`'s control strip and field
 * row, not the component itself — deliberately. The real composer registers
 * window-level shortcuts, owns unsent state and talks to server actions; a
 * second live instance sitting on the settings page would double-bind ⌘E and
 * the entry-mode key, which is a worse bug than a preview that can drift.
 *
 * What it must keep true, because that is the whole point of the setting:
 * the class names below are copied from the strip, so the two densities differ
 * here exactly as they differ there, and the field row follows the same
 * `inputMode` order. When the strip changes, change this with it.
 */

/** One control in the strip, at the size the real one renders. */
function Control({
  children,
  className,
  active = false,
}: {
  children: React.ReactNode;
  className?: string;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] whitespace-nowrap",
        active ? "bg-background font-medium shadow-sm" : "bg-background/60 text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A category chip from the slider. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border bg-background/60 px-2 text-[11px] whitespace-nowrap text-muted-foreground">
      {children}
    </span>
  );
}

/** The title field — a shell holding the clip, the text and a tag chip, the
 *  way the real one does. */
function TitleField({ withClip }: { withClip: boolean }) {
  return (
    <span
      className={cn(
        "flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-input bg-transparent py-1 text-[11px] dark:bg-input/30",
        withClip ? "pr-1.5 pl-1" : "px-2.5",
      )}
    >
      {withClip && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        Add a title — / for category, # for tags
      </span>
      {/* The real chip component, so its shape can't drift from the one the
          composer renders. */}
      <TagChip tag={{ name: "travel", color: PREVIEW_TAG_COLOR }} className="text-[10px]" />
    </span>
  );
}

function AmountField({ symbol }: { symbol: string }) {
  return (
    <span className="flex h-8 w-20 shrink-0 items-center rounded-lg border border-input bg-transparent px-2.5 text-[11px] text-muted-foreground dark:bg-input/30">
      {symbol} 0.00
    </span>
  );
}

/** Violet, the swatch `defaultTagColor("travel")` actually lands on. */
const PREVIEW_TAG_COLOR = TAG_COLORS[12];

export function ComposerPreview({
  density,
  inputMode,
  symbol,
  locale,
  today,
  className,
}: {
  density: ComposerDensity;
  inputMode: InputMode;
  /** The workspace's currency symbol — the real chip renders this, and a
   *  preview showing "₹" to a dollar workspace is exactly the kind of drift
   *  this component replaced. */
  symbol: string;
  locale: string;
  /** Today, so the date pill reads what the composer's would rather than a
   *  frozen string in the wrong locale convention. */
  today: string;
  className?: string;
}) {
  const dense = density === "compact";
  // The same two helpers the real `DatePicker` picks between.
  const dateLabel = dense ? formatDateShort(today, locale) : formatDateLabel(today, locale);

  // Normal spells the two modes out and tints the AI half — that gradient is
  // the app's one "this calls a model" signal, and a preview that drops it
  // shows a control the Normal composer doesn't have.
  const modeToggle = (
    <span className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-full border bg-background/60 p-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-background shadow-sm",
          dense ? "size-6 justify-center" : "px-2 py-0.5",
        )}
      >
        <Pencil className="size-3" />
        {!dense && <span className="text-[11px] font-medium">Manual</span>}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-500/15 to-violet-500/15 text-violet-600 dark:text-violet-400",
          dense ? "size-6 justify-center" : "px-2 py-0.5",
        )}
      >
        <Sparkles className="size-3" />
        {!dense && <span className="text-[11px]">AI</span>}
      </span>
    </span>
  );

  const typeToggle = (
    <span className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-full border bg-background/60 p-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-background py-0.5 font-medium shadow-sm",
          dense ? "px-1.5" : "px-2",
        )}
      >
        <Minus className="size-3 text-red-500" />
        {!dense && <span className="text-[11px]">Expense</span>}
      </span>
      <span className={cn("inline-flex items-center rounded-full py-0.5", dense ? "px-1.5" : "px-2")}>
        <Plus className="size-3 text-emerald-500" />
      </span>
    </span>
  );

  const date = (
    <Control>
      <CalendarDays className="size-3" />
      {dateLabel}
    </Control>
  );
  const tagButton = (
    <Control className="px-1.5">
      <Hash className="size-3" />
    </Control>
  );

  const categories = (
    <>
      <Chip>🍽️ Food &amp; Dining</Chip>
      <Chip>🚕 Transport</Chip>
      {!dense && <Chip>🛒 Groceries</Chip>}
    </>
  );

  // Both end the field row in the real composer, and both are part of why the
  // title field is the width it is.
  const rowTail = (
    <>
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border text-muted-foreground">
        <Pencil className="size-3" />
      </span>
      <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-2 text-[11px] text-primary-foreground">
        <ArrowUp className="size-3" />
      </span>
    </>
  );

  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none block select-none overflow-hidden rounded-lg border bg-card p-2",
        className,
      )}
    >
      <span className="flex flex-col gap-1.5">
        {dense ? (
          // Compact: one row, controls gathered into a single grouped widget
          // with the category slider sharing it.
          <span className="flex items-center gap-1.5">
            {modeToggle}
            <span className="flex h-8 min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-full border bg-muted/40 px-1">
              {typeToggle}
              {date}
              {tagButton}
              {categories}
            </span>
          </span>
        ) : (
          // Normal: labelled controls on one row, the category slider on its own.
          <>
            <span className="flex items-center gap-1.5">
              {modeToggle}
              {typeToggle}
              <span className="ml-auto flex min-w-0 items-center gap-1.5">
                {date}
                  {tagButton}
              </span>
            </span>
            {/* Desktop only, like the real slider — a phone shows the category
                button in the strip instead. */}
            <span className="hidden items-center gap-1 overflow-hidden md:flex">{categories}</span>
          </>
        )}

        {/* The field row, in the order the input mode asks for. */}
        <span className="flex items-end gap-1.5">
          {inputMode === "combined" ? (
            <span className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-input bg-transparent pr-2.5 pl-1 text-[11px] dark:bg-input/30">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.5 font-medium">
                {symbol} 100
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">fruits</span>
              <TagChip tag={{ name: "travel", color: PREVIEW_TAG_COLOR }} className="text-[10px]" />
            </span>
          ) : inputMode === "title_amount" ? (
            <>
              <TitleField withClip />
              <AmountField symbol={symbol} />
            </>
          ) : (
            <>
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border text-muted-foreground">
                <Paperclip className="size-3.5" />
              </span>
              <AmountField symbol={symbol} />
              <TitleField withClip={false} />
            </>
          )}
          {rowTail}
        </span>
      </span>
    </span>
  );
}
