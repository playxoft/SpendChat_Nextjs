import { describe, expect, it } from "vitest";
import { normalizeUiPrefs } from "@/lib/validation";

/**
 * `user_settings.ui_prefs` is a jsonb bag whose whole point is that a new
 * preference ships without a migration — which only holds if reading one never
 * throws and never trusts the stored value. These cases are that contract: the
 * `'{}'` every existing row was backfilled with, a value from a build that spelt
 * it differently, and a column edited by hand.
 */
describe("normalizeUiPrefs", () => {
  it("defaults an empty bag (what every existing row holds)", () => {
    expect(normalizeUiPrefs({})).toEqual({ composer: { density: "normal" }, onboarding: { inviteNudgeDismissed: false } });
  });
  it("keeps a stored value", () => {
    expect(normalizeUiPrefs({ composer: { density: "compact" } })).toEqual({ composer: { density: "compact" }, onboarding: { inviteNudgeDismissed: false } });
  });
  it("degrades a bad value to the default instead of throwing", () => {
    expect(normalizeUiPrefs({ composer: { density: "wat" } })).toEqual({ composer: { density: "normal" }, onboarding: { inviteNudgeDismissed: false } });
  });
  it("survives a non-object column value", () => {
    expect(normalizeUiPrefs("nonsense")).toEqual({ composer: { density: "normal" }, onboarding: { inviteNudgeDismissed: false } });
    expect(normalizeUiPrefs(null)).toEqual({ composer: { density: "normal" }, onboarding: { inviteNudgeDismissed: false } });
    expect(normalizeUiPrefs(undefined)).toEqual({ composer: { density: "normal" }, onboarding: { inviteNudgeDismissed: false } });
  });
  it("ignores namespaces it does not know", () => {
    expect(normalizeUiPrefs({ composer: { density: "compact" }, future: { x: 1 } })).toEqual({ composer: { density: "compact" }, onboarding: { inviteNudgeDismissed: false } });
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
