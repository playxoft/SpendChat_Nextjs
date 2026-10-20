"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TxnTagDTO } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { TagChip } from "./tag-chip";

/**
 * Chips that fit beside real text before the count takes over — what the
 * composer's full-width title field holds.
 */
const TAGS_IN_FIELD = 2;

/**
 * The tags on a transaction, rendered at the end of the field they belong to.
 *
 * They used to sit on their own row above the input. That row only existed when
 * a tag was picked, so the surface jumped a line the moment you applied one —
 * and the tags are part of the title you are writing, not a separate stack.
 *
 * Two chips fit beside real text; past that the count carries the rest, with
 * the names in a tooltip *and* in the accessible name, since a tooltip reaches
 * a mouse and nothing else. The count is a button rather than a label so the
 * tags it hides are still reachable — it opens the same picker the "#" button
 * does, which is what `onOverflowClick` is for.
 *
 * Used by the manual composer, inside its title field. The AI review rows used
 * it too until 0.48.1, when their tags became a field of their own (`TagSelect`
 * with `field`), which fits chips to its width instead of a fixed count.
 */
export function TagsInField({
  tags,
  onRemove,
  onOverflowClick,
  chipClassName,
  className,
}: {
  /** The applied tags, resolved and in pick order. */
  tags: TxnTagDTO[];
  /** Omit to render the chips read-only (no "×" on them). */
  onRemove?: (id: string) => void;
  /** Omit and the overflow count renders as plain text instead of a button. */
  onOverflowClick?: () => void;
  /** Merged into each chip; the "+N" stays plain text. The composer passes a
   *  height — the 28px of the paperclip beside the chips — so the chips read
   *  as controls, not small labels. */
  chipClassName?: string;
  className?: string;
}) {
  if (tags.length === 0) return null;
  const hidden = tags.slice(TAGS_IN_FIELD);
  const hiddenNames = hidden.map((t) => t.name).join(", ");

  return (
    <span className={cn("flex shrink-0 items-center gap-1", className)}>
      {tags.slice(0, TAGS_IN_FIELD).map((t) => (
        <TagChip
          key={t.id}
          tag={t}
          className={cn("max-w-20 text-xs", chipClassName)}
          onRemove={onRemove ? () => onRemove(t.id) : undefined}
        />
      ))}
      {hidden.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={!onOverflowClick}
              onClick={onOverflowClick}
              className="shrink-0 rounded px-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:hover:text-muted-foreground"
            >
              +{hidden.length}
              <span className="sr-only">{` more tags: ${hiddenNames}`}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{hiddenNames}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}
