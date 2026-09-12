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
 * wraps, leaving behind exactly the gap this is meant to remove. The one
 * exception is a grid whose cards must all stay the same width — see
 * `bentoTail`, which widens only the very last one.
 */

export type Breakpoint = "sm" | "md" | "lg";

/**
 * Tailwind span utilities, written out so the class scanner can see them —
 * Tailwind only ships a class it can find as a literal in the source, so these
 * cannot be composed from the span number.
 *
 * Four columns is therefore the widest grid this module can dress. That is a
 * hard limit, not a default: `spanClass` throws rather than let a fifth column
 * fall through to a card that silently renders one column wide, which is the
 * very hole the module exists to close.
 */
const SPAN_CLASS: Record<Breakpoint, Record<number, string | undefined>> = {
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

/** The widest grid `SPAN_CLASS` can dress. */
const MAX_COLUMNS = 4;

/** Ascending, because each breakpoint only overrides the one below it. */
const ORDER: Breakpoint[] = ["sm", "md", "lg"];

function spanClass(bp: Breakpoint, span: number): string {
  const found = SPAN_CLASS[bp][span];
  if (!found) {
    throw new Error(
      `grid-fill: no utility for ${bp}:col-span-${span}. SPAN_CLASS stops at ` +
        `${MAX_COLUMNS} columns — add the literals there before laying out a ` +
        `wider grid, or Tailwind won't emit the class and the card renders one ` +
        `column wide.`,
    );
  }
  return found;
}

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

  // The cap couldn't absorb the remainder (very few cards, many columns). An
  // uncapped pass always can: the first card is allowed the whole row, so it
  // takes `1 + owed` cells and settles the debt outright.
  return greedy(count, columns, columns);
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
};

/**
 * Turns one card's per-breakpoint span into the classes that state it.
 *
 * The base (single-column) layout is left alone — every card is already full
 * width there — so a card only carries a class from the breakpoint at which its
 * width actually changes, including the `col-span-1` that walks a widened card
 * back down again when the wider grid no longer needs it. A breakpoint with no
 * entry inherits the one below it, which is what CSS would do anyway.
 */
function toCell(spanAt: Partial<Record<Breakpoint, number>>): BentoCell {
  const classes: string[] = [];
  const wideAt: Record<Breakpoint, boolean> = { sm: false, md: false, lg: false };
  let inherited = 1; // the base layout is one column, so one cell each

  for (const bp of ORDER) {
    const span = spanAt[bp] ?? inherited;
    if (span !== inherited) classes.push(spanClass(bp, span));
    wideAt[bp] = span > 1;
    inherited = span;
  }

  return { span: classes.join(" "), wideAt };
}

/**
 * Lays `count` cards out over a grid whose column count changes with the
 * viewport — `{ sm: 2, lg: 3 }` for the usual `sm:grid-cols-2 lg:grid-cols-3`.
 *
 * ```tsx
 * const cells = bento(items.length, { sm: 2, lg: 3 });
 * items.map((item, i) => <Card key={item.id} className={cells[i].span} />)
 * ```
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
    const spanAt: Partial<Record<Breakpoint, number>> = {};
    for (const bp of active) spanAt[bp] = perBreakpoint.get(bp)![i];
    return toCell(spanAt);
  });
}

/**
 * The span for the **last** card of a grid whose other `count - 1` cards all
 * have to stay one column wide.
 *
 * The blog index is that grid: widening the newest posts to square the rows off
 * made the first two rows read as a different, two-column layout, so the post
 * cards are left alone and the call-to-action card at the very end carries the
 * remainder. It can: the cells left in its row are exactly the cells the grid
 * is short, so growing into them fits precisely and wraps nothing.
 *
 * Pass the count of *every* cell in the grid, cards at the end included.
 */
export function bentoTail(
  count: number,
  columns: Partial<Record<Breakpoint, number>>,
): BentoCell {
  const spanAt: Partial<Record<Breakpoint, number>> = {};

  for (const bp of ORDER) {
    const cols = columns[bp] ?? 0;
    if (count > 0 && cols >= 2) spanAt[bp] = 1 + ((cols - (count % cols)) % cols);
  }

  return toCell(spanAt);
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
 * What is tracked is the layout the element is *in*, not the width the card
 * has: a breakpoint the caller left out of the map emits nothing and so changes
 * nothing, and the next breakpoint that does have an entry still has to state
 * it. Tracking the width instead would emit an "undo" class for a form the
 * element never took.
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
  let applied = false; // the base layout is always the narrow one

  for (const bp of ORDER) {
    if (cell.wideAt[bp] === applied) continue;
    const next = cell.wideAt[bp] ? wide[bp] : narrow[bp];
    if (!next) continue;
    classes.push(next);
    applied = cell.wideAt[bp];
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
