import { describe, expect, it } from "vitest";
import { balanceColumns, rhythmCells } from "@/lib/bento-rhythm";

/** The `lg` width a cell claims, in columns out of six. */
function lgSpan(span: string): number {
  const m = /lg:col-span-(\d)/.exec(span);
  return m ? Number(m[1]) : 3;
}

/** Every card grouped into the row it lands in. No cell spans rows. */
function rowsAfterLead(count: number): number[][] {
  const spans = rhythmCells(count).map((c) => lgSpan(c.span));
  const rows: number[][] = [];
  let row: number[] = [];
  let width = 0;
  for (const span of spans) {
    row.push(span);
    width += span;
    if (width === 6) {
      rows.push(row);
      row = [];
      width = 0;
    }
  }
  if (row.length) rows.push(row); // a partial row is a bug; surfaced by the tests
  return rows;
}

describe("rhythmCells", () => {
  it("returns one cell per item", () => {
    for (let n = 0; n <= 40; n++) expect(rhythmCells(n)).toHaveLength(n);
  });

  it("opens with a lead that is wide, and never tall", () => {
    const [lead, second] = rhythmCells(13);
    expect(lgSpan(lead!.span)).toBe(4);
    expect(lgSpan(second!.span)).toBe(2);
    // Height is the point: a feature card has ~160px of content, so a card
    // given two rows shows an empty half. No cell may span rows.
    for (const c of rhythmCells(13)) expect(c.span).not.toContain("row-span");
  });

  it("fills whole rows for every count — no stranded card", () => {
    // The guard that matters: the registry grows, and `published: false`
    // entries drop out in production, so the count that ships is not the one
    // anyone laid out by hand.
    for (let n = 4; n <= 40; n++) {
      const rows = rowsAfterLead(n);
      for (const row of rows) {
        const width = row.reduce((a, b) => a + b, 0);
        expect(width, `count ${n} left a row of width ${width}`).toBe(6);
      }
    }
  });

  it("varies the row density instead of repeating one shape", () => {
    // Thirteen is today's feature count. It should not come out as four
    // identical thirds-rows, which is the layout this module replaced.
    const rows = rowsAfterLead(13);
    const shapes = new Set(rows.map((r) => r.join("-")));
    expect(shapes.size).toBeGreaterThan(1);
  });

  it("degrades to plain half-width cards when there are too few to lead", () => {
    for (const n of [1, 2]) {
      for (const c of rhythmCells(n)) {
        expect(c.span).toContain("lg:col-span-3");
        expect(c.span).not.toContain("row-span");
      }
    }
  });

  it("never turns a card side-on", () => {
    // A side-on card is shorter than a stacked one, and a row is as tall as its
    // tallest card — so a wide side-on lead beside a narrow stacked card leaves
    // the difference as dead space. Measured at ~100px before this was fixed.
    for (const c of rhythmCells(13)) expect(c.wideAt.lg).toBe(false);
  });
});

describe("balanceColumns", () => {
  it("keeps every item exactly once", () => {
    const items = Array.from({ length: 16 }, (_, i) => i);
    const cols = balanceColumns(items, 3, (n) => n + 1);
    expect(cols.flat().sort((a, b) => a - b)).toEqual(items);
  });

  it("packs columns to within the largest single item", () => {
    // The point of the wall: three columns that end near enough level that the
    // last card in each absorbs the slack without a visible gap.
    const weights = [180, 60, 240, 90, 150, 300, 45, 210, 120, 75, 260, 30];
    const cols = balanceColumns(weights, 3, (n) => n);
    const totals = cols.map((c) => c.reduce((a, b) => a + b, 0));
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(
      Math.max(...weights),
    );
  });

  it("handles fewer items than columns without emitting undefined", () => {
    const cols = balanceColumns([1, 2], 3, (n) => n);
    expect(cols).toHaveLength(3);
    expect(cols.flat()).toEqual([1, 2]);
  });

  it("preserves authored order within each column", () => {
    // The entries are a written sequence, not a bag. Sorting them by length
    // also made the first row three equal heights, which reads as the grid the
    // wall replaced.
    const items = Array.from({ length: 16 }, (_, i) => i);
    for (const col of balanceColumns(items, 3, () => 10)) {
      expect(col).toEqual([...col].sort((a, b) => a - b));
    }
  });

  it("does not stack the longest entries into the first row", () => {
    const weights = [300, 40, 40, 290, 40, 40, 280, 40, 40];
    const cols = balanceColumns(weights, 3, (n) => n);
    const firstRow = cols.map((c) => c[0]);
    expect(new Set(firstRow).size).toBeGreaterThan(1);
  });
});
