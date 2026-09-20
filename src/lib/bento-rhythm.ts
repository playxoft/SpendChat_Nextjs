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

/**
 * The `lg` width class for a span, for the other bento on the site.
 *
 * `BentoShowcase` dresses a six-column grid too, and kept its own copy of this
 * map and of the row-splitting below. Two copies of the same maths, one of them
 * tested, is how the untested one drifts.
 */
export function lgSpanClass(span: number): string {
  return LG_SPAN[span] ?? LG_SPAN[2]!;
}

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
 * Split `n` cards into rows of two or three, as how many cards each row holds.
 *
 * Every integer above one is some sum of twos and threes, so this only fails
 * for n = 1 — which gets a single full-width row instead.
 *
 * `prefer` picks which size to lean on, because the two bentos on the site want
 * opposite answers and both are right for their own content:
 *
 * - **`"two"`** (the home index). On a six-column grid a three-card row can
 *   only ever be `[2,2,2]` — there is no second way to split six into three
 *   usable widths — so a layout built from threes repeats one shape and reads
 *   as a plain grid. Two-card rows have three shapes (`[3,3]`, `[4,2]`,
 *   `[2,4]`), so leaning on them is what makes the block look composed.
 * - **`"three"`** (the `/features` directory). Its cells carry a panel, a name
 *   and a blurb, so a half-width cell is a lot of card for one feature; thirds
 *   keep a thirteen-entry directory dense. A remainder of one is absorbed by
 *   trading a three for two twos rather than leaving a card to stretch across
 *   the full width.
 */
export function rowSizes(n: number, prefer: "two" | "three" = "two"): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];
  if (prefer === "three") {
    // Threes first, then whatever is left as two-card rows, so the dense rows
    // lead and the layout doesn't open on its widest cells.
    let threes = Math.floor(n / 3);
    if (n % 3 === 1 && threes > 0) threes -= 1;
    const left = n - threes * 3;
    const sizes = new Array<number>(threes).fill(3);
    for (let i = 0; i < Math.floor(left / 2); i++) sizes.push(2);
    if (left % 2 === 1) sizes.push(1);
    return sizes;
  }
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
 * Split `items` into `columns` lists of roughly equal *rendered* height, each
 * column a **contiguous run** of the original list.
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
 *
 * **Contiguity is the part that isn't obvious, and it is about the phone.**
 * Sorting longest-first was tried and rejected: it stacks the three longest
 * entries into the first row, which comes out level and reads as the grid this
 * replaced, and it throws away a written sequence. But assigning in authored
 * order to whichever column is currently shortest — the obvious fix — has its
 * own fault, and it only shows below `sm`, where the three column elements
 * stack. The wall is then read column-major: every card of column one, then
 * every card of column two. With round-robin assignment a phone reads the
 * scenarios 1, 4, 7, 10, …, which is the same discarded order by another route.
 *
 * Giving each column a contiguous run makes the two layouts agree: stacked, the
 * runs concatenate back into the authored order; side by side, each column
 * reads top to bottom as written. The cost is looser packing, since a run can't
 * skip a heavy entry — and that cost is already absorbed by the last card in
 * each column growing into the slack.
 *
 * The split minimises the tallest column (binary search on the height cap,
 * which is exact for contiguous runs), so "looser" is only ever by one entry.
 */
export function balanceColumns<T>(
  items: T[],
  columns: number,
  weigh: (item: T) => number,
): T[][] {
  const cols: T[][] = Array.from({ length: columns }, () => []);
  if (columns <= 0) return [];
  if (items.length === 0) return cols;

  const weights = items.map(weigh);

  /** Greedy fill under a height cap; returns the run lengths it needed. */
  function runsUnder(cap: number): number[] {
    const runs: number[] = [];
    let run = 0;
    let total = 0;
    for (const w of weights) {
      if (run > 0 && total + w > cap) {
        runs.push(run);
        run = 0;
        total = 0;
      }
      run += 1;
      total += w;
    }
    if (run > 0) runs.push(run);
    return runs;
  }

  // The cap is between the tallest single card (a run always holds at least
  // one) and the whole wall in one column.
  let lo = Math.max(...weights);
  let hi = weights.reduce((a, b) => a + b, 0);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (runsUnder(mid).length <= columns) hi = mid;
    else lo = mid + 1;
  }

  const runs = runsUnder(lo);
  // Fewer runs than columns means the cap packed them tighter than it had to
  // (or there are simply fewer items than columns). Split the longest run so
  // no column is left empty while another holds several cards.
  while (runs.length < columns && runs.some((r) => r > 1)) {
    let widest = 0;
    for (let i = 1; i < runs.length; i++) if (runs[i]! > runs[widest]!) widest = i;
    const half = Math.floor(runs[widest]! / 2);
    runs.splice(widest, 1, half, runs[widest]! - half);
  }

  let at = 0;
  runs.forEach((length, i) => {
    if (i < columns) cols[i] = items.slice(at, at + length);
    else cols[columns - 1] = [...cols[columns - 1]!, ...items.slice(at, at + length)];
    at += length;
  });
  return cols;
}
