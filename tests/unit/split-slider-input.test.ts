import { describe, it, expect } from "vitest";
import {
  commitSliderText,
  committedUnits,
  inputHint,
  moneyInput,
  percentInput,
} from "@/lib/split-slider-input";
import { evenSliders } from "@/lib/split-sliders";

const vals = (s: { ids: string[]; values: Record<string, number> }) => s.ids.map((id) => s.values[id]);

describe("the number box beside a split slider", () => {
  it("commits like a slider move: the people you haven't touched rebalance", () => {
    const inr = moneyInput("INR", "en-IN");
    const start = evenSliders(["a", "b", "c"], 9000); // ₹90 three ways
    const next = commitSliderText(start, "a", "50", inr);
    expect(vals(next)).toEqual([5000, 2000, 2000]);
    expect(next.touched).toEqual(["a"]);
    // A percent box: 50% of three, the other two share the rest.
    const pct = commitSliderText(evenSliders(["a", "b", "c"], 10_000), "b", "50", percentInput("en-IN"));
    expect(vals(pct)).toEqual([2500, 5000, 2500]);
  });

  it("clamps to 0…total, and leaves things alone when it isn't a number", () => {
    const inr = moneyInput("INR", "en-IN");
    const start = evenSliders(["a", "b"], 120_000); // ₹1,200
    expect(vals(commitSliderText(start, "a", "5,00,000", inr))).toEqual([120_000, 0]);
    expect(vals(commitSliderText(start, "a", "-20", inr))).toEqual([0, 120_000]);
    expect(commitSliderText(start, "a", "", inr)).toBe(start);
    expect(commitSliderText(start, "a", "abc", inr)).toBe(start);
    expect(committedUnits("250", percentInput("en-US"), 10_000)).toBe(10_000);
  });

  it("reads the viewer's number format and any keypad's digits", () => {
    expect(committedUnits("1.234,50", moneyInput("EUR", "de-DE"), 1_000_000)).toBe(123_450);
    expect(committedUnits("33,5", percentInput("de-DE"), 10_000)).toBe(3350);
    expect(committedUnits("१२३", moneyInput("INR", "hi-IN"), 1_000_000)).toBe(12_300);
    expect(committedUnits("٤٥", percentInput("ar-EG"), 10_000)).toBe(4500);
    // Percents keep two decimals; a yen has none.
    expect(committedUnits("33.336", percentInput("en-US"), 10_000)).toBe(3334);
    expect(committedUnits("1200.4", moneyInput("JPY", "ja-JP"), 5000)).toBe(1200);
  });

  it("shows values the way the box parses them back, and filters keystrokes", () => {
    const eur = moneyInput("EUR", "de-DE");
    expect(eur.toText(123_450)).toBe("1234,50");
    expect(eur.parse(eur.toText(123_450))).toBe(123_450);
    expect(percentInput("de-DE").toText(3333)).toBe("33,33");
    expect(moneyInput("INR", "en-IN").prefix).toBe("₹");
    expect(percentInput("en-IN").suffix).toBe("%");
    expect(eur.accept("12", "12a3")).toBe("123");
    expect(eur.accept("123456789", "1234567890")).toBe("123456789"); // past 9 whole digits
  });
});

describe("number box edge cases", () => {
  it("committing someone's current figure still pins them", () => {
    const inr = moneyInput("INR", "en-IN");
    const start = evenSliders(["a", "b", "c"], 9000);
    const pinned = commitSliderText(start, "a", "30", inr);
    expect(pinned.values).toEqual(start.values);
    expect(pinned.touched).toEqual(["a"]);
    // So the next move takes from the others, not from a.
    expect(commitSliderText(pinned, "b", "50", inr).values).toEqual({ a: 3000, b: 5000, c: 1000 });
  });

  it("a figure it can't read isn't taken, and the hint shows the viewer's format", () => {
    expect(committedUnits("12,5", moneyInput("INR", "en-IN"), 100_000)).toBeNull();
    expect(inputHint(moneyInput("INR", "en-IN"))).toBe("Use a number like 12.50");
    expect(inputHint(moneyInput("EUR", "de-DE"))).toBe("Use a number like 12,50");
    expect(inputHint(percentInput("en-US"))).toBe("Use a number like 12.5");
  });
});
