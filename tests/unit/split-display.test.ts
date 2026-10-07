import { describe, it, expect } from "vitest";
import { balanceStatus, initialsOf, myPart, SETTLED_UP } from "@/lib/split-display";

describe("initialsOf", () => {
  it("takes the first and last word's first letters", () => {
    expect(initialsOf("Asha Rao")).toBe("AR");
    expect(initialsOf("  ravi ")).toBe("R");
    expect(initialsOf("Mary Ann Lee")).toBe("ML");
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("Émile zola")).toBe("ÉZ");
  });
});

describe("myPart", () => {
  const expense = (payer: string, total: number, mine: number | null) => ({
    amountMinor: total,
    paidBy: { memberId: payer },
    myShare: mine === null ? null : { amountMinor: mine },
  });

  it("you paid and others share it: you lent the rest", () => {
    expect(myPart(expense("me", 9000, 3000), "me")).toEqual({ kind: "lent", amountMinor: 6000 });
    expect(myPart(expense("me", 9000, null), "me")).toEqual({ kind: "lent", amountMinor: 9000 });
  });

  it("you paid only for yourself", () => {
    expect(myPart(expense("me", 500, 500), "me")).toEqual({ kind: "own" });
  });

  it("someone else paid: you owe your share, or you're not involved", () => {
    expect(myPart(expense("asha", 9000, 3000), "me")).toEqual({ kind: "owe", amountMinor: 3000 });
    expect(myPart(expense("asha", 9000, null), "me")).toEqual({ kind: "none" });
    expect(myPart(expense("asha", 9000, 0), "me")).toEqual({ kind: "none" });
  });
});

describe("balanceStatus", () => {
  it("names the three states, and Settled Up is Title Case", () => {
    expect(balanceStatus(100)).toBe("owed");
    expect(balanceStatus(-1)).toBe("owe");
    expect(balanceStatus(0)).toBe("settled");
    expect(SETTLED_UP).toBe("Settled Up");
  });
});
