import { describe, expect, it } from "vitest";
import {
  SHIFT_EPSILON_PX,
  anchorShift,
  dayScrollTop,
  docTopFrom,
  firstIndexBelow,
} from "@/lib/scroll-anchor";

type Node = { offsetTop: number; parent: Node | null };
const link = (n: Node) => ({ top: n.offsetTop, parent: n.parent });

describe("docTopFrom", () => {
  it("sums the offset chain up to the root", () => {
    const body: Node = { offsetTop: 0, parent: null };
    const column: Node = { offsetTop: 120, parent: body };
    const row: Node = { offsetTop: 340, parent: column };
    expect(docTopFrom(row, link)).toBe(460);
  });

  it("is the element's own offset when its parent is the root", () => {
    expect(docTopFrom({ offsetTop: 75, parent: null }, link)).toBe(75);
  });
});

describe("firstIndexBelow", () => {
  // Rows 100px tall, stacked from y=0: bottoms 100, 200, … 1000.
  const bottoms = Array.from({ length: 10 }, (_, i) => (i + 1) * 100);
  const at = (line: number) => firstIndexBelow(bottoms.length, (i) => bottoms[i], line);

  it("finds the first row whose bottom is below the line", () => {
    expect(at(0)).toBe(0);
    expect(at(150)).toBe(1);
    expect(at(999)).toBe(9);
  });

  it("skips a row whose bottom sits exactly on the line — it's fully hidden", () => {
    expect(at(100)).toBe(1);
    expect(at(500)).toBe(5);
  });

  it("is -1 past the last row, and for no rows at all", () => {
    expect(at(1000)).toBe(-1);
    expect(at(5000)).toBe(-1);
    expect(firstIndexBelow(0, () => 0, 0)).toBe(-1);
  });

  it("reads only a logarithmic handful of rows", () => {
    let reads = 0;
    const n = 4096;
    const index = firstIndexBelow(n, (i) => (reads++, (i + 1) * 10), 20_000);
    expect(index).toBe(2000);
    expect(reads).toBeLessThanOrEqual(13);
  });
});

describe("anchorShift", () => {
  it("scrolls by exactly how far the row moved — down for content added above", () => {
    expect(anchorShift(900, 2900)).toBe(2000);
  });

  it("and up for content removed above", () => {
    expect(anchorShift(900, 820)).toBe(-80);
  });

  it("ignores sub-pixel rounding", () => {
    expect(anchorShift(900, 900)).toBe(0);
    expect(anchorShift(900, 900 + SHIFT_EPSILON_PX / 2)).toBe(0);
    expect(anchorShift(900, 900 - SHIFT_EPSILON_PX / 2)).toBe(0);
    expect(anchorShift(900, 900 + SHIFT_EPSILON_PX)).toBe(SHIFT_EPSILON_PX);
  });
});

describe("dayScrollTop", () => {
  const page = { headerBottom: 130, gap: 8, scrollHeight: 6000, viewportHeight: 800 };

  it("puts the day's top edge the gap below the header", () => {
    // 2000 - 130 - 8: the day then sits at 138px on screen.
    expect(dayScrollTop({ ...page, dayTop: 2000 })).toBe(1862);
  });

  it("can't scroll past the end — the newest days stay where the page ends", () => {
    expect(dayScrollTop({ ...page, dayTop: 5900 })).toBe(5200);
  });

  it("can't scroll above the top — the first day stays under the header", () => {
    expect(dayScrollTop({ ...page, dayTop: 60 })).toBe(0);
  });

  it("is 0 on a page too short to scroll", () => {
    expect(dayScrollTop({ ...page, dayTop: 400, scrollHeight: 600 })).toBe(0);
  });
});
