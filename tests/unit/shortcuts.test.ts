import { describe, it, expect } from "vitest";
import {
  SHORTCUTS,
  getShortcut,
  comboFor,
  formatShortcutKeys,
  formatShortcut,
} from "@/lib/shortcuts";

describe("registry", () => {
  it("has unique ids and complete entries", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SHORTCUTS) {
      expect(s.combo).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(s.scope).toBeTruthy();
    }
  });
});

describe("getShortcut / comboFor", () => {
  it("resolves a known id", () => {
    expect(getShortcut("action.add")?.combo).toBe("r");
    expect(comboFor("action.add")).toBe("r");
    // The remapped bindings: analytics moved to `e`, the Manual/AI toggle took
    // `a`, and category tagging moved from `/` to `#`.
    expect(comboFor("nav.analytics")).toBe("e");
    expect(comboFor("tracker.toggle-mode")).toBe("a");
    expect(comboFor("tracker.category")).toBe("#");
    expect(comboFor("workspace.switch")).toBe("switchmod+shift");
  });
  it("handles an unknown id", () => {
    expect(getShortcut("nope")).toBeUndefined();
    expect(comboFor("nope")).toBe("");
  });
});

describe("formatShortcutKeys", () => {
  it("localizes modifiers for macOS", () => {
    expect(formatShortcutKeys("mod+shift+alt+ctrl", true)).toEqual([
      "⌘",
      "⇧",
      "⌥",
      "⌃",
    ]);
  });

  it("localizes modifiers for Windows/Linux", () => {
    expect(formatShortcutKeys("mod+shift+alt+ctrl", false)).toEqual([
      "Ctrl",
      "Shift",
      "Alt",
      "Ctrl",
    ]);
  });

  it("localizes the workspace-peek modifier per platform", () => {
    // ⌘ on macOS, Alt off-Mac (Ctrl+Shift is word-wise selection there).
    expect(formatShortcutKeys("switchmod+shift", true)).toEqual(["⌘", "⇧"]);
    expect(formatShortcutKeys("switchmod+shift", false)).toEqual(["Alt", "Shift"]);
  });

  it("renders named keys", () => {
    expect(formatShortcutKeys("enter", true)).toEqual(["↵"]);
    expect(formatShortcutKeys("enter", false)).toEqual(["Enter"]);
    expect(formatShortcutKeys("esc", false)).toEqual(["Esc"]);
    expect(formatShortcutKeys("space", false)).toEqual(["Space"]);
  });

  it("upper-cases single keys and capitalises multi-char keys", () => {
    expect(formatShortcutKeys("e", false)).toEqual(["E"]);
    expect(formatShortcutKeys("/", false)).toEqual(["/"]);
    expect(formatShortcutKeys("tab", false)).toEqual(["Tab"]);
  });

  it("returns an empty array for an empty combo", () => {
    expect(formatShortcutKeys("", true)).toEqual([]);
  });
});

describe("formatShortcut", () => {
  it("joins with no separator on mac and '+' elsewhere", () => {
    expect(formatShortcut("mod+e", true)).toBe("⌘E");
    expect(formatShortcut("mod+e", false)).toBe("Ctrl+E");
  });
});
