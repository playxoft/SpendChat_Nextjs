import type { KeyboardEvent } from "react";
import { describe, it, expect } from "vitest";
import {
  SHORTCUTS,
  getShortcut,
  comboFor,
  formatShortcutKeys,
  formatShortcut,
  shortcutKeyNames,
  describeShortcut,
  normalizeKey,
  splitCombo,
  spokenShortcut,
  matchesCombo,
  isTypingTarget,
  type KeyChord,
} from "@/lib/shortcuts";
import {
  PASSTHROUGH,
  echoCombo,
  resolveShortcut,
  shouldSwallow,
} from "@/components/marketing/demo/shortcut-match";

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

  // Two entries are documented without being bound, and anything that echoes
  // keystrokes reads this flag to decide whether it may swallow the key: the
  // marketing playgrounds `preventDefault` a match only when it's absent. An
  // entry that lost its flag would quietly take the browser's print dialog
  // away on a page whose own copy says we didn't.
  it("marks the documented-but-unbound keys, and only those", () => {
    expect(SHORTCUTS.filter((s) => s.unbound).map((s) => [s.id, s.unbound])).toEqual([
      ["tracker.category", "typed"],
      ["global.print", "browser"],
    ]);
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

  it("uses the same glyphs on Windows/Linux, so a hint is the size of a hint", () => {
    // Alt is the exception: ⌥ means Option, and Windows has no Alt glyph
    // anyone would recognise.
    expect(formatShortcutKeys("mod+shift+alt+ctrl", false)).toEqual([
      "⌃",
      "⇧",
      "Alt",
      "⌃",
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
    expect(formatShortcutKeys("enter", false)).toEqual(["↵"]);
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
  it("runs the glyphs together on every platform", () => {
    expect(formatShortcut("mod+e", true)).toBe("⌘E");
    expect(formatShortcut("mod+e", false)).toBe("⌃E");
    expect(formatShortcut("mod+enter", false)).toBe("⌃↵");
  });
});

describe("shortcutKeyNames / describeShortcut", () => {
  // What a screen reader announces and what the shortcuts page puts in its
  // prose. The glyphs above are for the eye only — "up arrowhead, downwards
  // arrow with corner leftwards" is not a keyboard shortcut.
  it("spells the modifiers out", () => {
    expect(shortcutKeyNames("mod+shift+alt+ctrl", true)).toEqual([
      "Cmd",
      "Shift",
      "Option",
      "Control",
    ]);
    expect(shortcutKeyNames("mod+shift+alt+ctrl", false)).toEqual([
      "Ctrl",
      "Shift",
      "Alt",
      "Ctrl",
    ]);
  });

  // Spaced, not "Cmd+Enter": a bare "+" is punctuation, and punctuation is
  // dropped at the default verbosity that made `SPOKEN_PUNCTUATION` necessary
  // one level down — so the tight form reached the reader as the single
  // invented word "CmdEnter", in every `sr-only` chip description and every
  // live-region sentence built from this.
  it("names the keys the glyphs stand for, separated by a spoken pause", () => {
    expect(describeShortcut("mod+enter", false)).toBe("Ctrl + Enter");
    expect(describeShortcut("mod+enter", true)).toBe("Cmd + Enter");
    expect(describeShortcut("", false)).toBe("");
  });

  // Punctuation passed through raw is punctuation a screen reader drops at its
  // default verbosity, which turns "Press / for the cheat sheet" into "Press
  // for the cheat sheet". The words also have to survive being dropped into
  // the FAQ prose the shortcuts page renders.
  it("says punctuation out loud", () => {
    expect(shortcutKeyNames("/", false)).toEqual(["Slash"]);
    expect(shortcutKeyNames("#", false)).toEqual(["Hash"]);
    expect(describeShortcut("shift+`", false)).toBe("Shift + Backtick");
    expect(describeShortcut("shift+`", true)).toBe("Shift + Backtick");
  });

  // The glyph path is untouched: the chip still draws the character, and only
  // the spoken/written copy beside it gets the word.
  it("leaves the visible chip as the character it always was", () => {
    expect(formatShortcutKeys("/", false)).toEqual(["/"]);
    expect(formatShortcutKeys("#", false)).toEqual(["#"]);
    expect(formatShortcutKeys("shift+`", true)).toEqual(["⇧", "`"]);
  });

  // The invariant rather than the three keys: a new punctuation combo in the
  // registry is exactly when an unnamed one slips back in, and it fails
  // silently — the sentence just loses a word.
  it("leaves no registry combo spoken as bare punctuation", () => {
    for (const s of SHORTCUTS) {
      for (const isMac of [true, false]) {
        for (const name of shortcutKeyNames(s.combo, isMac)) {
          expect(name).toMatch(/^[A-Za-z0-9]/);
        }
      }
    }
  });
});

describe("splitCombo / the plus key", () => {
  // `+` is the DSL's separator *and* a key, and the playgrounds echo back
  // whatever was pressed by joining modifiers to the key with that separator —
  // so Shift and the plus key really does produce "shift++". Split naively it
  // becomes ["shift", "", ""]: two empty key boxes on screen and "Shift"
  // followed by nothing in the ear.
  it("reads a trailing plus as a key, not as two empty ones", () => {
    expect(splitCombo("shift++")).toEqual(["shift", "+"]);
    expect(splitCombo("+")).toEqual(["+"]);
    expect(formatShortcutKeys("shift++", true)).toEqual(["⇧", "+"]);
    expect(shortcutKeyNames("shift++", false)).toEqual(["Shift", "Plus"]);
    expect(describeShortcut("shift++", false)).toBe("Shift + Plus");
  });

  it("leaves ordinary combos exactly as they were", () => {
    expect(splitCombo("mod+enter")).toEqual(["mod", "enter"]);
    expect(splitCombo("shift+`")).toEqual(["shift", "`"]);
    expect(splitCombo("q")).toEqual(["q"]);
    expect(splitCombo("")).toEqual([]);
  });
});

/**
 * A keystroke shaped like the React synthetic event the panels receive. The
 * layout differences below are real `code`/`key` pairs, because that pair is
 * the entire subject: `normalizeKey` reads `code` for digits so the profile
 * shortcuts survive a non-US layout, which is also what hides "#" from the
 * registry on a US one.
 */
function press(init: {
  key: string;
  code?: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  /** Defaults to the panel itself; pass "INPUT" for focus in the note field. */
  tagName?: string;
}): KeyboardEvent {
  return {
    key: init.key,
    code: init.code,
    shiftKey: !!init.shiftKey,
    metaKey: !!init.metaKey,
    ctrlKey: !!init.ctrlKey,
    altKey: !!init.altKey,
    target: { tagName: init.tagName ?? "DIV" },
  } as unknown as KeyboardEvent;
}

function resolve(e: KeyboardEvent, isMac = false) {
  return resolveShortcut(e, normalizeKey(e), isMac);
}

describe("resolveShortcut", () => {
  it("matches an ordinary bare key and a chord", () => {
    expect(resolve(press({ key: "t", code: "KeyT" }))?.id).toBe("nav.transactions");
    expect(resolve(press({ key: "Enter", code: "Enter", ctrlKey: true }))?.id).toBe(
      "tracker.submit",
    );
    expect(resolve(press({ key: "z", code: "KeyZ" }))).toBeUndefined();
  });

  // "#" is where the layouts disagree, and the cheat-sheet row beside the panel
  // makes one promise for both: a character you type into the title field, not
  // a bound key. On a US keyboard it's Shift+3 — the physical digit the profile
  // switcher owns — and on UK/DE/IT/ES it's an unshifted key of its own.
  describe("#, on both layout shapes", () => {
    const us = { key: "#", code: "Digit3", shiftKey: true };
    const uk = { key: "#", code: "Backslash" };

    it("is the typed category key while a field has focus, on either layout", () => {
      for (const layout of [us, uk]) {
        const match = resolve(press({ ...layout, tagName: "INPUT" }));
        expect(match?.id).toBe("tracker.category");
        // …and therefore never swallowed: the character has to reach the field
        // it is documented as being typed into.
        expect(shouldSwallow(match!)).toBe(false);
      }
    });

    // The collision, resolved the way the app resolves it: outside a field the
    // physical key is Shift + a digit and belongs to the profile switcher, which
    // is what the app does there too — a bare-key shortcut only stands down
    // while a field has focus.
    it("is the profile switcher outside a field on a US layout", () => {
      const match = resolve(press(us));
      expect(match?.id).toBe("profiles.switch");
      expect(shouldSwallow(match!)).toBe(true);
    });

    // Where "#" is its own key there is no collision to resolve, and nothing in
    // the app is listening for it either — so the panel names the row and lets
    // the key through.
    it("still names the category row outside a field where # is unshifted", () => {
      const match = resolve(press(uk));
      expect(match?.id).toBe("tracker.category");
      expect(shouldSwallow(match!)).toBe(false);
    });

    // The chip and the spoken sentence show the character on both layouts: ⇧3
    // beside a highlighted row about "#" reads as a different key entirely.
    it("echoes the character rather than the chord that produced it", () => {
      for (const layout of [us, uk]) {
        const e = press({ ...layout, tagName: "INPUT" });
        const key = normalizeKey(e);
        expect(echoCombo(e, key, false, resolve(e))).toBe("#");
      }
      // Anything else still echoes what was actually pressed.
      const e = press({ key: "1", code: "Digit1", shiftKey: true });
      expect(echoCombo(e, normalizeKey(e), false, resolve(e))).toBe("shift+1");
    });

    // AltGr (AZERTY) arrives as Ctrl+Alt, which is a different chord and no
    // business of ours — the character just types.
    it("stays out of the way when # needs AltGr", () => {
      expect(
        resolve(press({ key: "#", code: "Digit3", ctrlKey: true, altKey: true, tagName: "INPUT" })),
      ).toBeUndefined();
    });
  });

  it("keeps Shift + any digit on the profile switcher", () => {
    for (const digit of ["1", "5", "0"]) {
      const e = press({ key: digit, code: `Digit${digit}`, shiftKey: true });
      expect(resolve(e)?.id).toBe("profiles.switch");
    }
  });
});

describe("PASSTHROUGH", () => {
  // The list grew past the focus-trap escapes to cover the keys that move
  // around a page (arrows, Page/Home/End, Backspace), because a panel that
  // answered "Nothing is bound to that" to every arrow press narrates a
  // visitor's attempt to scroll away from it into a live region. That's only
  // safe while no binding ends in one of them.
  it("intercepts nothing the registry binds", () => {
    const intercepted = new Set(
      Array.from(PASSTHROUGH).map((k) => normalizeKey({ key: k })),
    );
    for (const s of SHORTCUTS) {
      expect(intercepted.has(splitCombo(s.combo).at(-1)!)).toBe(false);
    }
  });
});

describe("spokenShortcut", () => {
  // The rows are "verb, key", and by ear the key half is the half that goes
  // missing — the chips are `aria-hidden` glyphs.
  it("gives a row its key in words", () => {
    expect(spokenShortcut("mod+enter", "Send the transaction", true)).toBe("Cmd + Enter");
    expect(spokenShortcut("t", "Go to transactions", false)).toBe("T");
    expect(spokenShortcut("", "Nothing bound", false)).toBe("");
  });

  // One label spells its own binding, because the binding is a *range* the chip
  // can only draw one member of. Appending "Shift + 1" to it made the row
  // announce its key twice and contradict the range.
  it("says nothing where the label already spells the binding", () => {
    const profiles = SHORTCUTS.find((s) => s.id === "profiles.switch")!;
    expect(spokenShortcut(profiles.combo, profiles.label, false)).toBe("");
  });

  // Whole words only: the Manual/AI toggle is bound to `a` and its label
  // contains "AI", which a plain substring test would read as the label having
  // spelled out "A".
  it("is not fooled by a one-letter name inside a word", () => {
    const toggle = SHORTCUTS.find((s) => s.id === "tracker.toggle-mode")!;
    expect(spokenShortcut(toggle.combo, toggle.label, false)).toBe("A");
  });
});


/**
 * `matchesCombo` is the function every live binding runs through — the one the
 * refactor extracted out of `use-shortcut.ts` — and it had no test of its own.
 * That mattered more than a coverage gap: inverting the `otherMod` guard, or
 * dropping the `alt` line, left the whole suite green while ⌘E hijacked "move
 * to end of line" inside the composer.
 */
function chord(over: Partial<KeyChord> & { key: string }): KeyChord {
  return { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over };
}

describe("matchesCombo", () => {
  it("matches a bare key only when no modifier is held", () => {
    expect(matchesCombo(chord({ key: "t" }), "t", false)).toBe(true);
    expect(matchesCombo(chord({ key: "T" }), "t", false)).toBe(true);
    expect(matchesCombo(chord({ key: "t", ctrlKey: true }), "t", false)).toBe(false);
    expect(matchesCombo(chord({ key: "t", shiftKey: true }), "t", false)).toBe(false);
  });

  it("reads `mod` as Cmd on a Mac and Ctrl everywhere else", () => {
    const cmd = chord({ key: "e", metaKey: true });
    const ctrl = chord({ key: "e", ctrlKey: true });
    expect(matchesCombo(cmd, "mod+e", true)).toBe(true);
    expect(matchesCombo(cmd, "mod+e", false)).toBe(false);
    expect(matchesCombo(ctrl, "mod+e", false)).toBe(true);
    expect(matchesCombo(ctrl, "mod+e", true)).toBe(false);
  });

  it("leaves the platform's other modifier alone", () => {
    // macOS Ctrl+E is "move to end of line". A `mod+e` binding that fired on it
    // would take the keystroke away from the input the visitor is typing in.
    expect(matchesCombo(chord({ key: "e", ctrlKey: true }), "mod+e", true)).toBe(false);
    expect(matchesCombo(chord({ key: "e", metaKey: true }), "mod+e", false)).toBe(false);
    // Both together is neither chord.
    expect(
      matchesCombo(chord({ key: "e", ctrlKey: true, metaKey: true }), "mod+e", true),
    ).toBe(false);
  });

  it("requires shift and alt to match exactly, in both directions", () => {
    expect(matchesCombo(chord({ key: "e", ctrlKey: true, shiftKey: true }), "mod+e", false)).toBe(false);
    expect(matchesCombo(chord({ key: "e", ctrlKey: true, altKey: true }), "mod+e", false)).toBe(false);
    expect(matchesCombo(chord({ key: "e", ctrlKey: true }), "mod+shift+e", false)).toBe(false);
    expect(
      matchesCombo(chord({ key: "e", ctrlKey: true, shiftKey: true }), "mod+shift+e", false),
    ).toBe(true);
  });

  it("takes digits from `code`, so the profile shortcuts survive a layout", () => {
    // Shift+1 prints "!" on a US keyboard and something else elsewhere; the
    // binding is about the physical key.
    expect(
      matchesCombo(chord({ key: "!", code: "Digit1", shiftKey: true }), "shift+1", false),
    ).toBe(true);
  });

  it("matches every combo in the registry against its own keystroke", () => {
    for (const s of SHORTCUTS) {
      const parts = splitCombo(s.combo);
      const key = parts[parts.length - 1];
      const e = chord({
        key,
        code: /^[0-9]$/.test(key) ? `Digit${key}` : undefined,
        metaKey: parts.includes("mod"),
        ctrlKey: parts.includes("ctrl"),
        shiftKey: parts.includes("shift"),
        altKey: parts.includes("alt"),
      });
      expect(matchesCombo(e, s.combo, true), `${s.id} (${s.combo})`).toBe(true);
    }
  });
});

describe("isTypingTarget", () => {
  it("is what keeps a bare-letter shortcut from firing mid-word", () => {
    const el = (tag: string, contentEditable = false) =>
      ({ tagName: tag, isContentEditable: contentEditable }) as unknown as EventTarget;
    expect(isTypingTarget(el("INPUT"))).toBe(true);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(el("SELECT"))).toBe(true);
    expect(isTypingTarget(el("DIV", true))).toBe(true);
    expect(isTypingTarget(el("DIV"))).toBe(false);
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
