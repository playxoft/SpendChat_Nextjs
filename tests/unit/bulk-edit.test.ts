import { describe, expect, it } from "vitest";
import { planBulkEdit, type BulkChange, type BulkRowState } from "@/lib/bulk-edit";

const row = (over: Partial<BulkRowState> = {}): BulkRowState => ({
  id: "r1",
  profileId: "p1",
  type: "expense",
  categoryId: null,
  tagIds: [],
  ...over,
});
const change = (over: Partial<BulkChange> = {}): BulkChange => ({
  addTagIds: [],
  removeTagIds: [],
  ...over,
});

describe("planBulkEdit", () => {
  it("moves the row to the target profile", () => {
    const plan = planBulkEdit(row(), change({ profileId: "p2" }), 10);
    expect(plan.next.profileId).toBe("p2");
    expect(plan.changed).toBe(true);
  });

  it("reports no change when the row is already where it's being moved", () => {
    expect(planBulkEdit(row(), change({ profileId: "p1" }), 10).changed).toBe(false);
  });

  it("sets a category of the row's own kind", () => {
    const plan = planBulkEdit(row(), change({ category: { id: "c1", kind: "expense" } }), 10);
    expect(plan.next.categoryId).toBe("c1");
    expect(plan.categorySkipped).toBe(false);
  });

  it("keeps the category and flags it when the kind doesn't match", () => {
    const plan = planBulkEdit(
      row({ type: "income", categoryId: "salary" }),
      change({ category: { id: "c1", kind: "expense" } }),
      10,
    );
    expect(plan.next.categoryId).toBe("salary");
    expect(plan.categorySkipped).toBe(true);
    expect(plan.changed).toBe(false);
  });

  it("clears the category on either kind", () => {
    expect(planBulkEdit(row({ type: "income", categoryId: "x" }), change({ category: null }), 10).next.categoryId).toBeNull();
    expect(planBulkEdit(row({ categoryId: "y" }), change({ category: null }), 10).next.categoryId).toBeNull();
  });

  it("leaves the category alone when none is asked for", () => {
    expect(planBulkEdit(row({ categoryId: "y" }), change({ profileId: "p2" }), 10).next.categoryId).toBe("y");
  });

  it("appends added tags after the row's own, without duplicates", () => {
    const plan = planBulkEdit(row({ tagIds: ["a", "b"] }), change({ addTagIds: ["c", "a"] }), 10);
    expect(plan.next.tagIds).toEqual(["a", "b", "c"]);
  });

  it("removes tags and keeps the rest in order", () => {
    const plan = planBulkEdit(row({ tagIds: ["a", "b", "c"] }), change({ removeTagIds: ["b"] }), 10);
    expect(plan.next.tagIds).toEqual(["a", "c"]);
  });

  it("removes before adding, so a swap at the cap fits", () => {
    const plan = planBulkEdit(row({ tagIds: ["a", "b"] }), change({ removeTagIds: ["a"], addTagIds: ["c"] }), 2);
    expect(plan.next.tagIds).toEqual(["b", "c"]);
    expect(plan.tagsSkipped).toBe(false);
  });

  it("leaves the tags untouched, all or nothing, when the result passes the cap", () => {
    const plan = planBulkEdit(row({ tagIds: ["a", "b"] }), change({ addTagIds: ["c", "d"] }), 3);
    expect(plan.next.tagIds).toEqual(["a", "b"]);
    expect(plan.tagsSkipped).toBe(true);
    expect(plan.changed).toBe(false);
  });

  it("reports no change for adding a tag the row already has", () => {
    expect(planBulkEdit(row({ tagIds: ["a"] }), change({ addTagIds: ["a"] }), 10).changed).toBe(false);
  });

  it("doesn't mutate the input row", () => {
    const input = row({ tagIds: ["a"] });
    planBulkEdit(input, change({ addTagIds: ["b"], profileId: "p9" }), 10);
    expect(input).toEqual(row({ tagIds: ["a"] }));
  });
});
