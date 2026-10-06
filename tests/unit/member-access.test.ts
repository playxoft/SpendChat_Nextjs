import { describe, expect, it } from "vitest";
import { accessEqual, accessSummary, spacesSummary, withRole } from "@/lib/member-access";

/** The People list's access picker: summaries, change detection and role switches. */

const spaces = [
  { id: "s1", name: "Home", icon: "🏠" },
  { id: "s2", name: "Work", icon: null },
  { id: "s3", name: "Trips", icon: null },
];
const profiles = [
  { id: "p1", name: "Personal", icon: "👤" },
  { id: "p2", name: "Office", icon: null },
];

describe("spacesSummary", () => {
  it("reads all / none / one / many", () => {
    expect(spacesSummary(["s1", "s2", "s3"], spaces)).toBe("All spaces");
    expect(spacesSummary([], spaces)).toBe("No spaces");
    expect(spacesSummary(["s1"], spaces)).toBe("🏠 Home");
    expect(spacesSummary(["s1", "s3"], spaces)).toBe("2 spaces");
  });
  it("ignores ids of spaces it doesn't know", () => {
    expect(spacesSummary(["gone"], spaces)).toBe("No spaces");
  });
});

describe("accessSummary", () => {
  it("summarises a role with its spaces, e.g. 'Editor · 2 spaces'", () => {
    expect(accessSummary({ mode: "all", role: "editor", spaceIds: ["s1", "s2"] }, spaces, profiles)).toBe(
      "Editor · 2 spaces",
    );
    expect(
      accessSummary({ mode: "all", role: "viewer", spaceIds: ["s1", "s2", "s3"] }, spaces, profiles),
    ).toBe("Viewer · All spaces");
  });
  it("is just the role for admins, and when the spaces aren't known", () => {
    expect(accessSummary({ mode: "all", role: "admin" }, spaces, profiles)).toBe("Admin");
    expect(accessSummary({ mode: "all", role: "editor" }, spaces, profiles)).toBe("Editor");
  });
  it("summarises per-profile grants", () => {
    expect(
      accessSummary({ mode: "profiles", entries: [{ profileId: "p1", role: "viewer" }] }, spaces, profiles),
    ).toBe("👤 Personal");
    expect(
      accessSummary(
        {
          mode: "profiles",
          entries: [
            { profileId: "p1", role: "viewer" },
            { profileId: "p2", role: "editor" },
          ],
        },
        spaces,
        profiles,
      ),
    ).toBe("2 profiles");
    expect(accessSummary({ mode: "profiles", entries: [] }, spaces, profiles)).toBe("No profiles");
  });
});

describe("accessEqual", () => {
  it("compares space lists as sets", () => {
    expect(
      accessEqual(
        { mode: "all", role: "editor", spaceIds: ["s1", "s2"] },
        { mode: "all", role: "editor", spaceIds: ["s2", "s1"] },
      ),
    ).toBe(true);
    expect(
      accessEqual(
        { mode: "all", role: "editor", spaceIds: ["s1"] },
        { mode: "all", role: "editor", spaceIds: ["s1", "s2"] },
      ),
    ).toBe(false);
  });
  it("ignores spaces for admins, and tells modes and roles apart", () => {
    expect(
      accessEqual({ mode: "all", role: "admin", spaceIds: ["s1"] }, { mode: "all", role: "admin" }),
    ).toBe(true);
    expect(accessEqual({ mode: "all", role: "viewer", spaceIds: [] }, { mode: "all", role: "editor", spaceIds: [] })).toBe(false);
    expect(
      accessEqual({ mode: "all", role: "viewer", spaceIds: [] }, { mode: "profiles", entries: [] }),
    ).toBe(false);
  });
  it("compares per-profile grants by profile and role", () => {
    const a = {
      mode: "profiles" as const,
      entries: [
        { profileId: "p1", role: "viewer" as const },
        { profileId: "p2", role: "editor" as const },
      ],
    };
    expect(accessEqual(a, { mode: "profiles", entries: [...a.entries].reverse() })).toBe(true);
    expect(
      accessEqual(a, {
        mode: "profiles",
        entries: [
          { profileId: "p1", role: "editor" },
          { profileId: "p2", role: "editor" },
        ],
      }),
    ).toBe(false);
  });
});

describe("withRole", () => {
  const all = ["s1", "s2", "s3"];
  it("drops spaces for admin", () => {
    expect(withRole({ mode: "all", role: "viewer", spaceIds: ["s1"] }, "admin", all)).toEqual({
      mode: "all",
      role: "admin",
    });
  });
  it("keeps picked spaces when switching between viewer and editor", () => {
    expect(withRole({ mode: "all", role: "viewer", spaceIds: ["s1"] }, "editor", all)).toEqual({
      mode: "all",
      role: "editor",
      spaceIds: ["s1"],
    });
  });
  it("starts from every space after admin or per-profile access", () => {
    expect(withRole({ mode: "all", role: "admin" }, "viewer", all)).toEqual({
      mode: "all",
      role: "viewer",
      spaceIds: all,
    });
    expect(withRole({ mode: "profiles", entries: [] }, "editor", all)).toEqual({
      mode: "all",
      role: "editor",
      spaceIds: all,
    });
  });
});
