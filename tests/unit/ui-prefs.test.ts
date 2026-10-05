import { describe, expect, it } from "vitest";
import {
  SIDEBAR_COLLAPSED_MAX,
  collapsedSpacesInputSchema,
  normalizeCollapsedSpaces,
  normalizeUiPrefs,
} from "@/lib/validation";

/**
 * `user_settings.ui_prefs` is a jsonb bag whose whole point is that a new
 * preference ships without a migration — which only holds if reading one never
 * throws and never trusts the stored value. These cases are that contract: the
 * `'{}'` every existing row was backfilled with, a value from a build that spelt
 * it differently, and a column edited by hand.
 */

/** Every namespace's default — what an empty or unreadable bag reads as. */
const DEFAULTS = {
  composer: { density: "normal" },
  onboarding: { inviteNudgeDismissed: false },
  sidebar: { collapsedSpaces: [] },
};

describe("normalizeUiPrefs", () => {
  it("defaults an empty bag (what every existing row holds)", () => {
    expect(normalizeUiPrefs({})).toEqual(DEFAULTS);
  });
  it("keeps a stored value", () => {
    expect(normalizeUiPrefs({ composer: { density: "compact" } })).toEqual({
      ...DEFAULTS,
      composer: { density: "compact" },
    });
  });
  it("degrades a bad value to the default instead of throwing", () => {
    expect(normalizeUiPrefs({ composer: { density: "wat" } })).toEqual(DEFAULTS);
  });
  it("survives a non-object column value", () => {
    expect(normalizeUiPrefs("nonsense")).toEqual(DEFAULTS);
    expect(normalizeUiPrefs(null)).toEqual(DEFAULTS);
    expect(normalizeUiPrefs(undefined)).toEqual(DEFAULTS);
  });
  it("ignores namespaces it does not know", () => {
    expect(normalizeUiPrefs({ composer: { density: "compact" }, future: { x: 1 } })).toEqual({
      ...DEFAULTS,
      composer: { density: "compact" },
    });
  });
});

describe("normalizeUiPrefs — onboarding namespace", () => {
  it("defaults to not dismissed", () => {
    expect(normalizeUiPrefs({ composer: { density: "compact" } }).onboarding).toEqual({
      inviteNudgeDismissed: false,
    });
  });
  it("keeps a dismissal and degrades a non-boolean", () => {
    expect(normalizeUiPrefs({ onboarding: { inviteNudgeDismissed: true } }).onboarding).toEqual({
      inviteNudgeDismissed: true,
    });
    expect(normalizeUiPrefs({ onboarding: { inviteNudgeDismissed: "yes" } }).onboarding).toEqual({
      inviteNudgeDismissed: false,
    });
  });
});

describe("normalizeUiPrefs — sidebar namespace (folded spaces)", () => {
  const A = "0198f6a2-0000-7000-8000-00000000000a";
  const B = "0198f6a2-0000-7000-8000-00000000000b";

  it("keeps a stored list of space ids", () => {
    expect(normalizeUiPrefs({ sidebar: { collapsedSpaces: [A, B] } }).sidebar).toEqual({
      collapsedSpaces: [A, B],
    });
  });

  it("drops non-uuids and duplicates (case-insensitively), keeping the first order", () => {
    expect(
      normalizeUiPrefs({ sidebar: { collapsedSpaces: [B, 42, "nope", A, B.toUpperCase(), null] } })
        .sidebar,
    ).toEqual({ collapsedSpaces: [B, A] });
  });

  it("degrades a non-list to empty without touching the other namespaces", () => {
    expect(
      normalizeUiPrefs({ composer: { density: "compact" }, sidebar: { collapsedSpaces: "x" } }),
    ).toEqual({ ...DEFAULTS, composer: { density: "compact" } });
    expect(normalizeUiPrefs({ sidebar: "x" }).sidebar).toEqual({ collapsedSpaces: [] });
  });

  it("hands out a fresh default list each time, never a shared one", () => {
    const first = normalizeUiPrefs({});
    first.sidebar.collapsedSpaces.push(A);
    expect(normalizeUiPrefs({}).sidebar.collapsedSpaces).toEqual([]);
    const broken = normalizeUiPrefs("nonsense");
    broken.sidebar.collapsedSpaces.push(A);
    expect(normalizeUiPrefs("nonsense").sidebar.collapsedSpaces).toEqual([]);
  });

  it("caps the list at SIDEBAR_COLLAPSED_MAX, keeping the newest (first) ids", () => {
    const ids = Array.from(
      { length: SIDEBAR_COLLAPSED_MAX + 5 },
      (_, i) => `0198f6a2-0000-7000-8000-${i.toString(16).padStart(12, "0")}`,
    );
    const out = normalizeCollapsedSpaces(ids);
    expect(out).toHaveLength(SIDEBAR_COLLAPSED_MAX);
    expect(out).toEqual(ids.slice(0, SIDEBAR_COLLAPSED_MAX));
  });

  it("validates what a client sends: uuids only, at most the cap", () => {
    expect(collapsedSpacesInputSchema.safeParse([A, B]).success).toBe(true);
    expect(collapsedSpacesInputSchema.safeParse(["nope"]).success).toBe(false);
    expect(
      collapsedSpacesInputSchema.safeParse(Array.from({ length: SIDEBAR_COLLAPSED_MAX + 1 }, () => A))
        .success,
    ).toBe(false);
  });
});
