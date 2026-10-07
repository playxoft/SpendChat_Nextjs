import { describe, it, expect } from "vitest";
import {
  evenSliders,
  moveSlider,
  rescaleSliders,
  sliderStep,
  slidersFrom,
  snapToTotal,
  syncSliders,
  withPeople,
  type SliderState,
} from "@/lib/split-sliders";
import { computeShares } from "@/lib/split-math";

const sum = (s: SliderState) => s.ids.reduce((a, id) => a + s.values[id]!, 0);
const vals = (s: SliderState) => s.ids.map((id) => s.values[id]);

describe("evenSliders", () => {
  it("divides evenly, leftover units one each in the given order", () => {
    expect(vals(evenSliders(["a", "b", "c"], 10_000))).toEqual([3334, 3333, 3333]);
    expect(vals(evenSliders(["a", "b", "c"], 10_000, ["c", "a", "b"]))).toEqual([3333, 3333, 3334]);
    expect(vals(evenSliders(["a", "b", "c"], 2))).toEqual([1, 1, 0]);
    expect(evenSliders([], 500)).toMatchObject({ ids: [], values: {}, total: 500 });
  });

  it("matches what an equal split stores when given the split's order", () => {
    const ids = ["a", "b", "c"];
    const shares = computeShares(10_000, "b", { type: "equal", memberIds: ids });
    const even = evenSliders(ids, 10_000, shares.map((s) => s.memberId));
    expect(Object.fromEntries(shares.map((s) => [s.memberId, s.amountMinor]))).toEqual(even.values);
  });
});

describe("moveSlider", () => {
  it("takes from the people you haven't touched, in proportion", () => {
    const start = evenSliders(["a", "b", "c"], 9000);
    const moved = moveSlider(start, "a", 5000);
    expect(vals(moved)).toEqual([5000, 2000, 2000]);
    expect(moved.touched).toEqual(["a"]);
    // b is touched now, so only c (untouched) moves.
    const again = moveSlider(moved, "b", 3000);
    expect(vals(again)).toEqual([5000, 3000, 1000]);
  });

  it("gives back to the untouched people, evenly when they all have nothing", () => {
    const start = moveSlider(evenSliders(["a", "b", "c"], 9000), "a", 9000);
    expect(vals(start)).toEqual([9000, 0, 0]);
    expect(vals(moveSlider(start, "a", 3001))).toEqual([3001, 3000, 2999]);
  });

  it("once the untouched are spent, the slider touched longest ago gives way first", () => {
    let s = evenSliders(["a", "b", "c"], 9000);
    s = moveSlider(s, "a", 4000); // b, c: 2500 each
    s = moveSlider(s, "b", 3000); // c: 2000
    s = moveSlider(s, "c", 4000); // nobody untouched: a (oldest) gives 2000
    expect(vals(s)).toEqual([2000, 3000, 4000]);
    expect(s.touched).toEqual(["a", "b", "c"]);
    s = moveSlider(s, "c", 8000); // a gives its 2000, then b 2000
    expect(vals(s)).toEqual([0, 1000, 8000]);
    s = moveSlider(s, "c", 7000); // giving back: the oldest touched (a) gets it
    expect(vals(s)).toEqual([1000, 1000, 7000]);
  });

  it("always adds up, clamps to 0…total, and leaves one person holding everything", () => {
    let s = evenSliders(["a", "b", "c", "d"], 12_345);
    for (const [id, v] of [
      ["a", 99_999],
      ["b", -5],
      ["c", 4321.6],
      ["d", 0],
      ["a", 1],
      ["b", 12_345],
    ] as const) {
      s = moveSlider(s, id, v);
      expect(sum(s)).toBe(12_345);
      expect(Object.values(s.values).every((v) => v >= 0)).toBe(true);
    }
    expect(s.values.b).toBe(12_345);
    expect(vals(moveSlider(evenSliders(["solo"], 700), "solo", 5))).toEqual([700]);
  });
});

describe("rescaleSliders, withPeople, syncSliders", () => {
  it("a new total keeps everyone's proportion", () => {
    const s = moveSlider(evenSliders(["a", "b"], 1000), "a", 750);
    const r = rescaleSliders(s, 2000);
    expect(vals(r)).toEqual([1500, 500]);
    expect(r.touched).toEqual(["a"]);
    expect(vals(rescaleSliders(evenSliders(["a", "b"], 0), 900))).toEqual([450, 450]);
  });

  it("people coming and going: even again if nothing was adjusted, otherwise as if their slider moved", () => {
    const even = evenSliders(["a", "b"], 9000);
    expect(vals(withPeople(even, ["a", "b", "c"]))).toEqual([3000, 3000, 3000]);

    const adjusted = moveSlider(evenSliders(["a", "b", "c"], 9000), "a", 6000); // b, c: 1500
    const without = withPeople(adjusted, ["a", "b"]); // c's 1500 goes to b (untouched)
    expect(vals(without)).toEqual([6000, 3000]);
    const withD = withPeople(adjusted, ["a", "b", "c", "d"]); // d takes 2250 from b, c
    expect(sum(withD)).toBe(9000);
    expect(withD.values.a).toBe(6000);
    expect(withD.values.d).toBe(2250);
    expect(withD.touched).toEqual(["a"]);
  });

  it("syncSliders starts even, then follows the total and the people", () => {
    const s = syncSliders(null, ["a", "b"], 100);
    expect(vals(s)).toEqual([50, 50]);
    expect(vals(syncSliders(s, ["a", "b", "c"], 300))).toEqual([100, 100, 100]);
  });

  it("slidersFrom keeps saved values that add up, and starts even otherwise", () => {
    expect(vals(slidersFrom(["a", "b"], 1000, { a: 300, b: 700 }))).toEqual([300, 700]);
    expect(vals(slidersFrom(["a", "b"], 1000, { a: 300, b: 600 }))).toEqual([500, 500]);
    expect(vals(slidersFrom(["a", "b"], 1000, { a: 300 }))).toEqual([500, 500]);
  });
});

describe("sliderStep", () => {
  it("is a round number giving about 100 positions", () => {
    expect(sliderStep(10_000)).toBe(100); // percent: 1%
    expect(sliderStep(9000, 200)).toBe(20);
    expect(sliderStep(100_000, 200)).toBe(500);
    expect(sliderStep(60)).toBe(1);
  });
});

describe("snapToTotal", () => {
  it("lets a slider reach a total that isn't a multiple of its step", () => {
    // ₹1,201 in ₹5 steps: Radix stops at ₹1,200 — within a step of the end is the end.
    expect(snapToTotal(120_000, 120_100, 500)).toBe(120_100);
    expect(snapToTotal(119_500, 120_100, 500)).toBe(119_500);
    expect(snapToTotal(120_100, 120_100, 500)).toBe(120_100);
    expect(snapToTotal(0, 120_100, 500)).toBe(0);
  });
});
