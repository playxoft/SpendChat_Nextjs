import { TagChip, type ChipTag } from "./tag-chip";
import { cn } from "@/lib/utils";

/**
 * A row of tag chips, for the places that *display* a transaction's tags: the
 * transactions table's Tags column and the feed bubble.
 *
 * Two layouts, because the two surfaces have opposite constraints:
 *
 *  - The table row must keep a constant height (every other cell is one line,
 *    and a wrapping cell would make the row taller than its neighbours). So the
 *    default is a single line, clipped to `max` chips with a `+N` counter for
 *    the rest — the count is the honest part: a clipped chip looks like a
 *    rendering bug, "+2" reads as "there are two more".
 *  - A chat bubble grows to fit its content already, so it passes `wrap` and
 *    every tag shows.
 *
 * Not a client component: it renders no interaction, so it can stay on the
 * server wherever its parent is a server component (the feed) and cost nothing
 * in the bundle. `TagChip` is a client component only because the composer
 * needs its remove button.
 */
export function TagList({
  tags,
  max = 3,
  wrap = false,
  className,
}: {
  tags: ChipTag[];
  /** Chips shown before the "+N" counter takes over (single-line mode only). */
  max?: number;
  /** Let the chips wrap onto further lines and show all of them. */
  wrap?: boolean;
  className?: string;
}) {
  if (tags.length === 0) return null;
  const shown = wrap ? tags : tags.slice(0, max);
  const hidden = tags.length - shown.length;

  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1",
        wrap ? "flex-wrap" : "overflow-hidden",
        className,
      )}
    >
      {shown.map((t) => (
        <TagChip key={t.name} tag={t} />
      ))}
      {hidden > 0 ? (
        <span
          className="shrink-0 text-xs text-muted-foreground"
          // The names of what's hidden, so widening the column isn't the only
          // way to find out what a "+2" stands for.
          title={tags
            .slice(shown.length)
            .map((t) => t.name)
            .join(", ")}
        >
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}
