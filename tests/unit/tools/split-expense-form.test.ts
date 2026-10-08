import { describe, it, expect } from "vitest";
import { formSliders, initialState, withFormSliderMoved } from "@/components/tools/split/expense-dialog";

const people = [
  { id: "p0001", name: "Asha" },
  { id: "p0002", name: "Ben" },
  { id: "p0003", name: "Chloe" },
];
const order = people.map((p) => p.id);

describe("the calculator's expense form sliders", () => {
  it("two moves in one tick both land — computed from the updater's state, not the last render", () => {
    const base = { ...initialState(people, null, "INR", "en-IN", "2026-10-09"), amount: "90", type: "exact" as const };
    const queued = [
      (s: typeof base) => withFormSliderMoved(s, "exact", "p0001", 5000, order, "INR", "en-IN"),
      (s: typeof base) => withFormSliderMoved(s, "exact", "p0002", 3000, order, "INR", "en-IN"),
    ];
    const after = queued.reduce((s, update) => update(s), base);
    expect(formSliders(after, order, "INR", "en-IN").exact.values).toEqual({ p0001: 5000, p0002: 3000, p0003: 1000 });
  });

  it("a saved split that doesn't add up starts even, and says so", () => {
    const state = initialState(
      people,
      {
        id: "e0001",
        title: "Fuel",
        amountMinor: 9000,
        paidBy: "p0001",
        on: "2026-10-09",
        split: { type: "exact", shares: [{ id: "p0001", minor: 1000 }, { id: "p0002", minor: 1000 }] },
      },
      "INR",
      "en-IN",
      "2026-10-09",
    );
    expect(state.startedEven).toBe(true);
    expect(formSliders(state, order, "INR", "en-IN").exact.values).toEqual({ p0001: 4500, p0002: 4500 });
  });
});
