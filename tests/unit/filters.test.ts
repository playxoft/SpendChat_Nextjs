import { describe, it, expect } from "vitest";
import { parseActiveProfile, parseTxnFilters, resolveWebProfile } from "@/lib/filters";

const UUID = "11111111-1111-1111-1111-111111111111";
const FIRST = "22222222-2222-2222-2222-222222222222";

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

describe("resolveWebProfile", () => {
  it("defaults to the first profile when no param is set", () => {
    expect(resolveWebProfile(null, FIRST)).toBe(FIRST);
  });
  it("returns undefined (All profiles) only for an explicit 'all'", () => {
    expect(resolveWebProfile("all", FIRST)).toBeUndefined();
  });
  it("honours an explicit profile UUID", () => {
    expect(resolveWebProfile(UUID, FIRST)).toBe(UUID);
  });
  it("falls back to the first profile for garbage values", () => {
    expect(resolveWebProfile("not-a-uuid", FIRST)).toBe(FIRST);
  });
  it("returns undefined when there are no profiles to default to", () => {
    expect(resolveWebProfile(null, undefined)).toBeUndefined();
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
      tagIds: undefined,
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

describe("parseTxnFilters — ?tags=", () => {
  const A = "0199a000-0000-7000-8000-00000000000a";
  const B = "0199a000-0000-7000-8000-00000000000b";

  it("parses a comma-separated list", () => {
    expect(parseTxnFilters(getter({ tags: `${A},${B}` })).tagIds).toEqual([A, B]);
  });

  it("tolerates spacing and dedupes", () => {
    expect(parseTxnFilters(getter({ tags: ` ${A} , ${B}, ${A} ` })).tagIds).toEqual([A, B]);
  });

  // A filter is a view: a mangled URL should narrow oddly, not 500. Unknown
  // shapes drop out, and a list of nothing but junk is the same as no filter.
  it("drops non-uuid entries, and yields undefined when none survive", () => {
    expect(parseTxnFilters(getter({ tags: `${A},nope,` })).tagIds).toEqual([A]);
    expect(parseTxnFilters(getter({ tags: "nope,also-nope" })).tagIds).toBeUndefined();
    expect(parseTxnFilters(getter({ tags: "" })).tagIds).toBeUndefined();
  });

  // A hand-written URL must not turn the filter into an unbounded IN list.
  it("caps the list", () => {
    const many = Array.from(
      { length: 40 },
      (_, i) => `0199a000-0000-7000-8000-0000000${String(i).padStart(5, "0")}`,
    );
    expect(parseTxnFilters(getter({ tags: many.join(",") })).tagIds).toHaveLength(10);
  });
});
