import { describe, it, expect } from "vitest";
import { parseBulk } from "@/lib/bulk-parser";

const TODAY = "2026-06-27";

describe("parseBulk — happy paths", () => {
  it("parses a minimal expense line (amount only)", () => {
    const { drafts, errors } = parseBulk("12.50", TODAY);
    expect(errors).toEqual([]);
    expect(drafts).toEqual([
      {
        type: "expense",
        amount: 12.5,
        note: "",
        categoryName: null,
        occurredOn: TODAY,
      },
    ]);
  });

  it("reads note, category, and defaults the date to today", () => {
    const { drafts } = parseBulk("12.50, Lunch, Food & Dining", TODAY);
    expect(drafts[0]).toMatchObject({
      amount: 12.5,
      note: "Lunch",
      categoryName: "Food & Dining",
      type: "expense",
      occurredOn: TODAY,
    });
  });

  it("uses a leading + for income and - for expense", () => {
    expect(parseBulk("+2000, Salary, Salary", TODAY).drafts[0].type).toBe("income");
    expect(parseBulk("-40, Groceries", TODAY).drafts[0].type).toBe("expense");
  });

  it("lets the explicit type column override the sign", () => {
    const { drafts } = parseBulk("+50, x, , expense", TODAY);
    expect(drafts[0].type).toBe("expense");
  });

  it("accepts type aliases", () => {
    expect(parseBulk("10, x, , inc", TODAY).drafts[0].type).toBe("income");
    expect(parseBulk("10, x, , out", TODAY).drafts[0].type).toBe("expense");
  });

  it("accepts an explicit valid date", () => {
    expect(parseBulk("10, x, , , 2026-06-15", TODAY).drafts[0].occurredOn).toBe(
      "2026-06-15",
    );
  });

  it("skips blank lines and # comments", () => {
    const { drafts, errors } = parseBulk("\n# a comment\n10, x\n", TODAY);
    expect(errors).toEqual([]);
    expect(drafts).toHaveLength(1);
  });

  it("truncates an over-long note to 280 chars", () => {
    const longNote = "a".repeat(400);
    const { drafts } = parseBulk(`10, ${longNote}`, TODAY);
    expect(drafts[0].note).toHaveLength(280);
  });
});

describe("parseBulk — errors (with line numbers)", () => {
  it("reports an unreadable amount", () => {
    const { errors } = parseBulk("abc, x", TODAY);
    expect(errors[0]).toMatchObject({ line: 1, message: "Could not read an amount" });
  });

  it("rejects a non-positive amount", () => {
    expect(parseBulk("0, x", TODAY).errors[0].message).toBe(
      "Amount must be a positive number",
    );
  });

  it("rejects an oversized amount", () => {
    expect(parseBulk("1000000001, x", TODAY).errors[0].message).toBe(
      "Amount is too large",
    );
  });

  it("rejects an unknown type", () => {
    expect(parseBulk("10, x, , bogus", TODAY).errors[0].message).toContain(
      'Unknown type "bogus"',
    );
  });

  it("rejects a malformed format, an out-of-range, and a non-existent calendar date", () => {
    expect(parseBulk("10, x, , , 06/01/2026", TODAY).errors[0].message).toContain(
      "Invalid date",
    ); // wrong format → fails the regex guard
    expect(parseBulk("10, x, , , 2026-13-40", TODAY).errors[0].message).toContain(
      "Invalid date",
    ); // matches format, invalid Date
    expect(parseBulk("10, x, , , 2026-02-30", TODAY).errors[0].message).toContain(
      "Invalid date",
    ); // matches format, rolls over the month
  });

  it("accepts the last valid day of February", () => {
    expect(parseBulk("10, x, , , 2026-02-28", TODAY).errors).toEqual([]);
  });

  it("tracks the line number of an error on a later line", () => {
    const { errors } = parseBulk("10, ok\nabc, bad", TODAY);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
  });
});
