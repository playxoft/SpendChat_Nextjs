import { describe, it, expect } from "vitest";
import { optimisticTotals, type PendingContribution } from "@/lib/summary";

const MONTH = { monthStart: "2026-07-01", monthEnd: "2026-07-31" };
const BASE = { income: 500_00, expense: 200_00 };

function pending(overrides: Partial<PendingContribution> = {}): PendingContribution {
  return {
    status: "sending",
    type: "expense",
    amountMinor: 10_00,
    profileId: "p1",
    occurredOn: "2026-07-15",
    ...overrides,
  };
}

describe("optimisticTotals", () => {
  it("returns the base total when nothing is pending", () => {
    expect(optimisticTotals(BASE, [], { ...MONTH, serverTxnIds: [], profileId: "p1" })).toEqual({
      income: 500_00,
      expense: 200_00,
      balance: 300_00,
    });
  });

  it("adds an in-flight expense to the expense total (balance drops)", () => {
    const r = optimisticTotals(BASE, [pending({ amountMinor: 25_00 })], {
      ...MONTH,
      serverTxnIds: [],
      profileId: "p1",
    });
    expect(r).toEqual({ income: 500_00, expense: 225_00, balance: 275_00 });
  });

  it("adds an in-flight income to the income total (balance rises)", () => {
    const r = optimisticTotals(BASE, [pending({ type: "income", amountMinor: 25_00 })], {
      ...MONTH,
      serverTxnIds: [],
      profileId: "p1",
    });
    expect(r).toEqual({ income: 525_00, expense: 200_00, balance: 325_00 });
  });

  it("stops counting once the saved id lands in the server total (no double count)", () => {
    const sent = pending({ status: "sent", realId: "tx-1", amountMinor: 25_00 });
    // Before the server total catches up, the pending amount is added.
    expect(
      optimisticTotals(BASE, [sent], { ...MONTH, serverTxnIds: [], profileId: "p1" }).expense,
    ).toBe(225_00);
    // Once the server total already includes tx-1, it's no longer added on top.
    expect(
      optimisticTotals(BASE, [sent], { ...MONTH, serverTxnIds: ["tx-1"], profileId: "p1" }).expense,
    ).toBe(200_00);
  });

  it("ignores a failed (unsaved) transaction", () => {
    const r = optimisticTotals(BASE, [pending({ status: "failed", amountMinor: 25_00 })], {
      ...MONTH,
      serverTxnIds: [],
      profileId: "p1",
    });
    expect(r).toEqual({ income: 500_00, expense: 200_00, balance: 300_00 });
  });

  it("ignores a transaction dated outside the current month", () => {
    const r = optimisticTotals(BASE, [pending({ occurredOn: "2026-06-30", amountMinor: 25_00 })], {
      ...MONTH,
      serverTxnIds: [],
      profileId: "p1",
    });
    expect(r).toEqual({ income: 500_00, expense: 200_00, balance: 300_00 });
  });

  it("ignores a transaction for a different profile when a profile is in view", () => {
    const r = optimisticTotals(BASE, [pending({ profileId: "p2", amountMinor: 25_00 })], {
      ...MONTH,
      serverTxnIds: [],
      profileId: "p1",
    });
    expect(r).toEqual({ income: 500_00, expense: 200_00, balance: 300_00 });
  });

  it("counts every profile's pending in the 'All profiles' view (profileId null)", () => {
    const r = optimisticTotals(
      BASE,
      [pending({ profileId: "p1", amountMinor: 10_00 }), pending({ profileId: "p2", amountMinor: 15_00 })],
      { ...MONTH, serverTxnIds: [], profileId: null },
    );
    expect(r.expense).toBe(225_00);
  });

  it("accepts a Set for serverTxnIds", () => {
    const sent = pending({ status: "sent", realId: "tx-9", amountMinor: 25_00 });
    const r = optimisticTotals(BASE, [sent], {
      ...MONTH,
      serverTxnIds: new Set(["tx-9"]),
      profileId: "p1",
    });
    expect(r.expense).toBe(200_00);
  });
});
