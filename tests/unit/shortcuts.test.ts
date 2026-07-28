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

  // Two entries on the same combo means one of them silently never fires, or
  // both fire at once. Remapping keys is exactly when that slips in, so guard
  // the invariant rather than the specific bindings.
  it("binds each combo to at most one shortcut", () => {
    const combos = SHORTCUTS.map((s) => s.combo);
    const duplicated = combos.filter((c, i) => combos.indexOf(c) !== i);
    expect(duplicated).toEqual([]);
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
    expect(comboFor("workspace.switch")).toBe("g");
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

  it("renders the workspace picker key the same on every platform", () => {
    // A plain key, deliberately: a held modifier chord can be swallowed by the
    // OS (⌘⇧3, Alt+Shift) before the page ever sees it.
    expect(formatShortcutKeys("g", true)).toEqual(["G"]);
    expect(formatShortcutKeys("g", false)).toEqual(["G"]);
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
