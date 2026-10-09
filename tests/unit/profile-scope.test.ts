import { describe, it, expect } from "vitest";
import {
  SCOPE_MAX_ITEMS,
  canonicalProfileParam,
  formatProfileScope,
  isMultiScope,
  parseProfileScope,
  resolveProfileScope,
  scopeLabel,
  scopeMembership,
  scopeOf,
  toggleScopeItem,
  writeTargetOf,
  type ProfileScope,
} from "@/lib/profile-scope";
import { hrefWithProfile } from "@/components/app/nav-items";
import { optimisticTotals, profileInView } from "@/lib/summary";

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;

// Two spaces: S1 holds P1, P2; S2 holds P3. Server order P1, P2, P3.
const S1 = id(101);
const S2 = id(102);
const S3 = id(103); // a space with nothing the viewer can see
const P1 = id(1);
const P2 = id(2);
const P3 = id(3);
const FORGED = id(999);
const PROFILES = [
  { id: P1, spaceId: S1, name: "Personal" },
  { id: P2, spaceId: S1, name: "Home" },
  { id: P3, spaceId: S2, name: "Company" },
];
const SPACES = [S1, S2, S3];

const pick = (...items: string[]): ProfileScope => parseProfileScope(items.join(","));

describe("parseProfileScope", () => {
  it("reads no parameter (or a blank one) as the default view", () => {
    expect(parseProfileScope(null)).toEqual({ kind: "default" });
    expect(parseProfileScope(undefined)).toEqual({ kind: "default" });
    expect(parseProfileScope("  ")).toEqual({ kind: "default" });
  });

  it("reads 'all' as every profile", () => {
    expect(parseProfileScope("all")).toEqual({ kind: "all" });
  });

  it("keeps an old single-profile link meaning one profile", () => {
    expect(parseProfileScope(P1)).toEqual({ kind: "pick", items: [{ kind: "profile", id: P1 }] });
    expect(isMultiScope(parseProfileScope(P1))).toBe(false);
  });

  it("reads a list of profiles and `s.`-prefixed spaces, in order", () => {
    expect(parseProfileScope(`${P3}, s.${S1} ,${P1}`)).toEqual({
      kind: "pick",
      items: [
        { kind: "profile", id: P3 },
        { kind: "space", id: S1 },
        { kind: "profile", id: P1 },
      ],
    });
  });

  it("lower-cases ids, so the same id can't be selected twice by case", () => {
    expect(parseProfileScope(`${P1.toUpperCase()},${P1}`)).toEqual({
      kind: "pick",
      items: [{ kind: "profile", id: P1 }],
    });
  });

  it("drops malformed items, duplicates and a stray 'all', keeping the rest", () => {
    expect(parseProfileScope(`junk,${P1},s.nope,x.${S1},all,${P1},s.${S1},s.${S1}`)).toEqual({
      kind: "pick",
      items: [
        { kind: "profile", id: P1 },
        { kind: "space", id: S1 },
      ],
    });
  });

  it("falls back to the default when nothing usable is left, as a bad single id always did", () => {
    expect(parseProfileScope("not-a-uuid")).toEqual({ kind: "default" });
    expect(parseProfileScope(",,s.,")).toEqual({ kind: "default" });
  });

  it("caps a hand-made list at SCOPE_MAX_ITEMS", () => {
    const many = Array.from({ length: SCOPE_MAX_ITEMS + 20 }, (_, i) => id(1000 + i)).join(",");
    const scope = parseProfileScope(many);
    expect(scope.kind === "pick" && scope.items.length).toBe(SCOPE_MAX_ITEMS);
  });
});

describe("formatProfileScope / canonicalProfileParam", () => {
  it("leaves the default off the URL and spells the rest", () => {
    expect(formatProfileScope({ kind: "default" })).toBeNull();
    expect(formatProfileScope({ kind: "all" })).toBe("all");
    expect(formatProfileScope(scopeOf({ kind: "profile", id: P1 }))).toBe(P1);
    expect(formatProfileScope(scopeOf({ kind: "space", id: S1 }))).toBe(`s.${S1}`);
  });

  it("round-trips a selection", () => {
    const value = `${P3},s.${S1}`;
    expect(formatProfileScope(parseProfileScope(value))).toBe(value);
  });

  it("canonicalizes: trims, dedupes, lower-cases, drops junk", () => {
    expect(canonicalProfileParam(` ${P1.toUpperCase()} ,junk,${P1}, s.${S2}`)).toBe(
      `${P1},s.${S2}`,
    );
    expect(canonicalProfileParam("junk")).toBeNull();
    expect(canonicalProfileParam(null)).toBeNull();
  });
});

describe("hrefWithProfile", () => {
  it("carries nothing for the default view", () => {
    expect(hrefWithProfile("/app/analytics", null)).toBe("/app/analytics");
  });

  it("carries one profile and 'all' exactly as before", () => {
    expect(hrefWithProfile("/app/analytics", P1)).toBe(`/app/analytics?profile=${P1}`);
    expect(hrefWithProfile("/app", "all")).toBe("/app?profile=all");
  });

  it("carries a selection in its canonical form, commas unescaped", () => {
    expect(hrefWithProfile("/app/transactions", `${P1},s.${S2},${P1}`)).toBe(
      `/app/transactions?profile=${P1},s.${S2}`,
    );
  });

  it("drops a mangled value instead of passing it along", () => {
    expect(hrefWithProfile("/app", "<script>")).toBe("/app");
  });
});

describe("resolveProfileScope", () => {
  it("resolves the default to the first profile, or to all when there are none", () => {
    expect(resolveProfileScope({ kind: "default" }, PROFILES)).toEqual({
      profileIds: [P1],
      single: P1,
      multi: false,
    });
    expect(resolveProfileScope({ kind: "default" }, [])).toEqual({
      profileIds: undefined,
      single: undefined,
      multi: false,
    });
  });

  it("resolves 'all' to no narrowing at all", () => {
    expect(resolveProfileScope({ kind: "all" }, PROFILES).profileIds).toBeUndefined();
  });

  it("resolves one known profile to itself, locked", () => {
    expect(resolveProfileScope(pick(P2), PROFILES)).toEqual({
      profileIds: [P2],
      single: P2,
      multi: false,
    });
  });

  it("resolves a forged or foreign single id to an empty view, never a wider one", () => {
    expect(resolveProfileScope(pick(FORGED), PROFILES)).toEqual({
      profileIds: [],
      single: undefined,
      multi: false,
    });
  });

  it("expands a space to the profiles the viewer can see in it", () => {
    expect(resolveProfileScope(pick(`s.${S1}`), PROFILES)).toEqual({
      profileIds: [P1, P2],
      single: undefined,
      multi: true,
    });
    // A space with nothing visible in it is an empty selection.
    expect(resolveProfileScope(pick(`s.${S3}`), PROFILES).profileIds).toEqual([]);
  });

  it("ignores forged ids among real ones and dedupes overlaps, in selection order", () => {
    const r = resolveProfileScope(pick(P3, FORGED, `s.${FORGED}`, `s.${S1}`, P1), PROFILES);
    expect(r.profileIds).toEqual([P3, P1, P2]);
    expect(r.multi).toBe(true);
  });
});

describe("writeTargetOf", () => {
  it("locks writes to the one profile in view", () => {
    expect(writeTargetOf(resolveProfileScope(pick(P2), PROFILES), PROFILES)).toEqual({
      activeProfileId: P2,
      allProfiles: false,
    });
  });

  it("opens the picker on a selection, starting at its first profile", () => {
    expect(writeTargetOf(resolveProfileScope(pick(P3, P1), PROFILES), PROFILES)).toEqual({
      activeProfileId: P3,
      allProfiles: true,
    });
  });

  it("falls back to the first profile for 'all' and for an empty selection", () => {
    for (const scope of [{ kind: "all" } as const, pick(`s.${S3}`)]) {
      expect(writeTargetOf(resolveProfileScope(scope, PROFILES), PROFILES)).toEqual({
        activeProfileId: P1,
        allProfiles: true,
      });
    }
  });
});

describe("toggleScopeItem", () => {
  const toggle = (scope: ProfileScope, kind: "profile" | "space", itemId: string) => {
    const next = toggleScopeItem(scope, { kind, id: itemId }, PROFILES, SPACES);
    return next && formatProfileScope(next);
  };

  it("starts from what is on screen: the default view's first profile", () => {
    expect(toggle({ kind: "default" }, "profile", P3)).toBe(`${P1},${P3}`);
  });

  it("starts from nothing on 'All profiles', so Shift+click just picks the row", () => {
    expect(toggle({ kind: "all" }, "profile", P3)).toBe(P3);
  });

  it("adds and removes profiles", () => {
    expect(toggle(pick(P1), "profile", P2)).toBe(`${P1},${P2}`);
    expect(toggle(pick(P1, P2), "profile", P1)).toBe(P2);
  });

  it("won't empty the selection", () => {
    expect(toggle(pick(P1), "profile", P1)).toBeNull();
    expect(toggle({ kind: "default" }, "profile", P1)).toBeNull();
    expect(toggle(pick(`s.${S1}`), "space", S1)).toBeNull();
  });

  it("adding a space absorbs its profiles' own items", () => {
    expect(toggle(pick(P1, P3), "space", S1)).toBe(`${P3},s.${S1}`);
  });

  it("removes a space", () => {
    expect(toggle(pick(P3, `s.${S1}`), "space", S1)).toBe(P3);
  });

  it("taking out a profile selected through its space keeps the rest of that space", () => {
    expect(toggle(pick(P3, `s.${S1}`), "profile", P1)).toBe(`${P3},${P2}`);
    // Its only profile: the space goes, and with nothing else left, nothing changes.
    expect(toggle(pick(`s.${S2}`), "profile", P3)).toBeNull();
  });

  it("drops items the sidebar no longer shows on the way through", () => {
    expect(toggle(pick(FORGED, `s.${FORGED}`, P1), "profile", P3)).toBe(`${P1},${P3}`);
  });

  it("refuses to grow past SCOPE_MAX_ITEMS", () => {
    const many = Array.from({ length: SCOPE_MAX_ITEMS }, (_, i) => ({
      id: id(2000 + i),
      spaceId: S1,
      name: `p${i}`,
    }));
    const full: ProfileScope = {
      kind: "pick",
      items: many.map((p) => ({ kind: "profile" as const, id: p.id })),
    };
    expect(
      toggleScopeItem(full, { kind: "profile", id: P3 }, [...many, ...PROFILES], SPACES),
    ).toBeNull();
  });
});

describe("scopeMembership", () => {
  it("marks a picked space and every profile it covers", () => {
    const m = scopeMembership(pick(P3, `s.${S1}`), PROFILES);
    expect([...m.spaces]).toEqual([S1]);
    expect([...m.profiles].sort()).toEqual([P1, P2, P3]);
  });

  it("marks the default's first profile, and nothing on 'All profiles'", () => {
    expect([...scopeMembership({ kind: "default" }, PROFILES).profiles]).toEqual([P1]);
    const all = scopeMembership({ kind: "all" }, PROFILES);
    expect(all.profiles.size + all.spaces.size).toBe(0);
  });
});

describe("scopeLabel", () => {
  it("names what is in view", () => {
    expect(scopeLabel(resolveProfileScope({ kind: "all" }, PROFILES), PROFILES)).toBe("All profiles");
    expect(scopeLabel(resolveProfileScope(pick(P2), PROFILES), PROFILES)).toBe("Home");
    expect(scopeLabel(resolveProfileScope(pick(`s.${S1}`), PROFILES), PROFILES)).toBe(
      "Personal, Home",
    );
    expect(scopeLabel(resolveProfileScope(pick(`s.${S1}`, P3), PROFILES), PROFILES, 2)).toBe(
      "Personal, Home +1",
    );
  });

  it("says so when the view holds nothing the viewer can see", () => {
    expect(scopeLabel(resolveProfileScope(pick(FORGED), PROFILES), PROFILES)).toBe(
      "Selected profile",
    );
    expect(scopeLabel(resolveProfileScope(pick(`s.${S3}`), PROFILES), PROFILES)).toBe(
      "No profiles",
    );
  });
});

describe("profileInView / optimisticTotals over a selection", () => {
  it("is everything for 'All profiles' and set membership otherwise", () => {
    expect(profileInView(null)("x")).toBe(true);
    expect(profileInView(null)(null)).toBe(true);
    const inView = profileInView([P1, P3]);
    expect([inView(P1), inView(P2), inView(P3), inView(null)]).toEqual([true, false, true, false]);
  });

  it("counts pending sends to any selected profile, and none to the others", () => {
    const month = { monthStart: "2026-10-01", monthEnd: "2026-10-31" };
    const send = (profileId: string, amountMinor: number) => ({
      status: "sending" as const,
      type: "expense" as const,
      amountMinor,
      profileId,
      occurredOn: "2026-10-09",
    });
    const totals = optimisticTotals(
      { income: 0, expense: 100 },
      [send(P1, 10), send(P2, 20), send(P3, 40)],
      { ...month, serverTxnIds: [], profileIds: [P1, P3] },
    );
    expect(totals.expense).toBe(150);
  });
});
