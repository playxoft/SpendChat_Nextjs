"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TagChip, type ChipTag } from "./tag-chip";
import { tagsThatFit } from "@/lib/tags";
import { cn } from "@/lib/utils";

/** A neutral pill the height of a chip, so the "+N" reads as part of the row
 *  and is big enough to hover — bare "+2" text is a 12px target. */
const COUNTER =
  "shrink-0 cursor-default rounded-full border bg-muted/60 px-1.5 py-px text-xs font-medium tabular-nums text-muted-foreground";

/**
 * One line of tag chips that shows as many as fit and folds the rest into a
 * "+N" counter; hovering the chips lists every tag. Used by the feed bubble's
 * footer, where the tags share a row with the category, and by the
 * transactions table's Tags column, whose width the user sets by dragging.
 *
 * Neither surface has a fixed number of chips' worth of room — a bubble's
 * depends on its category name, its time label and the screen, and a table
 * column is whatever width it was dragged to — so this measures: a hidden copy of the full row is laid
 * out inside the box, and its chip widths plus the box's own width go to
 * `tagsThatFit`. A ResizeObserver on both re-runs that whenever either changes —
 * a narrower window, or a web font arriving after the first paint.
 *
 * The box must take its width from its parent (`flex-1` in the footer), never
 * from its chips: if hiding a chip shrank the box, the next measurement would
 * hide another, until nothing was left.
 */
export function FittedTagList({
  tags,
  className,
  chipClassName,
}: {
  /** `id` is optional — `TagChip` doesn't need one, but every real tag has one
   *  and it makes the better React key (names are unique per workspace too). */
  tags: (ChipTag & { id?: string })[];
  className?: string;
  /** Applied to every chip, including the ones in the tooltip and the hidden
   *  measuring copy — they must match, or the measurement is of other chips. */
  chipClassName?: string;
}) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  // Every chip until measured. The server render can't measure, and an
  // overflowing row clipped by the box is a better first paint than a guess.
  const [fit, setFit] = useState(tags.length);
  // The measurement depends on the names (their widths) and nothing else that
  // changes per render — `tags` itself is a fresh array on every parent render.
  const namesKey = tags.map((t) => t.name).join("\n");

  useLayoutEffect(() => {
    const box = boxRef.current;
    const probe = probeRef.current;
    if (!box || !probe) return;
    const measure = () => {
      const chips = Array.from(probe.children) as HTMLElement[];
      // The probe's last child is the worst-case "+N" counter.
      const counter = chips.pop();
      if (!counter) return;
      setFit(
        tagsThatFit(
          chips.map((el) => el.getBoundingClientRect().width),
          counter.getBoundingClientRect().width,
          parseFloat(getComputedStyle(probe).columnGap) || 0,
          box.getBoundingClientRect().width,
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(probe);
    return () => observer.disconnect();
  }, [namesKey]);

  if (tags.length === 0) return null;
  // `fit` can be stale for one render when the tags change; the layout effect
  // corrects it before the browser paints.
  const shown = tags.slice(0, Math.min(fit, tags.length));
  const hidden = tags.length - shown.length;

  const hiddenNames = tags
    .slice(shown.length)
    .map((t) => t.name)
    .join(", ");

  return (
    <span
      ref={boxRef}
      className={cn("relative flex min-w-0 items-center overflow-hidden", className)}
    >
      <Tooltip>
        {/* The chips themselves are the trigger, not the box: the box is as wide
            as the room it was given (that's what the measuring needs), and a
            tooltip that opened over the empty part of it would seem to come
            from nowhere. Every tag shows, not only the hidden ones — it's the
            one place the whole set reads at once, and chips clipped by their
            own max width are spelled out in full there. */}
        <TooltipTrigger asChild>
          <span className="flex min-w-0 items-center gap-1">
            {shown.map((t) => (
              // `shrink-0`: until the first measurement (the server render, and
              // a page still hydrating) every chip is shown, and shrinkable
              // chips would squeeze to "D." "F." "O." — clipped at the edge
              // instead, they read as more tags than room, which they are.
              <TagChip key={t.id ?? t.name} tag={t} className={cn("shrink-0", chipClassName)} />
            ))}
            {hidden > 0 ? (
              <span className={COUNTER}>
                +{hidden}
                {/* A tooltip reaches a mouse and nothing else (the row or
                    bubble around this is the focusable control, so the chips
                    can't be). The hidden names ride in the text for anyone
                    reading it another way. */}
                <span className="sr-only">{` (${hiddenNames})`}</span>
              </span>
            ) : null}
          </span>
        </TooltipTrigger>
        {/* The default, inverted hint — the same popup the table's User column
            uses for an email — with the chips in their own colors on it. */}
        <TooltipContent side="top" sideOffset={6}>
          <span className="flex max-w-64 flex-wrap gap-1 py-0.5">
            {tags.map((t) => (
              <TagChip key={t.id ?? t.name} tag={t} className={chipClassName} />
            ))}
          </span>
        </TooltipContent>
      </Tooltip>
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 flex items-center gap-1 whitespace-nowrap"
      >
        {tags.map((t) => (
          <TagChip key={t.id ?? t.name} tag={t} className={chipClassName} />
        ))}
        <span className={COUNTER}>+{tags.length}</span>
      </span>
    </span>
  );
}
