import { describe, expect, it } from "vitest";
import {
  claimSendIntent,
  clearImporting,
  markImporting,
  maybeImported,
  recordSendIntent,
  SPLIT_IMPORTING_KEY,
  SPLIT_IMPORTING_TTL_MS,
  SPLIT_SEND_INTENT_KEY,
  SPLIT_SEND_INTENT_TTL_MS,
} from "@/lib/tools/split-send-intent";

/** A Storage stand-in: what two tabs of one origin share. */
function memory(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const T0 = 1_760_000_000_000;

describe("the one-time send intent", () => {
  it("is claimed once, for the draft it was given for", () => {
    const s = memory();
    recordSendIntent(s, "d-abc", T0);
    expect(claimSendIntent(s, "d-abc", T0 + 60_000)).toBe(true);
    // A second tab (or a reload) finds it gone.
    expect(claimSendIntent(s, "d-abc", T0 + 61_000)).toBe(false);
    expect(s.data.has(SPLIT_SEND_INTENT_KEY)).toBe(false);
  });

  it("is nothing without a click: no intent, no send", () => {
    expect(claimSendIntent(memory(), "d-abc", T0)).toBe(false);
  });

  it("goes stale after its window, and a stale one is cleared", () => {
    const s = memory();
    recordSendIntent(s, "d-abc", T0);
    expect(claimSendIntent(s, "d-abc", T0 + SPLIT_SEND_INTENT_TTL_MS + 1)).toBe(false);
    expect(s.data.has(SPLIT_SEND_INTENT_KEY)).toBe(false);
  });

  it("doesn't count for a draft that changed since (or a clock that went backwards)", () => {
    const s = memory();
    recordSendIntent(s, "d-abc", T0);
    expect(claimSendIntent(s, "d-xyz", T0 + 1_000)).toBe(false);
    // Left in place: it still belongs to its own draft, and expires on its own.
    expect(claimSendIntent(s, "d-abc", T0 + 2_000)).toBe(true);

    recordSendIntent(s, "d-abc", T0 + 60_000);
    expect(claimSendIntent(s, "d-abc", T0)).toBe(false);
  });

  it("treats an unreadable value as none, and clears it", () => {
    const s = memory();
    s.setItem(SPLIT_SEND_INTENT_KEY, "{not json");
    expect(claimSendIntent(s, "d-abc", T0)).toBe(false);
    expect(s.data.has(SPLIT_SEND_INTENT_KEY)).toBe(false);
    s.setItem(SPLIT_SEND_INTENT_KEY, JSON.stringify({ draftHash: "d-abc", at: "now" }));
    expect(claimSendIntent(s, "d-abc", T0)).toBe(false);
  });

  it("survives storage that throws, by not sending", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => recordSendIntent(broken, "d-abc", T0)).not.toThrow();
    expect(claimSendIntent(broken, "d-abc", T0)).toBe(false);
  });
});

describe("the importing marker (a reload mid-request)", () => {
  it("says an import of this draft may have gone through until it's cleared", () => {
    const s = memory();
    expect(maybeImported(s, "d-abc", T0)).toBe(false);
    markImporting(s, "d-abc", T0);
    expect(maybeImported(s, "d-abc", T0 + 5_000)).toBe(true);
    expect(maybeImported(s, "d-other", T0 + 5_000)).toBe(false);
    clearImporting(s);
    expect(maybeImported(s, "d-abc", T0 + 6_000)).toBe(false);
  });

  it("forgets a marker from a request long over", () => {
    const s = memory();
    markImporting(s, "d-abc", T0);
    expect(maybeImported(s, "d-abc", T0 + SPLIT_IMPORTING_TTL_MS + 1)).toBe(false);
    expect(s.data.has(SPLIT_IMPORTING_KEY)).toBe(false);
  });
});
