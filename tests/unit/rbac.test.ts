import { describe, it, expect } from "vitest";
import type { ProfileAccessLevel, SpaceRole, WorkspaceRole } from "@/db/schema";
import {
  OVERRIDE_ROLE,
  PROFILE_ACCESS_LEVELS,
  SPACE_ROLES,
  WORKSPACE_ROLES,
  accessLevelForRole,
  accessLevelsAtLeast,
  atLeastRole,
  maxRole,
  minRole,
  resolveProfileRole,
  rolesAtLeast,
  spaceRolesAtLeast,
  type ProfileRoleInputs,
} from "@/lib/rbac";

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

  it("minRole picks the lower of two roles", () => {
    expect(minRole("admin", "viewer")).toBe("viewer");
    expect(minRole("viewer", "editor")).toBe("viewer");
    expect(minRole("editor", "editor")).toBe("editor");
  });

  it("rolesAtLeast returns the qualifying set for SQL IN filters", () => {
    expect(rolesAtLeast("viewer")).toEqual(["viewer", "editor", "admin"]);
    expect(rolesAtLeast("editor")).toEqual(["editor", "admin"]);
    expect(rolesAtLeast("admin")).toEqual(["admin"]);
  });
});

describe("space roles and override levels", () => {
  it("a space grants viewer or editor, never admin", () => {
    expect(SPACE_ROLES).toEqual(["viewer", "editor"]);
    expect(spaceRolesAtLeast("viewer")).toEqual(["viewer", "editor"]);
    expect(spaceRolesAtLeast("editor")).toEqual(["editor"]);
    expect(spaceRolesAtLeast("admin")).toEqual([]);
  });

  it("override levels map none → no role, read → viewer, write → editor", () => {
    expect(PROFILE_ACCESS_LEVELS).toEqual(["none", "read", "write"]);
    expect(OVERRIDE_ROLE).toEqual({ none: null, read: "viewer", write: "editor" });
  });

  it("accessLevelsAtLeast lists the override levels that satisfy a role (none never does)", () => {
    expect(accessLevelsAtLeast("viewer")).toEqual(["read", "write"]);
    expect(accessLevelsAtLeast("editor")).toEqual(["write"]);
    // An override tops out at write, so it can never grant admin.
    expect(accessLevelsAtLeast("admin")).toEqual([]);
  });

  it("accessLevelForRole shows a role as the override level it equals", () => {
    expect(accessLevelForRole(null)).toBe("none");
    expect(accessLevelForRole("viewer")).toBe("read");
    expect(accessLevelForRole("editor")).toBe("write");
    // Admin has every right an override can express.
    expect(accessLevelForRole("admin")).toBe("write");
  });

  it("round-trips: a level's role maps back to the same level", () => {
    for (const level of PROFILE_ACCESS_LEVELS) {
      expect(accessLevelForRole(OVERRIDE_ROLE[level])).toBe(level);
    }
  });
});

describe("resolveProfileRole", () => {
  const none: ProfileRoleInputs = {
    workspaceRole: null,
    override: null,
    spaceRole: null,
    grantRole: null,
  };
  const r = (inputs: Partial<ProfileRoleInputs>) => resolveProfileRole({ ...none, ...inputs });

  it("gives nothing to someone with no rows at all", () => {
    expect(r({})).toBeNull();
  });

  it("a workspace admin always gets admin — no override, space or grant can lower it", () => {
    expect(r({ workspaceRole: "admin" })).toBe("admin");
    for (const override of [null, ...PROFILE_ACCESS_LEVELS] as (ProfileAccessLevel | null)[]) {
      for (const spaceRole of [null, ...SPACE_ROLES] as (SpaceRole | null)[]) {
        for (const grantRole of [null, ...WORKSPACE_ROLES] as (WorkspaceRole | null)[]) {
          expect(r({ workspaceRole: "admin", override, spaceRole, grantRole })).toBe("admin");
        }
      }
    }
  });

  describe("a member's per-profile override", () => {
    it("lowers: none hides a profile in the member's own space, read caps an editor", () => {
      expect(r({ workspaceRole: "editor", spaceRole: "editor", override: "none" })).toBeNull();
      expect(r({ workspaceRole: "viewer", spaceRole: "viewer", override: "none" })).toBeNull();
      expect(r({ workspaceRole: "editor", spaceRole: "editor", override: "read" })).toBe("viewer");
    });

    it("raises: write on a read-only space's profile, read on a space they're not in", () => {
      expect(r({ workspaceRole: "viewer", spaceRole: "viewer", override: "write" })).toBe("editor");
      expect(r({ workspaceRole: "viewer", spaceRole: null, override: "read" })).toBe("viewer");
      expect(r({ workspaceRole: "editor", spaceRole: null, override: "write" })).toBe("editor");
    });

    it("replaces a legacy grant too, in either direction", () => {
      expect(r({ workspaceRole: "viewer", grantRole: "admin", override: "read" })).toBe("viewer");
      expect(r({ workspaceRole: "viewer", grantRole: "editor", override: "none" })).toBeNull();
      expect(r({ workspaceRole: "viewer", grantRole: "viewer", override: "write" })).toBe("editor");
    });

    it("is ignored for a non-member — a stale override can never grant access", () => {
      expect(r({ override: "write" })).toBeNull();
      expect(r({ override: "read", spaceRole: "editor" })).toBeNull();
      // …nor take away a non-member's legacy grant.
      expect(r({ override: "none", grantRole: "editor" })).toBe("editor");
      expect(r({ override: "write", grantRole: "viewer" })).toBe("viewer");
    });
  });

  describe("space role and legacy grant", () => {
    it("a member gets their space role", () => {
      expect(r({ workspaceRole: "viewer", spaceRole: "viewer" })).toBe("viewer");
      expect(r({ workspaceRole: "viewer", spaceRole: "editor" })).toBe("editor");
      expect(r({ workspaceRole: "editor", spaceRole: "viewer" })).toBe("viewer");
    });

    it("a member outside the profile's space gets nothing (the workspace role alone doesn't reach it)", () => {
      expect(r({ workspaceRole: "editor" })).toBeNull();
      expect(r({ workspaceRole: "viewer" })).toBeNull();
    });

    it("ignores a space role for a non-member (a stale space_members row)", () => {
      expect(r({ spaceRole: "editor" })).toBeNull();
      expect(r({ spaceRole: "viewer" })).toBeNull();
    });

    it("a legacy grant raises, for members and non-members alike", () => {
      expect(r({ grantRole: "viewer" })).toBe("viewer");
      expect(r({ grantRole: "admin" })).toBe("admin");
      expect(r({ workspaceRole: "viewer", grantRole: "editor" })).toBe("editor");
      expect(r({ workspaceRole: "viewer", spaceRole: "viewer", grantRole: "admin" })).toBe("admin");
    });

    it("takes the higher of space role and grant — a grant never lowers", () => {
      expect(r({ workspaceRole: "viewer", spaceRole: "editor", grantRole: "viewer" })).toBe("editor");
      expect(r({ workspaceRole: "viewer", spaceRole: "viewer", grantRole: "editor" })).toBe("editor");
      for (const spaceRole of SPACE_ROLES) {
        for (const grantRole of WORKSPACE_ROLES) {
          expect(r({ workspaceRole: "editor", spaceRole, grantRole })).toBe(
            maxRole(spaceRole, grantRole),
          );
        }
      }
    });
  });

  it("matches the documented precedence for every combination of inputs", () => {
    const roles: (WorkspaceRole | null)[] = [null, ...WORKSPACE_ROLES];
    const overrides: (ProfileAccessLevel | null)[] = [null, ...PROFILE_ACCESS_LEVELS];
    const spaceRoles: (SpaceRole | null)[] = [null, ...SPACE_ROLES];
    let checked = 0;
    for (const workspaceRole of roles) {
      for (const override of overrides) {
        for (const spaceRole of spaceRoles) {
          for (const grantRole of roles) {
            const member = workspaceRole != null;
            const expected =
              workspaceRole === "admin"
                ? "admin"
                : member && override != null
                  ? OVERRIDE_ROLE[override]
                  : maxRole(member ? spaceRole : null, grantRole);
            expect(resolveProfileRole({ workspaceRole, override, spaceRole, grantRole })).toBe(
              expected,
            );
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(4 * 4 * 3 * 4);
  });
});
