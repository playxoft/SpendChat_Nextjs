import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEntryMode, setEntryMode, showEntryMode } from "@/components/app/entry-mode-store";

/**
 * The composer's Manual/AI store, and the product tour's way through it: a
 * mode shown without being saved, so the tour never has the person's choice to
 * put back.
 */

const KEY = "spendchat.entry-mode";
let stored: Map<string, string>;

beforeEach(() => {
  stored = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
  });
});

afterEach(() => {
  showEntryMode(null);
  vi.unstubAllGlobals();
});

describe("entry-mode store", () => {
  it("reads the saved mode, Manual when there is none", () => {
    expect(readEntryMode()).toBe("manual");
    setEntryMode("ai");
    expect(stored.get(KEY)).toBe("ai");
    expect(readEntryMode()).toBe("ai");
  });

  it("shows a mode without saving it, and goes back to the saved one", () => {
    setEntryMode("ai");
    showEntryMode("manual");
    expect(readEntryMode()).toBe("manual");
    expect(stored.get(KEY)).toBe("ai");
    showEntryMode(null);
    expect(readEntryMode()).toBe("ai");
  });

  it("keeps a choice made while a mode is shown", () => {
    showEntryMode("ai");
    setEntryMode("manual");
    expect(readEntryMode()).toBe("manual");
    showEntryMode(null);
    expect(readEntryMode()).toBe("manual");
    expect(stored.get(KEY)).toBe("manual");
  });

  it("follows a choice saved elsewhere (another tab) once the show ends", () => {
    showEntryMode("manual");
    stored.set(KEY, "ai");
    expect(readEntryMode()).toBe("manual");
    showEntryMode(null);
    expect(readEntryMode()).toBe("ai");
  });
});
