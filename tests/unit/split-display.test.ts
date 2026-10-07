import { describe, it, expect } from "vitest";
import {
  acceptAmountInput,
  compareFeed,
  feedCursor,
  mergeFeed,
  balanceChipText,
  balanceStatus,
  dayInZone,
  initialsOf,
  myPart,
  SETTLED_UP,
} from "@/lib/split-display";
import { parseAmountInput } from "@/lib/parse-amount";

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

describe("acceptAmountInput", () => {
  it("keeps digits from any keypad script — Devanagari, Arabic-Indic, Bengali", () => {
    expect(acceptAmountInput("", "१२३", "hi-IN")).toBe("१२३");
    expect(parseAmountInput(acceptAmountInput("", "१२३", "hi-IN"), "hi-IN")).toBe(123);
    expect(acceptAmountInput("", "١٢٣", "ar-EG")).toBe("١٢٣");
    expect(acceptAmountInput("", "৪৫", "bn-IN")).toBe("৪৫");
  });

  it("drops letters and symbols but keeps the locale's separators", () => {
    expect(acceptAmountInput("", "₹1,250.50abc", "en-IN")).toBe("1,250.50");
    expect(acceptAmountInput("", "1.250,50", "de-DE")).toBe("1.250,50");
  });

  it("refuses a keystroke past 9 whole-number digits", () => {
    expect(acceptAmountInput("123456789", "1234567890", "en-US")).toBe("123456789");
    expect(acceptAmountInput("१२३४५६७८९", "१२३४५६७८९०", "hi-IN")).toBe("१२३४५६७८९");
    expect(acceptAmountInput("123456789", "123456789.99", "en-US")).toBe("123456789.99");
  });
});

describe("balanceChipText", () => {
  it("has a full and a short form", () => {
    expect(balanceChipText(120000, "₹1,200")).toEqual({ full: "You're owed ₹1,200", short: "+₹1,200" });
    expect(balanceChipText(-30000, "₹300")).toEqual({ full: "You owe ₹300", short: "−₹300" });
    expect(balanceChipText(0, "₹0")).toEqual({ full: "Settled Up", short: "Settled Up" });
  });
});

describe("dayInZone", () => {
  it("is the calendar day in the viewer's timezone", () => {
    const at = new Date("2026-10-01T20:30:00Z");
    expect(dayInZone(at, "UTC")).toBe("2026-10-01");
    expect(dayInZone(at, "Asia/Kolkata")).toBe("2026-10-02");
    expect(dayInZone(at, "America/Los_Angeles")).toBe("2026-10-01");
  });
});

describe("feed paging", () => {
  const item = (id: string, date: string, at: string) => ({ id, date, at: new Date(at) });
  const a = item("00000000-0000-7000-8000-000000000001", "2026-09-01", "2026-09-05T10:00:00.000Z");
  const b = item("00000000-0000-7000-8000-000000000002", "2026-09-03", "2026-09-01T10:00:00.000Z");
  const c = item("00000000-0000-7000-8000-000000000003", "2026-09-03", "2026-09-02T10:00:00.000Z");
  const d = item("00000000-0000-7000-8000-000000000004", "2026-09-03", "2026-09-02T10:00:00.000Z");

  it("orders by date, then when added, then id — like the server", () => {
    expect([d, b, a, c].sort(compareFeed)).toEqual([a, b, c, d]);
  });

  it("asks for the page before the oldest item on screen", () => {
    expect(feedCursor(b)).toEqual({ day: "2026-09-03", at: "2026-09-01T10:00:00.000Z", id: b.id });
  });

  it("keeps earlier pages when a fresh newest page arrives", () => {
    // [a, b] were loaded with "Show earlier"; the new newest page starts at c.
    expect(mergeFeed([a, b, c], [c, d])).toEqual([a, b, c, d]);
  });

  it("drops what the fresh page now covers, and anything newer than its start", () => {
    // b was deleted and c edited: the re-read page [c, d] is the truth from c up.
    const cEdited = { ...c };
    expect(mergeFeed([a, b, c], [b, cEdited, d]).map((i) => i.id)).toEqual([a.id, b.id, c.id, d.id]);
    expect(mergeFeed([a, b, c, d], [d])).toEqual([a, b, c, d]);
    expect(mergeFeed([a, b, c, d], [c]).map((i) => i.id)).toEqual([a.id, b.id, c.id]);
  });

  it("an empty page means nothing is left", () => {
    expect(mergeFeed([a, b], [])).toEqual([]);
  });
});
