import { describe, it, expect } from "vitest";
import { DEMO_PROFILES } from "@/components/marketing/demo/demo-data";
import {
  DEMO_SPACES,
  SEED_PEOPLE,
  accessLabel,
  accessSentence,
  demoProfileRole,
  type DemoPerson,
} from "@/components/marketing/demo/workspaces-demo";
import { PLAN_LIMITS } from "@/lib/plans";

/**
 * The `/features/workspaces` demo says it "runs the real permission rules", and
 * the page's prose describes what its seeded people can see. These pin both:
 * the demo answers through `resolveProfileRole`, and the story it opens on —
 * owner sees everything, partner writes to Home with Personal hidden,
 * accountant reads Business only — is what that rule actually produces. If the
 * rule changes, this fails before the page starts telling visitors something
 * the app no longer does.
 */

const person = (id: string): DemoPerson => SEED_PEOPLE.find((p) => p.id === id)!;

const reach = (p: DemoPerson) =>
  Object.fromEntries(DEMO_PROFILES.map((profile) => [profile, demoProfileRole(p, profile)]));

describe("workspaces demo setup", () => {
  it("puts every demo profile in exactly one space", () => {
    for (const profile of DEMO_PROFILES) {
      const homes = DEMO_SPACES.filter((s) => s.profiles.includes(profile));
      expect(homes, `${profile} is in ${homes.length} spaces`).toHaveLength(1);
    }
  });

  it("fits inside the Free plan's spaces and profiles-per-space", () => {
    expect(DEMO_SPACES.length).toBeLessThanOrEqual(PLAN_LIMITS.free.spaces);
    for (const space of DEMO_SPACES) {
      expect(space.profiles.length).toBeLessThanOrEqual(PLAN_LIMITS.free.profilesPerSpace);
    }
  });
});

describe("the seeded story, through the real rule", () => {
  it("gives the owner admin on every profile", () => {
    expect(reach(person("asha"))).toEqual({ Personal: "admin", Home: "admin", Business: "admin" });
  });

  it("lets the partner write to Home, with Personal hidden by a profile setting", () => {
    expect(reach(person("priya"))).toEqual({ Personal: null, Home: "editor", Business: null });
  });

  it("lets the accountant read Business and nothing else", () => {
    expect(reach(person("dan"))).toEqual({ Personal: null, Home: null, Business: "viewer" });
  });
});

describe("per-profile settings", () => {
  it("can open a profile in a space the person isn't in", () => {
    const dan = { ...person("dan"), overrides: { Home: "read" as const } };
    expect(demoProfileRole(dan, "Home")).toBe("viewer");
    expect(demoProfileRole(dan, "Personal")).toBeNull();
  });

  it("can't narrow an admin — admins see every space", () => {
    const asha = { ...person("asha"), overrides: { Personal: "none" as const } };
    expect(demoProfileRole(asha, "Personal")).toBe("admin");
  });
});

describe("what the demo says", () => {
  it("uses the app's words for each level", () => {
    expect(accessLabel("editor")).toBe("Read + write");
    expect(accessLabel("viewer")).toBe("Read");
    expect(accessLabel("admin")).toBe("Admin");
    expect(accessLabel(null)).toBe("No access");
  });

  it("describes the partner and the accountant as the page does", () => {
    const priya = accessSentence(person("priya"));
    expect(priya).toContain("can add and edit in Home");
    expect(priya).toContain("can't see Personal or Business");
    expect(priya).toContain("per-profile setting wins over the Family space");

    const dan = accessSentence(person("dan"));
    expect(dan).toContain("can read Business");
    expect(dan).toContain("read-only notice");
  });

  it("says plainly when someone is in no space", () => {
    const nobody = { ...person("dan"), spaces: {} };
    expect(accessSentence(nobody)).toContain("sees no profile at all");
  });
});
