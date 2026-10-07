import { describe, it, expect } from "vitest";
import {
  addSplitMembersSchema,
  addSplitShareToWorkspaceSchema,
  createSplitGroupSchema,
  SPLIT_ADD_PEOPLE_MAX,
  splitExpenseSchema,
  splitPayersOf,
  splitSettlementSchema,
  updateSplitGroupSchema,
} from "@/lib/validation";
import { SPLIT_GROUP_MAX_PEOPLE } from "@/lib/plans";

const A = "0190a5c4-0000-7000-8000-000000000001";
const B = "0190a5c4-0000-7000-8000-000000000002";

const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ email: `p${i}@example.com`, name: `P${i}` }));

describe("split group schemas", () => {
  it("creates with a name, a supported currency and up to 49 people", () => {
    const ok = createSplitGroupSchema.parse({ name: " Goa trip ", currency: "INR" });
    expect(ok).toMatchObject({ name: "Goa trip", currency: "INR", members: [] });
    expect(SPLIT_ADD_PEOPLE_MAX).toBe(SPLIT_GROUP_MAX_PEOPLE - 1);
    expect(createSplitGroupSchema.safeParse({ name: "x", currency: "INR", members: people(49) }).success).toBe(true);
    expect(createSplitGroupSchema.safeParse({ name: "x", currency: "INR", members: people(50) }).success).toBe(false);
    expect(createSplitGroupSchema.safeParse({ name: "", currency: "INR" }).success).toBe(false);
    expect(createSplitGroupSchema.safeParse({ name: "x", currency: "XXX" }).success).toBe(false);
  });

  it("needs a name for every person and lowercases emails", () => {
    const parsed = addSplitMembersSchema.parse({ members: [{ email: "Ravi@Example.COM", name: "Ravi" }] });
    expect(parsed.members[0]!.email).toBe("ravi@example.com");
    expect(addSplitMembersSchema.safeParse({ members: [{ email: "a@example.com" }] }).success).toBe(false);
    expect(addSplitMembersSchema.safeParse({ members: [{ email: "a@example.com", name: " " }] }).success).toBe(false);
    expect(addSplitMembersSchema.safeParse({ members: [] }).success).toBe(false);
  });

  it("refuses the same email twice", () => {
    const res = addSplitMembersSchema.safeParse({
      members: [
        { email: "a@example.com", name: "A" },
        { email: "A@example.com", name: "A2" },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("update needs at least one field", () => {
    expect(updateSplitGroupSchema.safeParse({}).success).toBe(false);
    expect(updateSplitGroupSchema.safeParse({ icon: null }).success).toBe(true);
    expect(updateSplitGroupSchema.safeParse({ currency: "JPY" }).success).toBe(true);
  });
});

describe("split expense schema", () => {
  const base = { title: "Dinner", amount: 1200, paidBy: A, occurredOn: "2026-10-01" };

  it("accepts each split type with its inputs", () => {
    expect(splitExpenseSchema.safeParse({ ...base, splitType: "equal", memberIds: [A, B] }).success).toBe(true);
    expect(
      splitExpenseSchema.safeParse({
        ...base,
        splitType: "exact",
        shares: [
          { memberId: A, amount: 700 },
          { memberId: B, amount: "500" },
        ],
      }).success,
    ).toBe(true);
    expect(
      splitExpenseSchema.safeParse({
        ...base,
        splitType: "percent",
        shares: [
          { memberId: A, percent: 33.33 },
          { memberId: B, percent: 66.67 },
        ],
      }).success,
    ).toBe(true);
  });

  it("refuses percents with more than two decimals, out-of-range values and empty splits", () => {
    expect(
      splitExpenseSchema.safeParse({ ...base, splitType: "percent", shares: [{ memberId: A, percent: 33.333 }] })
        .success,
    ).toBe(false);
    expect(
      splitExpenseSchema.safeParse({ ...base, splitType: "percent", shares: [{ memberId: A, percent: 101 }] })
        .success,
    ).toBe(false);
    expect(splitExpenseSchema.safeParse({ ...base, splitType: "equal", memberIds: [] }).success).toBe(false);
    expect(
      splitExpenseSchema.safeParse({ ...base, splitType: "exact", shares: [{ memberId: A, amount: -1 }] }).success,
    ).toBe(false);
    expect(splitExpenseSchema.safeParse({ ...base, title: "", splitType: "equal", memberIds: [A] }).success).toBe(
      false,
    );
  });

  it("takes who paid as payers (with or without amounts) or the older single paidBy — one of them", () => {
    const { paidBy: _paidBy, ...noPayer } = base;
    const equal = { splitType: "equal" as const, memberIds: [A, B] };
    const both = splitExpenseSchema.safeParse({ ...noPayer, ...equal, payers: [{ memberId: A }, { memberId: B }] });
    expect(both.success && splitPayersOf(both.data)).toEqual([{ memberId: A }, { memberId: B }]);
    const amounts = splitExpenseSchema.safeParse({
      ...noPayer,
      ...equal,
      payers: [
        { memberId: A, amount: 700 },
        { memberId: B, amount: "500" },
      ],
    });
    expect(amounts.success && splitPayersOf(amounts.data)).toEqual([
      { memberId: A, amount: 700 },
      { memberId: B, amount: 500 },
    ]);
    const single = splitExpenseSchema.safeParse({ ...base, ...equal });
    expect(single.success && splitPayersOf(single.data)).toEqual([{ memberId: A }]);

    expect(splitExpenseSchema.safeParse({ ...noPayer, ...equal }).success).toBe(false);
    expect(splitExpenseSchema.safeParse({ ...base, ...equal, payers: [{ memberId: B }] }).success).toBe(false);
    expect(splitExpenseSchema.safeParse({ ...noPayer, ...equal, payers: [] }).success).toBe(false);
    expect(
      splitExpenseSchema.safeParse({ ...noPayer, ...equal, payers: [{ memberId: A, amount: -1 }] }).success,
    ).toBe(false);
  });
});

describe("settlement + add-to-workspace schemas", () => {
  it("a payment needs two different people", () => {
    const ok = { fromMemberId: A, toMemberId: B, amount: 10, settledOn: "2026-10-01" };
    expect(splitSettlementSchema.safeParse(ok).success).toBe(true);
    expect(splitSettlementSchema.safeParse({ ...ok, toMemberId: A }).success).toBe(false);
  });

  it("adding a share needs a profile; everything else is optional", () => {
    expect(addSplitShareToWorkspaceSchema.safeParse({ profileId: A }).success).toBe(true);
    expect(addSplitShareToWorkspaceSchema.safeParse({}).success).toBe(false);
    expect(
      addSplitShareToWorkspaceSchema.safeParse({ profileId: A, amount: 0 }).success,
    ).toBe(false);
  });
});
