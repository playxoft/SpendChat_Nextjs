import { describe, expect, it } from "vitest";
import {
  applyPercent,
  discount,
  percentChange,
  percentDifference,
  percentOf,
  whatPercent,
} from "@/lib/tools/percentage";

describe("percentOf", () => {
  it("takes a percentage of a value", () => {
    expect(percentOf(15, 200)).toBe(30);
    expect(percentOf(0, 200)).toBe(0);
    expect(percentOf(150, 40)).toBe(60);
  });
});

describe("whatPercent", () => {
  it("expresses a part as a percentage of the whole", () => {
    expect(whatPercent(30, 200)).toBe(15);
    expect(whatPercent(50, 40)).toBe(125);
  });

  it("has no answer against a zero whole", () => {
    expect(whatPercent(5, 0)).toBeNull();
  });
});

describe("percentChange", () => {
  it("measures a rise and a fall", () => {
    expect(percentChange(80, 100)).toBe(25);
    expect(percentChange(100, 80)).toBe(-20);
  });

  it("reads a rise from a negative start as positive", () => {
    expect(percentChange(-50, -25)).toBe(50);
  });

  it("has no answer from zero", () => {
    expect(percentChange(0, 10)).toBeNull();
  });
});

describe("applyPercent", () => {
  it("increases and decreases", () => {
    expect(applyPercent(200, 10, "up")).toBeCloseTo(220);
    expect(applyPercent(200, 10, "down")).toBeCloseTo(180);
  });
});

describe("percentDifference", () => {
  it("is symmetric", () => {
    expect(percentDifference(40, 60)).toBeCloseTo(40);
    expect(percentDifference(60, 40)).toBeCloseTo(40);
  });

  it("has no answer when both are zero", () => {
    expect(percentDifference(0, 0)).toBeNull();
  });
});

describe("discount", () => {
  it("returns the saving and the sale price", () => {
    expect(discount(1200, 25)).toEqual({ saving: 300, final: 900 });
  });
});
