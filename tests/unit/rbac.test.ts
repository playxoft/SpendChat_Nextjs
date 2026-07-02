import { describe, it, expect } from "vitest";
import { WORKSPACE_ROLES, atLeastRole, maxRole, rolesAtLeast } from "@/lib/rbac";

describe("rbac", () => {
  it("orders roles viewer < editor < admin", () => {
    expect(WORKSPACE_ROLES).toEqual(["viewer", "editor", "admin"]);
    expect(atLeastRole("admin", "editor")).toBe(true);
    expect(atLeastRole("editor", "editor")).toBe(true);
    expect(atLeastRole("viewer", "editor")).toBe(false);
    expect(atLeastRole(null, "viewer")).toBe(false);
    expect(atLeastRole(undefined, "viewer")).toBe(false);
  });

  it("maxRole picks the higher of two roles, tolerating absence", () => {
    expect(maxRole("viewer", "admin")).toBe("admin");
    expect(maxRole("editor", "viewer")).toBe("editor");
    expect(maxRole(null, "viewer")).toBe("viewer");
    expect(maxRole("editor", null)).toBe("editor");
    expect(maxRole(null, undefined)).toBeNull();
  });

  it("rolesAtLeast returns the qualifying set for SQL IN filters", () => {
    expect(rolesAtLeast("viewer")).toEqual(["viewer", "editor", "admin"]);
    expect(rolesAtLeast("editor")).toEqual(["editor", "admin"]);
    expect(rolesAtLeast("admin")).toEqual(["admin"]);
  });
});
