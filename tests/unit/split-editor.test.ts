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
  it("the composer starts with you paying, everyone in", () => {
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
    expect(html).toContain("You paid");
    expect(html).toContain("All 2");
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
          onMove: () => {},
        },
      }),
    );
    expect(html).toContain("asha@example.com");
    expect(html).toContain("Select all");
    expect(html).toContain("Deselect all");
    expect(html.match(/role="slider"/g)).toHaveLength(2);
  });
});
