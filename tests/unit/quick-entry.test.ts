import { describe, it, expect } from "vitest";
import { parseQuickEntry, splitChipPaste } from "@/lib/quick-entry";

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

describe("parseQuickEntry — grouped and locale-formatted amounts (B2)", () => {
  it("keeps a thousands separator with the amount, not the title", () => {
    // Used to yield { amount: 1, title: ",000 rent" } — a 1000x error.
    expect(parseQuickEntry("$1,000 rent")).toEqual({ amount: 1000, title: "rent" });
    expect(parseQuickEntry("1,250.50 rent")).toEqual({ amount: 1250.5, title: "rent" });
  });

  it("reads the amount against the locale", () => {
    expect(parseQuickEntry("12,50 Mittagessen", "de-DE")).toEqual({
      amount: 12.5,
      title: "Mittagessen",
    });
    expect(parseQuickEntry("1.000 Miete", "de-DE")).toEqual({
      amount: 1000,
      title: "Miete",
    });
  });

  it("treats a space as grouping only where the locale groups with one", () => {
    expect(parseQuickEntry("1 000 loyer", "fr-FR")).toEqual({ amount: 1000, title: "loyer" });
    // ...and still splits a normal title that starts with a digit.
    expect(parseQuickEntry("100 2x tickets", "fr-FR")).toEqual({
      amount: 100,
      title: "2x tickets",
    });
  });

  it("refuses to guess when the split would land inside a number", () => {
    // "1 000 rent" in en-US is not a number this locale can express.
    expect(parseQuickEntry("1 000 rent")).toEqual({ amount: null, title: "1 000 rent" });
    expect(parseQuickEntry("1,50 lunch")).toEqual({ amount: null, title: "1,50 lunch" });
  });

  it("does not mistake a title starting with digits for a dropped group", () => {
    expect(parseQuickEntry("50 500ml water")).toEqual({ amount: 50, title: "500ml water" });
  });
});

describe("splitChipPaste — text pasted into the composer's amount chip", () => {
  it("splits a quick entry into the chip's two zones", () => {
    expect(splitChipPaste("100 fruits")).toEqual({ amount: "100", title: "fruits" });
  });

  it("keeps a long title whole — the chip's own length cap must not reach it", () => {
    expect(splitChipPaste("1200 rent for the flat")).toEqual({
      amount: "1200",
      title: "rent for the flat",
    });
  });

  it("hands a title-first paste to the title whole, rather than guessing", () => {
    // The chip strips anything that isn't part of an amount, so leaving the
    // words there would lose them — but salvaging the digits is worse (see the
    // mis-scaling cases below). The whole string stays visible in the title
    // instead, and the send is blocked until there's an amount.
    expect(splitChipPaste("coffee 250")).toEqual({ amount: "", title: "coffee 250" });
  });

  it("never reduces a paste with several numbers to one amount", () => {
    // Deleting the non-amount characters reads "Dinner for 2 people 800" as
    // 2800 and "Rs. 500 groceries" as 0.5 — both under the 9-digit cap, so
    // they would submit silently. The worst failure a money tracker can have.
    for (const text of [
      "Dinner for 2 people 800",
      "iPhone 15 case 45000",
      "Rs. 500 groceries",
      "Taxi 1200 tip 50",
    ]) {
      expect(splitChipPaste(text)).toEqual({ amount: "", title: text });
    }
  });

  it("keeps a paste the locale can't read as a number in the title", () => {
    // Copied from a web page or a spreadsheet: U+00A0 between the groups.
    // en-US doesn't group with a space, so "1 000" is either 1 or 1000 — the
    // composer asks instead of picking one.
    expect(splitChipPaste("1\u00a0000 rent")).toEqual({
      amount: "",
      title: "1\u00a0000 rent",
    });
    // ...and where the locale does group with a space, it splits normally.
    expect(splitChipPaste("1 000 loyer", "fr-FR")).toEqual({ amount: "1000", title: "loyer" });
  });

  it("keeps every decimal the workspace currency has", () => {
    // KWD/BHD/OMR/JOD have three. Formatting the pasted amount back into the
    // chip at two would round it away before the send ever saw it.
    expect(splitChipPaste("12.345 lunch", "en-US", 3)).toEqual({
      amount: "12.345",
      title: "lunch",
    });
    expect(splitChipPaste("12.345 lunch")).toEqual({ amount: "12.35", title: "lunch" });
  });

  it("hands a wordless paste to the chip alone", () => {
    expect(splitChipPaste("100")).toEqual({ amount: "100", title: "" });
  });

  it("hands a numberless paste to the title alone", () => {
    expect(splitChipPaste("fruits")).toEqual({ amount: "", title: "fruits" });
  });

  it("trims what it hands over", () => {
    expect(splitChipPaste("  coffee 250  ")).toEqual({ amount: "", title: "coffee 250" });
    expect(splitChipPaste("  100  fruits  ")).toEqual({ amount: "100", title: "fruits" });
  });

  it("reads the amount against the user's locale", () => {
    expect(splitChipPaste("12,50 Mittagessen", "de-DE")).toEqual({
      amount: "12,5",
      title: "Mittagessen",
    });
  });

  it("does not trim an over-limit amount — the composer flags it instead", () => {
    expect(splitChipPaste("12345678901 rent").amount).toBe("12345678901");
  });
});
