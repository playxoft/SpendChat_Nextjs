import { describe, it, expect } from "vitest";
import { feedCompare, listCompare, mergeRestored, mergeRestoredIntoFeed } from "@/lib/merge-restored";

const row = (id: string, occurredOn: string, extra: Partial<{ amountMinor: number; title: string; type: "income" | "expense" }> = {}) => ({
  id,
  type: extra.type ?? ("expense" as const),
  amountMinor: extra.amountMinor ?? 100,
  occurredOn,
  createdAt: new Date(`${occurredOn}T12:00:00.000Z`),
  title: extra.title ?? id,
  description: null,
  categoryName: null,
});

describe("C1: putting restored rows back in the feed", () => {
  const feed = [row("a", "2026-06-02"), row("b", "2026-06-04"), row("c", "2026-06-06")]; // oldest first

  it("slots a restored row into its place in the loaded stretch", () => {
    const merged = mergeRestoredIntoFeed(feed, [row("x", "2026-06-05")], false);
    expect(merged.map((r) => r.id)).toEqual(["a", "b", "x", "c"]);
  });

  it("leaves a row older than the loaded stretch for the scroll — unless the feed is complete", () => {
    expect(mergeRestoredIntoFeed(feed, [row("old", "2026-01-01")], false).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(mergeRestoredIntoFeed(feed, [row("old", "2026-01-01")], true).map((r) => r.id)).toEqual([
      "old",
      "a",
      "b",
      "c",
    ]);
  });

  it("never duplicates a row that's already there", () => {
    expect(mergeRestoredIntoFeed(feed, [row("b", "2026-06-04")], true)).toBe(feed);
  });

  it("orders like the feed: date, then time, then id", () => {
    expect(feedCompare(row("a", "2026-06-01"), row("b", "2026-06-01"))).toBeLessThan(0);
  });
});

describe("C1: putting restored rows back in the table", () => {
  const list = [row("c", "2026-06-06"), row("b", "2026-06-04"), row("a", "2026-06-02")]; // newest first

  it("default order: newest first, within the loaded stretch", () => {
    const merged = mergeRestored(list, [row("x", "2026-06-05"), row("old", "2026-01-01")], listCompare({}), false);
    expect(merged.map((r) => r.id)).toEqual(["c", "x", "b", "a"]);
  });

  it("follows the column sort, both directions", () => {
    const byAmount = [row("s", "2026-06-01", { amountMinor: 50 }), row("l", "2026-06-01", { amountMinor: 500 })];
    // Ascending by signed amount: the biggest expense first.
    const asc = listCompare({ sort: "amount", dir: "asc" });
    const merged = mergeRestored([...byAmount].sort(asc), [row("m", "2026-06-01", { amountMinor: 200 })], asc, true);
    expect(merged.map((r) => r.id)).toEqual(["l", "m", "s"]);
    const titles = listCompare({ sort: "title", dir: "desc" });
    expect([row("a", "2026-06-01"), row("b", "2026-06-01")].sort(titles).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
