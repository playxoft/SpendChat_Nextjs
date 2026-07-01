import { describe, it, expect } from "vitest";
import { parseQuickEntry } from "@/lib/quick-entry";

describe("parseQuickEntry", () => {
  it("splits a leading integer amount from the title", () => {
    expect(parseQuickEntry("100 fruits")).toEqual({ amount: 100, title: "fruits" });
  });

  it("parses a decimal amount and a multi-word title", () => {
    expect(parseQuickEntry("12.50 lunch with team")).toEqual({
      amount: 12.5,
      title: "lunch with team",
    });
  });

  it("returns an empty title when only an amount is typed", () => {
    expect(parseQuickEntry("100")).toEqual({ amount: 100, title: "" });
  });

  it("tolerates a leading currency symbol", () => {
    expect(parseQuickEntry("$100 fruits")).toEqual({ amount: 100, title: "fruits" });
    expect(parseQuickEntry("₹250 groceries")).toEqual({ amount: 250, title: "groceries" });
  });

  it("trims surrounding whitespace", () => {
    expect(parseQuickEntry("  50   coffee  ")).toEqual({ amount: 50, title: "coffee" });
  });

  it("leaves a title-first string un-parsed (no leading number)", () => {
    expect(parseQuickEntry("fruits 100")).toEqual({ amount: null, title: "fruits 100" });
  });

  it("returns null amount for an empty string", () => {
    expect(parseQuickEntry("")).toEqual({ amount: null, title: "" });
  });
});
