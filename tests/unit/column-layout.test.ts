import { describe, it, expect } from "vitest";
import {
  COLUMN_IDS,
  normalizeOrder,
  type ColumnId,
} from "@/components/app/transaction-columns-store";

/**
 * The transactions table's column order is a device-local preference, so a
 * column added by a release has to be merged into whatever each user saved.
 *
 * The first version appended, which put "tags" to the right of Amount and User
 * — past the edge of the table — for everyone with a saved layout. These pin
 * the two halves of the rule: nothing the user ordered moves, and a new column
 * still lands where it belongs.
 */
describe("normalizeOrder", () => {
  it("returns the default order when nothing is stored", () => {
    expect(normalizeOrder(null)).toEqual(COLUMN_IDS);
    expect(normalizeOrder([])).toEqual(COLUMN_IDS);
    expect(normalizeOrder("garbage")).toEqual(COLUMN_IDS);
    expect(normalizeOrder(["nope", 7])).toEqual(COLUMN_IDS);
  });

  it("keeps a stored order exactly as saved", () => {
    const stored: ColumnId[] = ["amount", "title", "date", "category", "tags", "attachments", "description", "user"];
    expect(normalizeOrder(stored)).toEqual(stored);
  });

  it("drops ids that are no longer columns", () => {
    expect(normalizeOrder(["date", "gone", "title"])).toEqual(
      expect.arrayContaining(["date", "title"]),
    );
    expect(normalizeOrder(["date", "gone", "title"])).not.toContain("gone");
  });

  it("slots a new column in after its default-order predecessor", () => {
    // A layout saved before "tags" existed, with title and category swapped.
    const stored: ColumnId[] = ["date", "title", "category", "attachments", "description", "amount", "user"];
    // "tags" follows "title" in COLUMN_IDS, so it lands after the user's title
    // — not at the end, past Amount and User where nobody would find it.
    expect(normalizeOrder(stored)).toEqual([
      "date",
      "title",
      "tags",
      "category",
      "attachments",
      "description",
      "amount",
      "user",
    ]);
  });

  it("puts a new column first when nothing precedes it", () => {
    const stored: ColumnId[] = ["category", "title", "tags", "attachments", "description", "amount", "user"];
    expect(normalizeOrder(stored)[0]).toBe("date");
  });

  it("rebuilds the default order from a layout missing most of it", () => {
    // Each restored column is the next one's predecessor, so they chain into
    // their default sequence instead of piling up in front of "amount".
    expect(normalizeOrder(["amount", "user"])).toEqual([
      "date",
      "category",
      "title",
      "tags",
      "attachments",
      "description",
      "amount",
      "user",
    ]);
  });

  it("never loses or duplicates a column", () => {
    const partial: ColumnId[] = ["user", "amount"];
    const merged = normalizeOrder(partial);
    expect([...merged].sort()).toEqual([...COLUMN_IDS].sort());
    expect(new Set(merged).size).toBe(merged.length);
  });
});
