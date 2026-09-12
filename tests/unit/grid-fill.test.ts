import { describe, it, expect } from "vitest";

import { bento, bentoRow, bentoTail, bentoVariant, fillSpans } from "@/lib/grid-fill";

/**
 * Replays CSS grid auto-placement over a set of spans and reports the cells
 * nobody occupies. This is the property the whole module exists for: a span
 * wide enough to matter but placed mid-row wraps, and the gap it leaves behind
 * is the very thing we were removing. Counting the total and calling it even
 * would miss that — the sum can divide perfectly while a hole sits in row one.
 */
function emptyCells(spans: number[], columns: number): number {
  let column = 0;
  let wrapped = 0;
  for (const span of spans) {
    if (column + span > columns) {
      wrapped += columns - column; // the tail of the row the card skipped
      column = 0;
    }
    column = (column + span) % columns;
  }
  return wrapped + (column === 0 ? 0 : columns - column);
}

describe("fillSpans", () => {
  it("leaves an exact fit alone", () => {
    expect(fillSpans(6, 3)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(fillSpans(4, 2)).toEqual([1, 1, 1, 1]);
  });

  it("widens the first card when three columns are one short", () => {
    // Five cards, three columns: the first takes two cells, the rest follow.
    expect(fillSpans(5, 3)).toEqual([2, 1, 1, 1, 1]);
  });

  it("spreads the remainder over two cards when one can't cover it", () => {
    // Four cards owe two cells. The second can't be widened — only one cell is
    // left in its row — so the third takes the other.
    expect(fillSpans(4, 3, 2)).toEqual([2, 1, 2, 1]);
  });

  it("uses one full-width card when nothing caps the span", () => {
    expect(fillSpans(4, 3)).toEqual([3, 1, 1, 1]);
  });

  it("drops the cap rather than leave a remainder", () => {
    // One card in three columns can't be evened out two cells at a time.
    expect(fillSpans(1, 3, 2)).toEqual([3]);
  });

  it("fills whole rows, with no gaps, for every shape a registry can reach", () => {
    for (let columns = 2; columns <= 4; columns++) {
      for (let count = 1; count <= 40; count++) {
        for (const maxSpan of [2, columns]) {
          const spans = fillSpans(count, columns, maxSpan);
          expect(spans).toHaveLength(count);
          expect(
            emptyCells(spans, columns),
            `count=${count} columns=${columns} maxSpan=${maxSpan} → ${spans}`,
          ).toBe(0);
        }
      }
    }
  });

  it("never widens a card past the grid", () => {
    for (let columns = 2; columns <= 4; columns++) {
      for (let count = 1; count <= 40; count++) {
        for (const span of fillSpans(count, columns)) {
          expect(span).toBeGreaterThanOrEqual(1);
          expect(span).toBeLessThanOrEqual(columns);
        }
      }
    }
  });

  it("has nothing to do for a single-column grid", () => {
    expect(fillSpans(5, 1)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("bento", () => {
  it("emits a class only where a card's width changes", () => {
    // Thirteen cards: two columns need one widened card, three need two. The
    // base layout is single-column, so the first card's `sm` span is the only
    // one it has to state, and the third only differs from `lg`.
    const cells = bento(13, { sm: 2, lg: 3 }, 2);
    expect(cells[0].span).toBe("sm:col-span-2");
    expect(cells[1].span).toBe("");
    expect(cells[2].span).toBe("lg:col-span-2");
    expect(cells.slice(3).every((c) => c.span === "")).toBe(true);
  });

  it("reports which breakpoints a card is actually wide at", () => {
    const cells = bento(13, { sm: 2, lg: 3 }, 2);
    // Widened at `sm` and still widened once the grid gains a third column.
    expect(cells[0].wideAt).toEqual({ sm: true, md: true, lg: true });
    // Only the three-column layout needs this one — it is a plain card on a
    // tablet, and must not be laid out as though it weren't.
    expect(cells[2].wideAt).toEqual({ sm: false, md: false, lg: true });
    expect(cells[1].wideAt).toEqual({ sm: false, md: false, lg: false });
  });

  it("walks a widened card back down where the wider grid doesn't need it", () => {
    // Nine cards: two columns want the first widened, three columns divide
    // evenly already — so the `sm` span has to be undone explicitly, or it
    // would carry upward and push the ninth card onto a row of its own.
    const cell = bento(9, { sm: 2, lg: 3 })[0];
    expect(cell.span).toBe("sm:col-span-2 lg:col-span-1");
    expect(cell.wideAt).toEqual({ sm: true, md: true, lg: false });
  });

  it("says nothing when every breakpoint already divides evenly", () => {
    expect(bento(6, { sm: 2, lg: 3 }).every((c) => c.span === "")).toBe(true);
  });

  it("refuses a grid wider than the utilities written out for it", () => {
    // The failure this replaces was silent: the span table stopped at four, a
    // fifth column looked up `undefined`, `join` dropped it, and the card
    // rendered one column wide — the exact hole the module exists to close.
    expect(() => bento(1, { lg: 5 })).toThrow(/col-span-5/);
  });

  it("ignores breakpoints that aren't multi-column", () => {
    const cells = bento(5, { sm: 1, lg: 3 });
    expect(cells.map((c) => c.span)).toEqual(["lg:col-span-2", "", "", "", ""]);
    expect(cells[0].wideAt).toEqual({ sm: false, md: false, lg: true });
  });

  it("returns one entry per card", () => {
    expect(bento(0, { sm: 2, lg: 3 })).toEqual([]);
    expect(bento(7, { sm: 2, lg: 3 })).toHaveLength(7);
  });
});

describe("bentoVariant", () => {
  const cells = bento(13, { sm: 2, lg: 3 }, 2);

  it("turns a card side-on at the breakpoint it widens at, not before", () => {
    // The regression this exists for: card three is one column wide until `lg`,
    // and laying it out in a row from `sm` leaves it cramped on every tablet.
    expect(bentoRow(cells[2])).toBe("lg:flex-row");
    expect(bentoRow(cells[0])).toBe("sm:flex-row");
  });

  it("says nothing for a card that is never widened", () => {
    expect(bentoRow(cells[1])).toBe("");
  });

  it("undoes the wide form where the card narrows again", () => {
    expect(bentoRow(bento(9, { sm: 2, lg: 3 })[0])).toBe("sm:flex-row lg:flex-col");
  });

  it("states the class at the first breakpoint the caller gave one for", () => {
    // Card one is wide from `sm`, but a map with only an `lg` entry leaves it
    // in the narrow layout until `lg` — so `lg` still has to state the flip.
    // Tracking the card's width instead of the layout it is actually in is
    // what used to swallow this.
    expect(bentoVariant(cells[0], { lg: "lg:flex-row" })).toBe("lg:flex-row");
    expect(bentoVariant(cells[2], { lg: "lg:flex-row" })).toBe("lg:flex-row");
  });

  it("doesn't undo a form the element never took", () => {
    // Wide at `sm`/`md`, narrow again at `lg`. With no `sm` entry the element
    // never turned side-on, so there is nothing for `lg` to walk back.
    const cell = bento(9, { sm: 2, lg: 3 })[0];
    expect(bentoVariant(cell, { lg: "lg:flex-row" }, { lg: "lg:flex-col" })).toBe("");
  });
});

describe("bentoTail", () => {
  /** What the blog index does: every card one wide, the last one widened. */
  function tailSpans(count: number, columns: number): number[] {
    const cell = bentoTail(count, { sm: columns });
    const match = /sm:col-span-(\d+)/.exec(cell.span);
    return [...Array(Math.max(count - 1, 0)).fill(1), match ? Number(match[1]) : 1];
  }

  it("leaves the last card alone when the count already divides", () => {
    expect(bentoTail(6, { sm: 2, lg: 3 }).span).toBe("");
    expect(bentoTail(4, { sm: 2 }).span).toBe("");
  });

  it("widens the last card by exactly the cells its row has left", () => {
    // Thirteen posts plus the two cards after them: fifteen cells, which three
    // columns divide and two don't.
    expect(bentoTail(15, { sm: 2, lg: 3 }).span).toBe("sm:col-span-2 lg:col-span-1");
    // A fourteenth post moves the remainder to the other breakpoint — the last
    // card takes the whole three-column row it would otherwise sit alone in —
    // with no hand-written class to go stale.
    expect(bentoTail(16, { sm: 2, lg: 3 }).span).toBe("lg:col-span-3");
  });

  it("fills whole rows, with no gaps, for every count a registry can reach", () => {
    for (let columns = 2; columns <= 4; columns++) {
      for (let count = 1; count <= 40; count++) {
        const spans = tailSpans(count, columns);
        expect(
          emptyCells(spans, columns),
          `count=${count} columns=${columns} → ${spans}`,
        ).toBe(0);
      }
    }
  });

  it("has nothing to say for an empty grid", () => {
    expect(bentoTail(0, { sm: 2, lg: 3 }).span).toBe("");
  });
});
