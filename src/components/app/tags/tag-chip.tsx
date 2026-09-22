"use client";

import { X } from "lucide-react";
import { TAG_COLORS } from "@/lib/tags";
import { cn } from "@/lib/utils";

/**
 * The colored tag label, shared by the transactions table, the feed bubbles,
 * the composer and the files vault.
 *
 * Lifted out of `files/vault-tags.tsx` when transaction tags arrived, rather
 * than copied: a vault tag and a transaction tag are different entities, but
 * they are the same *object* on screen, and two copies would drift the first
 * time either was adjusted. It takes `{ name, color }` and nothing else, so
 * both DTOs satisfy it without either importing the other.
 *
 * The color arrives as `#rrggbb` (guaranteed by `accentColorSchema`), and the
 * chip builds its border and fill by appending an alpha suffix to it — `55` and
 * `1a`. That only works on a 6-digit hex; anything shorter produces two invalid
 * declarations that the browser drops, leaving a half-styled chip. Hence the
 * fallback below.
 */
export type ChipTag = { name: string; color: string };

const HEX6 = /^#[0-9a-f]{6}$/i;

/** Slate, the palette's neutral — used when a color somehow isn't 6-digit hex,
 *  so a bad value degrades to a plain chip instead of an unstyled one. */
const FALLBACK = TAG_COLORS[17];

export function TagChip({
  tag,
  className,
  onRemove,
  removeLabel,
}: {
  tag: ChipTag;
  className?: string;
  /** When given, the chip grows a × button. Used where a chip is an editable
   *  selection (the composer) rather than a label (the table, the feed). */
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const color = HEX6.test(tag.color) ? tag.color : FALLBACK;
  return (
    <span
      className={cn(
        "inline-flex max-w-28 items-center gap-1 truncate rounded-full border px-1.5 py-px text-sm font-medium",
        className,
      )}
      style={{
        color,
        borderColor: `${color}55`,
        backgroundColor: `${color}1a`,
      }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="truncate">{tag.name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          // The label names the tag: a row of chips otherwise reads as
          // "Remove, Remove, Remove" to a screen reader.
          aria-label={removeLabel ?? `Remove tag ${tag.name}`}
          className="-mr-0.5 shrink-0 rounded-full opacity-70 hover:opacity-100"
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

/**
 * A row of chips, clipped to `max` with a "+N" counter for the rest.
 *
 * The counter carries the hidden names in its `title`, because the place this
 * renders (a fixed-width table cell) is exactly the place you can't see them.
 */
export function TagList({
  tags,
  max = 3,
  className,
}: {
  tags: ChipTag[];
  max?: number;
  className?: string;
}) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const hidden = tags.slice(max);
  return (
    <span className={cn("flex min-w-0 items-center gap-1", className)}>
      {shown.map((tag) => (
        <TagChip key={tag.name} tag={tag} />
      ))}
      {hidden.length > 0 ? (
        <span
          className="shrink-0 text-xs text-muted-foreground"
          title={hidden.map((t) => t.name).join(", ")}
        >
          +{hidden.length}
        </span>
      ) : null}
    </span>
  );
}
