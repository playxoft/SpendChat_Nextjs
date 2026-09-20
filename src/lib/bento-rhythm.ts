import type { BentoCell } from "@/lib/grid-fill";

/**
 * An editorial bento rhythm for a long directory, on a six-column grid.
 *
 * `grid-fill.ts` solves a narrower problem — take a three-column grid and widen
 * whatever it takes to stop the last row having a hole — and it caps at four
 * columns by design. That produces a grid that is *tidy*, which is exactly the
 * complaint about the home page's feature index: thirteen near-identical cards,
 * three across, reading as a table of contents rather than a showcase.
 *
 * This module answers a different question: given n entries, what sequence of
 * widths makes a page worth looking at while still filling every row? Six
 * columns is what makes that possible, because 6 divides by 2 and by 3 — so a
 * row can be `[3,3]`, `[2,2,2]`, `[4,2]` or `[2,4]`, and the layout can change
 * its mind row to row without ever leaving a gap.
 *
 * The shape is:
 *
 * ```
 *   ┌───────────┬───────────┐   lead: half width, two rows tall
 *   │           │  second   │
 *   │   lead    ├───────────┤
 *   │           │   third   │
 *   ├─────┬─────┼─────┬─────┤
 *   │  2  │  2  │  2  │ …   │   then rows of [2,2,2] / [3,3] / [4,2] / [2,4]
 *   └─────┴─────┴─────┴─────┘
 * ```
 *
 * **Why it is computed rather than written out.** The feature registry grows,
 * and `published: false` entries drop out in production, so the count differs
 * between what you see locally and what ships. A hand-tuned thirteen-card
 * layout is correct exactly once. This takes n and always returns whole rows —
 * the same reasoning `bentoTail` applies to the blog index.
 */

/**
 * Tailwind utilities written out in full: the scanner only ships a class it can
 * find as a literal, so these cannot be built from the span number.
 *
 * Every card is full width on mobile and half width at `sm`; only `lg` takes
 * the rhythm. Two breakpoints of stacking is deliberate — a card given a sixth
 * of a 1152px page has under 180px to hold an icon, a label and a line of
 * prose, which is a column of broken words rather than a bento.
 */
const LG_SPAN: Record<number, string> = {
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  6: "lg:col-span-6",
};

/** The grid this module dresses. `sm:col-span-3` of six is a half-width card. */
export const RHYTHM_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-6";

const BASE = "sm:col-span-3";

/** Row templates, by how many cards they hold. Cycled for variety. */
const ROWS_OF_TWO = [
  [3, 3],
  [4, 2],
  [2, 4],
];
const ROWS_OF_THREE = [[2, 2, 2]];

/**
 * Split `n` cards into rows of two or three.
 *
 * Every integer above one is some sum of twos and threes, so this only fails
 * for n = 1 — which gets a single full-width row instead. Threes are preferred
 * (a denser, more interesting page), and a remainder of one is absorbed by
 * trading a three for two twos rather than leaving a single card to stretch
 * across the width.
 */
function rowSizes(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];
  // Two-card rows are preferred, which is the opposite of what you'd guess.
  // On a six-column grid a three-card row can only ever be `[2,2,2]` — there
  // is no second way to split six into three usable widths — so a layout built
  // from threes repeats one shape and reads as a plain grid. Two-card rows have
  // three shapes (`[3,3]`, `[4,2]`, `[2,4]`), so leaning on them is what makes
  // the block look composed rather than tiled.
  const sizes: number[] = new Array(Math.floor((n - (n % 2 === 0 ? 0 : 3)) / 2)).fill(2);
  // An odd count needs exactly one three-card row to come out even.
  if (n % 2 === 1) sizes.splice(1, 0, 3);
  return sizes;
}

function cell(lgSpan: number, extra = ""): BentoCell {
  const classes = [BASE, LG_SPAN[lgSpan] ?? LG_SPAN[2], extra].filter(Boolean);
  return {
    span: classes.join(" "),
    // Every card keeps the stacked layout — icon above the text — even the wide
    // ones, which is the opposite of what `grid-fill.ts` does and is right here
    // for a reason that only shows up in a mixed-width row.
    //
    // Turning a card side-on makes its content *shorter* (icon and text share a
    // line). A row's height is set by its tallest card, so a wide side-on card
    // next to a narrow stacked one ends up with the difference as dead space:
    // the 4/6 lead sat ~100px short of the 2/6 card beside it. Keeping everyone
    // stacked means the only height difference left is whether a blurb wraps to
    // a second line, which is a line, not a hole.
    wideAt: { sm: false, md: false, lg: false },
  };
}

/**
 * One `BentoCell` per card, in order.
 *
 * The lead card is half width and two rows tall, so the two cards after it
 * stack down its side and the grid opens with something other than a row of
 * equal tiles. Below that, `rowSizes` decides the rhythm.
 */
export function rhythmCells(count: number): BentoCell[] {
  if (count <= 0) return [];
  if (count < 3) return Array.from({ length: count }, () => cell(3));

  // The lead is **wide, not tall**, and that was a correction made on screen.
  // A two-row-tall lead looked right in the abstract and was wrong in the
  // browser: a feature card holds an icon, a label, a one-line blurb and a
  // link, which is about 160px of content. Given 384px of height it showed
  // 220px of empty card, and no amount of copy fixes that without turning one
  // directory entry into an essay. Width is emphasis this content can actually
  // fill, and with every card one row tall no card can have vertical slack at
  // all — each row is simply as tall as its own tallest card.
  const cells: BentoCell[] = [cell(4), cell(2)];

  let twoIdx = 0;
  let threeIdx = 0;
  for (const size of rowSizes(count - 2)) {
    if (size === 1) {
      cells.push(cell(6));
      continue;
    }
    const template =
      size === 3
        ? ROWS_OF_THREE[threeIdx++ % ROWS_OF_THREE.length]!
        : ROWS_OF_TWO[twoIdx++ % ROWS_OF_TWO.length]!;
    for (const span of template) cells.push(cell(span));
  }
  return cells;
}

/**
 * Split `items` into `columns` lists of roughly equal *rendered* height,
 * preserving nothing about the original order beyond a stable assignment.
 *
 * Used by the "Who it's for" wall, which has to end flush along the bottom.
 * CSS multi-column balances by content and leaves three ragged ends; a grid
 * with one card per cell stretches every card in a row to match its tallest
 * sibling. The way to get both — natural card heights *and* a straight bottom
 * edge — is to own the distribution: pack the columns evenly here, then let the
 * last card in each column absorb whatever slack is left.
 *
 * Height is estimated from text length, which is crude but monotonic and, more
 * to the point, available at build time. The alternative is measuring in the
 * browser, which costs a client component and a layout pass on every resize for
 * a wall of static prose.
 */
export function balanceColumns<T>(
  items: T[],
  columns: number,
  weigh: (item: T) => number,
): T[][] {
  const cols: T[][] = Array.from({ length: columns }, () => []);
  const totals = new Array<number>(columns).fill(0);
  // **In authored order**, each item going to whichever column is shortest so
  // far. Sorting longest-first packs marginally tighter and was tried first,
  // but it is wrong here for two reasons that only showed up on screen: it puts
  // the three longest entries at the top of the three columns, so the first row
  // comes out the same height and reads as the grid this replaced; and it
  // discards the order the entries were written in, which is a deliberate
  // sequence, not an arbitrary list.
  //
  // The looser packing it costs is absorbed by the cards growing into the
  // slack, so the only thing lost is a few pixels of padding nobody can see.
  for (const item of items) {
    let target = 0;
    for (let i = 1; i < columns; i++) if (totals[i]! < totals[target]!) target = i;
    cols[target]!.push(item);
    totals[target]! += weigh(item);
  }
  return cols;
}
