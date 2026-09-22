import { CalendarDays, Hash, Minus, Paperclip, Pencil, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
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
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-1.5 text-[10px] text-violet-600 dark:text-violet-400">
        <span className="size-1 rounded-full bg-current" />
        travel
      </span>
    </span>
  );
}

function AmountField() {
  return (
    <span className="flex h-8 w-20 shrink-0 items-center rounded-lg border border-input bg-transparent px-2.5 text-[11px] text-muted-foreground dark:bg-input/30">
      ₹ 0.00
    </span>
  );
}

export function ComposerPreview({
  density,
  inputMode,
  className,
}: {
  density: ComposerDensity;
  inputMode: InputMode;
  className?: string;
}) {
  const dense = density === "compact";

  const modeToggle = (
    <span className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-full border bg-background/60 p-0.5">
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-background shadow-sm">
        <Pencil className="size-3" />
      </span>
      <span className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground">
        <Sparkles className="size-3" />
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
      {dense ? "Sep 22" : "22 Sept 2026"}
    </Control>
  );
  const profile = <Control>👤{!dense && <span>Personal</span>}</Control>;
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

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none select-none overflow-hidden rounded-lg border bg-card p-2",
        className,
      )}
    >
      <div className="flex flex-col gap-1.5">
        {dense ? (
          // Compact: one row, controls gathered into a single grouped widget
          // with the category slider sharing it.
          <div className="flex items-center gap-1.5">
            {modeToggle}
            <span className="flex h-8 min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-full border bg-muted/40 px-1">
              {typeToggle}
              {date}
              {profile}
              {tagButton}
              {categories}
            </span>
          </div>
        ) : (
          // Normal: labelled controls on one row, the category slider on its own.
          <>
            <div className="flex items-center gap-1.5">
              {modeToggle}
              {typeToggle}
              <span className="ml-auto flex min-w-0 items-center gap-1.5">
                {date}
                {profile}
                {tagButton}
              </span>
            </div>
            <div className="flex items-center gap-1 overflow-hidden">{categories}</div>
          </>
        )}

        {/* The field row, in the order the input mode asks for. */}
        <div className="flex items-end gap-1.5">
          {inputMode === "combined" ? (
            <span className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-input bg-transparent pr-2.5 pl-1 text-[11px] dark:bg-input/30">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.5 font-medium">
                ₹ 100
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">fruits</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-1.5 text-[10px] text-violet-600 dark:text-violet-400">
                <span className="size-1 rounded-full bg-current" />
                travel
              </span>
            </span>
          ) : inputMode === "title_amount" ? (
            <>
              <TitleField withClip />
              <AmountField />
            </>
          ) : (
            <>
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border text-muted-foreground">
                <Paperclip className="size-3.5" />
              </span>
              <AmountField />
              <TitleField withClip={false} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
