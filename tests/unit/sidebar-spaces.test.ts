import { describe, expect, it } from "vitest";
import {
  flattenGroups,
  groupProfilesBySpace,
  moveSpace,
  profileOrderAfterReorder,
  profileShortcut,
  toggleCollapsed,
} from "@/lib/sidebar-spaces";
import { SIDEBAR_COLLAPSED_MAX } from "@/lib/validation";

/** The sidebar's space tree: grouping, order, shortcuts and the folded list. */

const space = (id: string, position: number) => ({ id, position, name: id });
const profile = (id: string, spaceId: string) => ({ id, spaceId, name: id });

describe("groupProfilesBySpace", () => {
  it("orders spaces by position and keeps profiles in the given order", () => {
    const { groups, orphans } = groupProfilesBySpace(
      [space("b", 1), space("a", 0)],
      [profile("p1", "b"), profile("p2", "a"), profile("p3", "b")],
    );
    expect(groups.map((g) => g.space.id)).toEqual(["a", "b"]);
    expect(groups.map((g) => g.profiles.map((p) => p.id))).toEqual([["p2"], ["p1", "p3"]]);
    expect(orphans).toEqual([]);
  });
  it("keeps empty spaces, and returns profiles of unknown spaces as orphans", () => {
    const { groups, orphans } = groupProfilesBySpace(
      [space("a", 0), space("e", 1)],
      [profile("p1", "a"), profile("lost", "gone")],
    );
    expect(groups[1]).toEqual({ space: space("e", 1), profiles: [] });
    expect(orphans.map((p) => p.id)).toEqual(["lost"]);
  });
  it("breaks position ties by the order given", () => {
    const { groups } = groupProfilesBySpace([space("x", 0), space("y", 0)], []);
    expect(groups.map((g) => g.space.id)).toEqual(["x", "y"]);
  });
});

describe("flattenGroups + profileShortcut", () => {
  it("counts through every space top to bottom, orphans last", () => {
    const { groups, orphans } = groupProfilesBySpace(
      [space("a", 0), space("b", 1)],
      [profile("p3", "b"), profile("p1", "a"), profile("o", "zz"), profile("p2", "a")],
    );
    expect(flattenGroups(groups, orphans).map((p) => p.id)).toEqual(["p1", "p2", "p3", "o"]);
  });
  it("is Shift+1…9 then Shift+0, and nothing past the tenth", () => {
    expect(profileShortcut(0)).toBe("shift+1");
    expect(profileShortcut(8)).toBe("shift+9");
    expect(profileShortcut(9)).toBe("shift+0");
    expect(profileShortcut(10)).toBe("");
    expect(profileShortcut(-1)).toBe("");
  });
});

describe("toggleCollapsed", () => {
  it("puts a folded space first and unfolding removes it", () => {
    expect(toggleCollapsed(["x", "y"], "y", true)).toEqual(["y", "x"]);
    expect(toggleCollapsed(["x", "y"], "x", false)).toEqual(["y"]);
    expect(toggleCollapsed([], "x", false)).toEqual([]);
  });
  it("caps the list, dropping the oldest", () => {
    const full = Array.from({ length: SIDEBAR_COLLAPSED_MAX }, (_, i) => `s${i}`);
    const next = toggleCollapsed(full, "new", true);
    expect(next).toHaveLength(SIDEBAR_COLLAPSED_MAX);
    expect(next[0]).toBe("new");
    expect(next).not.toContain(`s${SIDEBAR_COLLAPSED_MAX - 1}`);
  });
});

describe("moveSpace", () => {
  const list = [space("a", 0), space("b", 1), space("c", 2)];
  it("swaps with the neighbour", () => {
    expect(moveSpace(list, "b", -1)?.map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(moveSpace(list, "b", 1)?.map((s) => s.id)).toEqual(["a", "c", "b"]);
  });
  it("refuses to move past either end or an unknown id", () => {
    expect(moveSpace(list, "a", -1)).toBeNull();
    expect(moveSpace(list, "c", 1)).toBeNull();
    expect(moveSpace(list, "zz", 1)).toBeNull();
  });
});

describe("profileOrderAfterReorder", () => {
  it("sends the whole workspace order with one space's profiles replaced", () => {
    const { groups, orphans } = groupProfilesBySpace(
      [space("a", 0), space("b", 1)],
      [profile("p1", "a"), profile("p2", "a"), profile("p3", "b"), profile("o", "zz")],
    );
    expect(
      profileOrderAfterReorder(groups, orphans, "a", [profile("p2", "a"), profile("p1", "a")]),
    ).toEqual(["p2", "p1", "p3", "o"]);
  });
});
