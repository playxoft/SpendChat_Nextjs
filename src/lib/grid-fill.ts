/**
 * Card grids that can't end in a half-empty row.
 *
 * A directory rendered as `grid-cols-3` looks finished only while its item
 * count happens to divide by three. Thirteen feature pages in three columns
 * leave one card stranded on a row of its own; five comparison cards leave two.
 * The count is read from a registry that grows, so "it lines up today" is not a
 * property anyone can keep — the hole comes back the next time someone adds an
 * entry, and nothing in CI notices.
 *
 * So the layout absorbs the remainder instead: the first card (or the first
 * two) is widened until the spans add up to whole rows. That reads as a
 * deliberate bento — the flagship entry gets the emphasis it deserves — and it
 * is computed per breakpoint, because a count that divides by two rarely
 * divides by three.
 *
 * Widening the *first* cards rather than the last is what keeps the grid
 * hole-free: a wide card placed mid-row doesn't fit the cells left in it and
 * wraps, leaving behind exactly the gap this is meant to remove.
 */

/** Tailwind span utilities, written out so the class scanner can see them. */
const SPAN_CLASS: Record<Breakpoint, Record<number, string>> = {
  sm: {
    1: "sm:col-span-1",
    2: "sm:col-span-2",
    3: "sm:col-span-3",
    4: "sm:col-span-4",
  },
  md: {
    1: "md:col-span-1",
    2: "md:col-span-2",
    3: "md:col-span-3",
    4: "md:col-span-4",
  },
  lg: {
    1: "lg:col-span-1",
    2: "lg:col-span-2",
    3: "lg:col-span-3",
    4: "lg:col-span-4",
  },
};

export type Breakpoint = "sm" | "md" | "lg";

/** Ascending, because each breakpoint only overrides the one below it. */
const ORDER: Breakpoint[] = ["sm", "md", "lg"];

/**
 * How wide each of `count` cards has to be for `columns` columns to come out
 * even. Returns one span per card, in order; `[1, 1, …]` when it already does.
 *
 * `maxSpan` caps how wide any single card may get — pass `2` where a
 * full-bleed card would look stretched (a blog cover, say) and the extra width
 * is spread over two cards instead. The cap is dropped if honouring it would
 * leave a remainder, since a hole is the worse outcome.
 */
export function fillSpans(count: number, columns: number, maxSpan = columns): number[] {
  if (count < 1 || columns < 2) return Array(Math.max(count, 0)).fill(1);

  const spans = greedy(count, columns, Math.max(2, Math.min(maxSpan, columns)));
  if (total(spans) % columns === 0) return spans;

  // The cap couldn't absorb the remainder (very few cards, many columns).
  const uncapped = greedy(count, columns, columns);
  return total(uncapped) % columns === 0 ? uncapped : Array(count).fill(1);
}

function greedy(count: number, columns: number, maxSpan: number): number[] {
  const spans: number[] = Array(count).fill(1);
  let owed = (columns - (count % columns)) % columns;
  let column = 0; // cells already used in the row being filled

  for (let i = 0; i < count && owed > 0; i++) {
    // Never wider than the cells left in this row — a card that doesn't fit
    // wraps to the next one and opens the gap we're closing.
    const span = Math.min(1 + owed, columns - column, maxSpan);
    spans[i] = span;
    owed -= span - 1;
    column = (column + span) % columns;
  }
  return spans;
}

function total(spans: number[]): number {
  return spans.reduce((sum, span) => sum + span, 0);
}

/**
 * One card's place in the bento: how wide it is, and where it got that way.
 */
export type BentoCell = {
  /** The `col-span` utilities this card needs, or `""` when it needs none. */
  span: string;
  /** Whether the card is widened, per breakpoint. The base layout is never. */
  wideAt: Record<Breakpoint, boolean>;
  /** Widened at any breakpoint at all. */
  wide: boolean;
};

/**
 * Lays `count` cards out over a grid whose column count changes with the
 * viewport — `{ sm: 2, lg: 3 }` for the usual `sm:grid-cols-2 lg:grid-cols-3`.
 *
 * ```tsx
 * const cells = bento(items.length, { sm: 2, lg: 3 });
 * items.map((item, i) => <Card key={item.id} className={cells[i].span} />)
 * ```
 *
 * The base (single-column) layout is left alone — every card is already full
 * width there — so a card only carries a class from the breakpoint at which its
 * width actually changes, including the `col-span-1` that walks a widened card
 * back down again when the wider grid no longer needs it.
 */
export function bento(
  count: number,
  columns: Partial<Record<Breakpoint, number>>,
  maxSpan?: number,
): BentoCell[] {
  const active = ORDER.filter((bp) => (columns[bp] ?? 0) >= 2);
  const perBreakpoint = new Map(
    active.map((bp) => [bp, fillSpans(count, columns[bp]!, maxSpan)] as const),
  );

  return Array.from({ length: count }, (_, i) => {
    const classes: string[] = [];
    const wideAt: Record<Breakpoint, boolean> = { sm: false, md: false, lg: false };
    let inherited = 1; // the base layout is one column, so one cell each

    for (const bp of ORDER) {
      const span = active.includes(bp) ? perBreakpoint.get(bp)![i] : inherited;
      if (span !== inherited) classes.push(SPAN_CLASS[bp][span]);
      wideAt[bp] = span > 1;
      inherited = span;
    }

    return {
      span: classes.join(" "),
      wideAt,
      wide: ORDER.some((bp) => wideAt[bp]),
    };
  });
}

/**
 * Swaps between two sets of classes as a card widens and narrows again.
 *
 * A widened card usually wants a different internal layout — side-on rather
 * than stacked — and the catch is that it has to change at the same breakpoint
 * the *width* does, not before. A card widened only at `lg` that turns side-on
 * at `sm` spends the whole tablet range as a cramped one-column card with its
 * content in a row. Both maps are keyed by breakpoint so each change lands
 * where it belongs, and only the breakpoints that actually flip emit anything.
 *
 * Write the stacked (narrow) form as the element's own unprefixed classes; the
 * `narrow` map is only for undoing a `wide` entry further down.
 */
export function bentoVariant(
  cell: BentoCell,
  wide: Partial<Record<Breakpoint, string>>,
  narrow: Partial<Record<Breakpoint, string>> = {},
): string {
  const classes: string[] = [];
  let inherited = false; // the base layout is always the narrow one

  for (const bp of ORDER) {
    if (cell.wideAt[bp] === inherited) continue;
    const next = cell.wideAt[bp] ? wide[bp] : narrow[bp];
    if (next) classes.push(next);
    inherited = cell.wideAt[bp];
  }
  return classes.join(" ");
}

/** `flex-direction` that tracks where a card is widened. See `bentoVariant`. */
export function bentoRow(cell: BentoCell): string {
  return bentoVariant(
    cell,
    { sm: "sm:flex-row", md: "md:flex-row", lg: "lg:flex-row" },
    { sm: "sm:flex-col", md: "md:flex-col", lg: "lg:flex-col" },
  );
}
