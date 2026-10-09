import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("@/actions/split", () => ({ createSplitExpense: vi.fn(), updateSplitExpense: vi.fn() }));

import { useExpenseEditor, type EditorStart, type ExpenseEditor } from "@/components/app/split/use-expense-editor";
import { PayerSliders } from "@/components/app/split/payer-sliders";
import { SplitComposer } from "@/components/app/split/split-composer";
import { SplitPeopleList } from "@/components/split/split-people-list";
import { evenSliders } from "@/lib/split-sliders";
import { moneyInput, percentInput } from "@/lib/split-slider-input";
import {
  editorFrom,
  viewEditor,
  withIncluded,
  withPayerIds,
  withSliderMoved,
  withSlidersReset,
  withSplitType,
} from "@/lib/split-editor";

/**
 * The expense editor the chat composer and the app's expense dialog share,
 * rendered on the server (no DOM here): what it starts from, the payer
 * sliders, the shares it previews and the body it sends.
 */

function run(start: EditorStart, total: number, members = ["a", "b", "c"]) {
  let out: ExpenseEditor | null = null;
  function Probe() {
    const editor = useExpenseEditor({
      members: members.map((id) => ({ id })),
      meMemberId: "a",
      currency: "INR",
      totalMinor: total,
      start,
      format: (m) => `₹${m / 100}`,
    });
    out = editor;
    return React.createElement(PayerSliders, {
      editor,
      people: members.map((id) => ({ id, name: id.toUpperCase() })),
      totalMinor: total,
      format: (m: number) => `₹${m / 100}`,
      input: moneyInput("INR", "en-IN"),
    });
  }
  const html = renderToString(React.createElement(Probe));
  return { editor: out! as ExpenseEditor, html };
}

describe("useExpenseEditor", () => {
  it("two payers divide the amount evenly and are sent with what each paid", () => {
    const { editor, html } = run(
      { splitType: "equal", included: ["a", "b", "c"], payers: [{ memberId: "a" }, { memberId: "b" }] },
      10001,
    );
    expect(editor.payers?.values).toEqual({ a: 5001, b: 5000 });
    expect(editor.primary).toBe("a");
    expect([...editor.preview.shares!.entries()]).toEqual([
      ["a", 3334],
      ["b", 3334],
      ["c", 3333],
    ]);
    expect(editor.input({ title: "x", amount: 100.01, occurredOn: "2026-10-07" })).toMatchObject({
      payers: [
        { memberId: "a", amount: 50.01 },
        { memberId: "b", amount: 50 },
      ],
      splitType: "equal",
      memberIds: ["a", "b", "c"],
    });
    expect(html).toContain("What each paid");
    expect(html).toContain('role="slider"');
    // Each payer's slider has its number box: what they paid, as the box shows it.
    expect(html).toContain('aria-label="What A paid"');
    expect(html).toContain('value="50.01"');
  });

  it("editing keeps saved amounts; a percent split starts even, the payer taking the leftover", () => {
    const { editor } = run(
      {
        splitType: "exact",
        included: ["c", "a"],
        payers: [{ memberId: "b", amountMinor: 9000 }],
        exact: { a: 1000, c: 8000 },
      },
      9000,
    );
    expect(editor.exact.values).toEqual({ a: 1000, c: 8000 });
    expect(editor.exact.ids).toEqual(["a", "c"]);
    expect(editor.payers).toBeNull();
    expect(editor.preview.shares?.get("c")).toBe(8000);

    const p = run({ splitType: "percent", included: ["a", "b", "c"], payers: [{ memberId: "b" }] }, 1000).editor;
    expect(p.percent.values).toEqual({ b: 3334, a: 3333, c: 3333 });
    expect(p.input({ title: "x", amount: 10, occurredOn: "2026-10-07" })).toMatchObject({
      payers: [{ memberId: "b" }],
      splitType: "percent",
      shares: [
        { memberId: "a", percent: 33.33 },
        { memberId: "b", percent: 33.34 },
        { memberId: "c", percent: 33.33 },
      ],
    });
  });
});

describe("split people list and composer render", () => {
  it("the composer starts with you paying, everyone in, its controls named", () => {
    const html = renderToString(
      React.createElement(SplitComposer, {
        groupId: "g",
        currency: "INR",
        locale: "en-IN",
        today: "2026-10-07",
        members: [
          { id: "a", name: "Asha", email: "asha@example.com" },
          { id: "b", name: "Ben", email: null },
        ],
        meMemberId: "a",
        onExpand: () => {},
      }),
    );
    expect(html).toContain("Paid by");
    expect(html).toContain('aria-label="Paid by: You"');
    expect(html).toContain("All 2");
    // ₹ and % carry their names: words from `sm` up, aria-label always.
    expect(html).toContain('aria-label="Split by amount"');
    expect(html).toContain('aria-label="Split by percent"');
    expect(html).toMatch(/hidden sm:inline">Amount</);
    expect(html).toMatch(/hidden sm:inline">Percent</);
  });

  it("the people list shows emails, Select all / Deselect all, and a slider per person in", () => {
    const html = renderToString(
      React.createElement(SplitPeopleList, {
        people: [
          { id: "a", name: "Asha", email: "asha@example.com", isYou: true },
          { id: "b", name: "Ben" },
        ],
        included: new Set(["a", "b"]),
        onIncludedChange: () => {},
        shareText: (id: string) => (id === "a" ? "₹50" : null),
        sliders: {
          state: evenSliders(["a", "b"], 10_000),
          step: 100,
          format: (v: number) => `${v / 100}%`,
          input: percentInput("en-IN"),
          onMove: () => {},
        },
      }),
    );
    expect(html).toContain("asha@example.com");
    expect(html).toContain("Select all");
    expect(html).toContain("Deselect all");
    expect(html.match(/role="slider"/g)).toHaveLength(2);
    // A number box beside each slider, showing its value.
    expect(html.match(/inputMode="decimal"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Share for you (%)"');
    expect(html).toContain('value="50"');
  });
});

describe("the editor model across sends", () => {
  const ctx = (totalMinor: number) => ({
    order: ["a", "b", "c"],
    meMemberId: "a",
    currency: "INR",
    totalMinor,
    format: (m: number) => `₹${m / 100}`,
  });

  it("a send forgets this expense's sliders but keeps who's in it and who paid", () => {
    let s = editorFrom({ splitType: "equal", included: ["a", "b", "c"], payers: [{ memberId: "a" }] }, 0);
    // First expense: ₹90 by amounts with a at ₹60; a and b paid, a all of it.
    s = withSplitType(s, "exact");
    s = withSliderMoved(s, ctx(9000), "exact", "a", 6000);
    s = withPayerIds(s, ["a", "b"]);
    s = withSliderMoved(s, ctx(9000), "payers", "a", 9000);
    let v = viewEditor(s, ctx(9000));
    expect(v.exact.values).toEqual({ a: 6000, b: 1500, c: 1500 });
    expect(v.payers?.values).toEqual({ a: 9000, b: 0 });

    // Sent: the composer clears the amount and resets the sliders.
    s = withSlidersReset(s);
    v = viewEditor(s, ctx(0));
    expect(v.splitType).toBe("equal");
    expect(v.payerIds).toEqual(["a", "b"]);
    expect(v.includedIds).toEqual(["a", "b", "c"]);

    // The next ₹90 by amounts starts even again — not from the last one's proportions.
    s = withSplitType(s, "exact");
    v = viewEditor(s, ctx(9000));
    expect(v.exact.values).toEqual({ a: 3000, b: 3000, c: 3000 });
    expect(v.payers?.values).toEqual({ a: 4500, b: 4500 });
  });

  it("two moves in one tick both land — a typed figure committed on blur, then a tap on another slider", () => {
    const base = withSplitType(
      editorFrom({ splitType: "equal", included: ["a", "b", "c"], payers: [{ memberId: "a" }] }, 9000),
      "exact",
    );
    // React runs both queued updaters on the same render's state, one after the other.
    const queued = [
      (s: typeof base) => withSliderMoved(s, ctx(9000), "exact", "a", 5000),
      (s: typeof base) => withSliderMoved(s, ctx(9000), "exact", "b", 3000),
    ];
    const after = queued.reduce((s, update) => update(s), base);
    expect(viewEditor(after, ctx(9000)).exact.values).toEqual({ a: 5000, b: 3000, c: 1000 });
  });

  it("payers stay in the split: unticking one drops them, and someone always pays", () => {
    let s = editorFrom({ splitType: "equal", included: ["a", "b", "c"], payers: [{ memberId: "b" }, { memberId: "c" }] }, 0);
    s = withIncluded(s, ["a", "b"], { order: ["a", "b", "c"], meMemberId: "a" });
    expect(s.payerIds).toEqual(["b"]);
    s = withIncluded(s, ["a", "c"], { order: ["a", "b", "c"], meMemberId: "a" });
    expect(s.payerIds).toEqual(["a"]);
    expect(withPayerIds(s, []).payerIds).toEqual(["a"]);
  });

  it("saved amounts that don't add up start even", () => {
    const s = editorFrom(
      { splitType: "exact", included: ["a", "b"], payers: [{ memberId: "a" }], exact: { a: 100, b: 100 } },
      1000,
    );
    expect(viewEditor(s, ctx(1000)).exact.values).toEqual({ a: 500, b: 500 });
  });
});
