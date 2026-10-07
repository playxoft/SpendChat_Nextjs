import { describe, it, expect } from "vitest";
import {
  BASIS_POINTS_TOTAL,
  canonicalOrder,
  computeShares,
  describeSplitError,
  fromBasisPoints,
  percentToInputString,
  netBalances,
  payerAmounts,
  primaryPayer,
  SplitMathError,
  suggestSettlements,
  toBasisPoints,
  type MemberBalance,
} from "@/lib/split-math";
import { formatMoney } from "@/lib/money";
import { parseAmountInput } from "@/lib/parse-amount";

const sum = (xs: { amountMinor: number }[]) => xs.reduce((a, x) => a + x.amountMinor, 0);
const byId = (xs: { memberId: string; amountMinor: number }[]) =>
  Object.fromEntries(xs.map((x) => [x.memberId, x.amountMinor]));

describe("canonicalOrder", () => {
  it("puts the payer first, then everyone else by id", () => {
    expect(canonicalOrder(["c", "a", "b"], "b")).toEqual(["b", "a", "c"]);
  });
  it("is just id order when the payer isn't in the list", () => {
    expect(canonicalOrder(["c", "a"], "z")).toEqual(["a", "c"]);
    expect(canonicalOrder(["c", "a"], null)).toEqual(["a", "c"]);
  });
});

describe("computeShares — equal", () => {
  it("gives the leftover paisa to the payer first", () => {
    const shares = computeShares(10_000, "b", { type: "equal", memberIds: ["a", "b", "c"] });
    expect(shares).toEqual([
      { memberId: "b", amountMinor: 3334 },
      { memberId: "a", amountMinor: 3333 },
      { memberId: "c", amountMinor: 3333 },
    ]);
  });

  it("then in id order when the payer isn't splitting", () => {
    const shares = computeShares(200, "z", { type: "equal", memberIds: ["c", "a", "b"] });
    expect(byId(shares)).toEqual({ a: 67, b: 67, c: 66 });
  });

  it("doesn't depend on the order people were listed in", () => {
    const one = computeShares(1001, "a", { type: "equal", memberIds: ["a", "b", "c", "d"] });
    const two = computeShares(1001, "a", { type: "equal", memberIds: ["d", "c", "b", "a"] });
    expect(one).toEqual(two);
  });

  it("works the same in a currency with no decimals (¥1,000 three ways)", () => {
    const shares = computeShares(1000, "a", { type: "equal", memberIds: ["a", "b", "c"] });
    expect(byId(shares)).toEqual({ a: 334, b: 333, c: 333 });
    expect(sum(shares)).toBe(1000);
  });

  it("and with three decimals (KWD 1.000 three ways)", () => {
    const shares = computeShares(1000, "c", { type: "equal", memberIds: ["a", "b", "c"] });
    expect(byId(shares)).toEqual({ a: 333, b: 333, c: 334 });
  });

  it("splits evenly with nothing left over", () => {
    expect(byId(computeShares(900, "a", { type: "equal", memberIds: ["a", "b", "c"] }))).toEqual({
      a: 300,
      b: 300,
      c: 300,
    });
  });

  it("refuses an empty or duplicated list", () => {
    expect(() => computeShares(100, "a", { type: "equal", memberIds: [] })).toThrow(SplitMathError);
    expect(() => computeShares(100, "a", { type: "equal", memberIds: ["a", "a"] })).toThrow(
      "Someone is in the split twice",
    );
  });

  it("refuses a zero, negative or fractional total", () => {
    expect(() => computeShares(0, "a", { type: "equal", memberIds: ["a"] })).toThrow(
      "Amount must be greater than 0",
    );
    expect(() => computeShares(-5, "a", { type: "equal", memberIds: ["a"] })).toThrow(SplitMathError);
    expect(() => computeShares(1.5, "a", { type: "equal", memberIds: ["a"] })).toThrow(SplitMathError);
  });
});

describe("computeShares — exact", () => {
  it("keeps the amounts as given, in canonical order, dropping zeros", () => {
    const shares = computeShares(1000, "b", {
      type: "exact",
      shares: [
        { memberId: "a", amountMinor: 600 },
        { memberId: "c", amountMinor: 0 },
        { memberId: "b", amountMinor: 400 },
      ],
    });
    expect(shares).toEqual([
      { memberId: "b", amountMinor: 400 },
      { memberId: "a", amountMinor: 600 },
    ]);
  });

  it("refuses shares that don't add up — a neutral message, the sums in details", () => {
    let caught: unknown;
    try {
      computeShares(100_000, "a", { type: "exact", shares: [{ memberId: "a", amountMinor: 99_000 }] });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SplitMathError);
    const err = caught as SplitMathError;
    // The message is what gets logged: no amounts in it.
    expect(err.message).toBe("The shares don't add up to the expense");
    expect(err.details).toEqual({ sumMinor: 99_000, totalMinor: 100_000 });
    // The dialog phrases the specifics for the person.
    expect(describeSplitError(err, (m) => formatMoney(m, "INR", "en-IN"))).toBe(
      "Shares add up to ₹990.00, but the expense is ₹1,000.00",
    );
  });

  it("refuses negative or fractional shares and duplicates", () => {
    expect(() =>
      computeShares(100, "a", { type: "exact", shares: [{ memberId: "a", amountMinor: -1 }] }),
    ).toThrow(SplitMathError);
    expect(() =>
      computeShares(100, "a", {
        type: "exact",
        shares: [
          { memberId: "a", amountMinor: 50 },
          { memberId: "a", amountMinor: 50 },
        ],
      }),
    ).toThrow("Someone is in the split twice");
  });
});

describe("computeShares — percent", () => {
  it("converts percents to basis points and back", () => {
    expect(toBasisPoints(33.33)).toBe(3333);
    expect(toBasisPoints(12.5)).toBe(1250);
    expect(fromBasisPoints(3334)).toBe(33.34);
    expect(BASIS_POINTS_TOTAL).toBe(10_000);
  });

  it("splits 33.33 / 33.33 / 33.34 of ₹100 exactly", () => {
    const shares = computeShares(10_000, "a", {
      type: "percent",
      shares: [
        { memberId: "a", bp: 3333 },
        { memberId: "b", bp: 3333 },
        { memberId: "c", bp: 3334 },
      ],
    });
    expect(byId(shares)).toEqual({ a: 3333, b: 3333, c: 3334 });
  });

  it("hands leftovers to the largest remainders, ties in canonical order", () => {
    // ₹1.00 at 33.33 / 33.33 / 33.34 → 33.33, 33.33, 33.34 → floors 33, 33, 33,
    // remainders .33/.33/.34 → the extra unit goes to c (largest remainder).
    const shares = computeShares(100, "b", {
      type: "percent",
      shares: [
        { memberId: "a", bp: 3333 },
        { memberId: "b", bp: 3333 },
        { memberId: "c", bp: 3334 },
      ],
    });
    expect(byId(shares)).toEqual({ a: 33, b: 33, c: 34 });

    // Equal remainders: 50/50 of 1 unit → the payer (b) gets it.
    const tie = computeShares(1, "b", {
      type: "percent",
      shares: [
        { memberId: "a", bp: 5000 },
        { memberId: "b", bp: 5000 },
      ],
    });
    expect(byId(tie)).toEqual({ a: 0, b: 1 });
  });

  it("stays exact past 2^53 (a 3-decimal total at the amount cap)", () => {
    const total = 999_999_999_999; // KWD 999,999,999.999
    const shares = computeShares(total, "a", {
      type: "percent",
      shares: [
        { memberId: "a", bp: 3333 },
        { memberId: "b", bp: 6667 },
      ],
    });
    expect(sum(shares)).toBe(total);
    expect(byId(shares)).toEqual({ a: 333_300_000_000, b: 666_699_999_999 });
  });

  it("drops people at 0%", () => {
    const shares = computeShares(500, "a", {
      type: "percent",
      shares: [
        { memberId: "a", bp: 10_000 },
        { memberId: "b", bp: 0 },
      ],
    });
    expect(shares).toEqual([{ memberId: "a", amountMinor: 500 }]);
  });

  it("refuses percents that don't make 100, or are out of range", () => {
    let caught: unknown;
    try {
      computeShares(100, "a", { type: "percent", shares: [{ memberId: "a", bp: 9950 }] });
    } catch (err) {
      caught = err;
    }
    expect((caught as SplitMathError).message).toBe("The percents don't add up to 100%");
    expect(describeSplitError(caught as SplitMathError, String)).toBe("Percents add up to 99.5%, not 100%");
    expect(describeSplitError(new SplitMathError("Pick who it's split between"), String)).toBe(
      "Pick who it's split between",
    );
    expect(() =>
      computeShares(100, "a", { type: "percent", shares: [{ memberId: "a", bp: 10_001 }] }),
    ).toThrow("Each percent must be between 0 and 100");
    expect(() =>
      computeShares(100, "a", { type: "percent", shares: [{ memberId: "a", bp: 12.5 }] }),
    ).toThrow(SplitMathError);
  });
});

describe("netBalances", () => {
  it("is paid − owed + sent − received, and zero for the untouched", () => {
    const nets = netBalances(["a", "b", "c"], {
      paid: { a: 3000 },
      owed: { a: 1000, b: 1000, c: 1000 },
      sent: { b: 400 },
      received: { a: 400 },
    });
    expect(nets).toEqual([
      { memberId: "a", netMinor: 1600 },
      { memberId: "b", netMinor: -600 },
      { memberId: "c", netMinor: -1000 },
    ]);
  });
});

/** A small deterministic PRNG so the "random ledger" test is reproducible. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe("suggestSettlements", () => {
  it("matches the biggest debt with the biggest credit", () => {
    const balances: MemberBalance[] = [
      { memberId: "a", netMinor: 1600 },
      { memberId: "b", netMinor: -600 },
      { memberId: "c", netMinor: -1000 },
    ];
    expect(suggestSettlements(balances)).toEqual([
      { fromMemberId: "c", toMemberId: "a", amountMinor: 1000 },
      { fromMemberId: "b", toMemberId: "a", amountMinor: 600 },
    ]);
  });

  it("breaks ties by member id and suggests nothing when everyone is square", () => {
    expect(
      suggestSettlements([
        { memberId: "b", netMinor: -5 },
        { memberId: "a", netMinor: -5 },
        { memberId: "c", netMinor: 10 },
      ]),
    ).toEqual([
      { fromMemberId: "a", toMemberId: "c", amountMinor: 5 },
      { fromMemberId: "b", toMemberId: "c", amountMinor: 5 },
    ]);
    expect(suggestSettlements([{ memberId: "a", netMinor: 0 }])).toEqual([]);
  });

  it("over random ledgers: nets sum to zero, and paying the suggestions squares everyone in ≤ n−1 payments", () => {
    const next = rng(42);
    for (let round = 0; round < 200; round++) {
      const people = Array.from({ length: 2 + Math.floor(next() * 8) }, (_, i) => `m${i}`);
      const paid: Record<string, number> = {};
      const owed: Record<string, number> = {};
      for (let e = 0; e < 1 + Math.floor(next() * 6); e++) {
        const payer = people[Math.floor(next() * people.length)]!;
        const total = 1 + Math.floor(next() * 100_000);
        const splitters = people.filter(() => next() < 0.7);
        const shares = computeShares(total, payer, {
          type: "equal",
          memberIds: splitters.length ? splitters : [payer],
        });
        paid[payer] = (paid[payer] ?? 0) + total;
        for (const s of shares) owed[s.memberId] = (owed[s.memberId] ?? 0) + s.amountMinor;
      }
      const nets = netBalances(people, { paid, owed, sent: {}, received: {} });
      expect(nets.reduce((a, n) => a + n.netMinor, 0)).toBe(0);

      const plan = suggestSettlements(nets);
      expect(plan.length).toBeLessThanOrEqual(people.length - 1);
      const sent: Record<string, number> = {};
      const received: Record<string, number> = {};
      for (const p of plan) {
        expect(p.amountMinor).toBeGreaterThan(0);
        sent[p.fromMemberId] = (sent[p.fromMemberId] ?? 0) + p.amountMinor;
        received[p.toMemberId] = (received[p.toMemberId] ?? 0) + p.amountMinor;
      }
      const after = netBalances(people, { paid, owed, sent, received });
      expect(after.every((n) => n.netMinor === 0)).toBe(true);
    }
  });
});

describe("percentToInputString", () => {
  it("writes a percent the way the viewer types numbers, so it parses back", () => {
    expect(percentToInputString(3333, "en-US")).toBe("33.33");
    expect(percentToInputString(3333, "de-DE")).toBe("33,33");
    expect(percentToInputString(5000, "fr-FR")).toBe("50");
    // Latin digits even where the locale writes others — or parsing fails.
    expect(percentToInputString(1250, "ar-EG")).toMatch(/^12[.,٫]5$/);
    for (const locale of ["en-US", "de-DE", "fr-FR", "en-IN"]) {
      expect(parseAmountInput(percentToInputString(3333, locale), locale)).toBe(33.33);
    }
  });

  it("falls back to plain digits for a locale Intl can't load", () => {
    expect(percentToInputString(3333, "not a locale!")).toBe("33.33");
  });
});

describe("payerAmounts — several people paid", () => {
  it("divides evenly without amounts, leftover units one each by member id", () => {
    expect(payerAmounts(1001, [{ memberId: "b" }, { memberId: "a" }])).toEqual([
      { memberId: "a", amountMinor: 501 },
      { memberId: "b", amountMinor: 500 },
    ]);
    expect(payerAmounts(500, [{ memberId: "a" }])).toEqual([{ memberId: "a", amountMinor: 500 }]);
  });

  it("takes amounts as given when they add up, dropping anyone at 0", () => {
    expect(
      payerAmounts(9000, [
        { memberId: "b", amountMinor: 6000 },
        { memberId: "a", amountMinor: 3000 },
        { memberId: "c", amountMinor: 0 },
      ]),
    ).toEqual([
      { memberId: "a", amountMinor: 3000 },
      { memberId: "b", amountMinor: 6000 },
    ]);
  });

  it("refuses amounts that don't add up, a mix of given and missing, duplicates and nobody", () => {
    const err = (() => {
      try {
        payerAmounts(9000, [
          { memberId: "a", amountMinor: 3000 },
          { memberId: "b", amountMinor: 3000 },
        ]);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(SplitMathError);
    expect((err as SplitMathError).details).toEqual({ paidSumMinor: 6000, totalMinor: 9000 });
    expect(describeSplitError(err as SplitMathError, (m) => formatMoney(m, "INR", "en-IN"))).toBe(
      "Amounts paid add up to ₹60.00, but the expense is ₹90.00",
    );
    expect(() => payerAmounts(9000, [{ memberId: "a", amountMinor: 9000 }, { memberId: "b" }])).toThrow(
      SplitMathError,
    );
    expect(() => payerAmounts(9000, [{ memberId: "a" }, { memberId: "a" }])).toThrow("Someone is in Paid by twice");
    expect(() => payerAmounts(9000, [])).toThrow("Pick who paid");
    expect(() => payerAmounts(9000, [{ memberId: "a", amountMinor: 0 }, { memberId: "b", amountMinor: 0 }])).toThrow(
      SplitMathError,
    );
  });

  it("the main payer paid the most, ties by member id — and takes an equal split's leftover first", () => {
    expect(primaryPayer([{ memberId: "a", amountMinor: 100 }, { memberId: "b", amountMinor: 300 }])).toBe("b");
    expect(primaryPayer([{ memberId: "b", amountMinor: 200 }, { memberId: "a", amountMinor: 200 }])).toBe("a");
    const payers = payerAmounts(1000, [{ memberId: "c" }, { memberId: "b" }]);
    expect(computeShares(1000, primaryPayer(payers), { type: "equal", memberIds: ["a", "b", "c"] })).toEqual([
      { memberId: "b", amountMinor: 334 },
      { memberId: "a", amountMinor: 333 },
      { memberId: "c", amountMinor: 333 },
    ]);
  });
});
