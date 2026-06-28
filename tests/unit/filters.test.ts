import { describe, it, expect } from "vitest";
import { parseActiveProfile, parseTxnFilters } from "@/lib/filters";

const UUID = "11111111-1111-1111-1111-111111111111";

/** Build the (key) => value getter parseTxnFilters expects. */
const getter = (params: Record<string, string>) => (key: string) =>
  key in params ? params[key] : null;

describe("parseActiveProfile", () => {
  it("returns a valid profile UUID", () => {
    expect(parseActiveProfile(UUID)).toBe(UUID);
  });
  it("treats 'all', invalid UUIDs and null as 'no filter'", () => {
    expect(parseActiveProfile("all")).toBeUndefined();
    expect(parseActiveProfile("not-a-uuid")).toBeUndefined();
    expect(parseActiveProfile(null)).toBeUndefined();
  });
});

describe("parseTxnFilters", () => {
  it("parses a fully-specified query", () => {
    const filters = parseTxnFilters(
      getter({
        type: "income",
        category: UUID,
        profile: UUID,
        from: "2026-01-01",
        to: "2026-12-31",
        q: "  coffee  ",
      }),
    );
    expect(filters).toEqual({
      type: "income",
      categoryId: UUID,
      profileId: UUID,
      from: "2026-01-01",
      to: "2026-12-31",
      search: "coffee",
    });
  });

  it("drops invalid / sentinel values", () => {
    const filters = parseTxnFilters(
      getter({
        type: "nonsense",
        category: "all",
        from: "01/01/2026",
        to: "bad",
        q: "   ",
      }),
    );
    expect(filters).toEqual({
      type: undefined,
      categoryId: undefined,
      profileId: undefined,
      from: undefined,
      to: undefined,
      search: undefined,
    });
  });

  it("accepts the expense type and a real category id", () => {
    const filters = parseTxnFilters(getter({ type: "expense", category: UUID }));
    expect(filters.type).toBe("expense");
    expect(filters.categoryId).toBe(UUID);
  });

  it("returns all-undefined for an empty query", () => {
    const filters = parseTxnFilters(getter({}));
    expect(Object.values(filters).every((v) => v === undefined)).toBe(true);
  });
});
