/**
 * Central keyboard-shortcut registry. Combos use a small DSL:
 *   "mod+e"        → Cmd on macOS, Ctrl elsewhere
 *   "shift+enter"  → Shift + Enter
 *   "/"            → a single key
 * `mod` renders as ⌘ on macOS and ⌃ on Windows/Linux.
 */
export type ShortcutDef = {
  id: string;
  combo: string;
  label: string;
  scope: string;
};

export const SHORTCUTS: ShortcutDef[] = [
  // Single-key navigation + actions — fire only when not typing in a field and
  // no dialog/menu is open (see `requireNoOverlay` in use-shortcut).
  { id: "nav.tracker", combo: "q", label: "Go to the tracker", scope: "Navigation" },
  { id: "nav.transactions", combo: "t", label: "Go to transactions", scope: "Navigation" },
  { id: "nav.analytics", combo: "e", label: "Go to analytics", scope: "Navigation" },
  { id: "nav.files", combo: "f", label: "Go to files", scope: "Navigation" },
  { id: "nav.settings", combo: "s", label: "Go to settings", scope: "Navigation" },
  { id: "action.add", combo: "r", label: "Add a transaction", scope: "Actions" },
  { id: "action.bulk", combo: "b", label: "Bulk add transactions", scope: "Actions" },
  { id: "tracker.submit", combo: "mod+enter", label: "Send the transaction", scope: "Tracker" },
  { id: "tracker.description", combo: "shift+enter", label: "Jump to the description field", scope: "Tracker" },
  { id: "tracker.toggle-mode", combo: "a", label: "Switch between Manual and AI entry", scope: "Tracker" },
  // Push-to-talk, bound via `useHoldShortcut` — held, not tapped.
  { id: "tracker.voice", combo: "m", label: "Hold to record a voice note (AI entry)", scope: "Tracker" },
  // Display-only: "#" is a character you type into the field, not a bound key.
  // (`matches()` couldn't fire it anyway — it normalizes "#" to its physical
  // code "3" and the combo declares no shift.) The composer drives the picker
  // off the field's text; this entry exists so the cheat sheet documents it.
  { id: "tracker.category", combo: "#", label: "Tag a category from the title field", scope: "Tracker" },
  { id: "tracker.toggle-type", combo: "mod+e", label: "Switch between expense and income", scope: "Tracker" },
  { id: "profiles.all", combo: "shift+`", label: "Show all profiles", scope: "Profiles" },
  { id: "profiles.switch", combo: "shift+1", label: "Switch to a profile (Shift + 1…9, 0 for the 10th)", scope: "Profiles" },
  { id: "workspace.switch", combo: "g", label: "Switch workspace (then 1…9)", scope: "Workspaces" },
  { id: "global.shortcuts", combo: "/", label: "Show keyboard shortcuts", scope: "Global" },
  { id: "global.print", combo: "mod+p", label: "Print the current page", scope: "Global" },
];

export function getShortcut(id: string): ShortcutDef | undefined {
  return SHORTCUTS.find((s) => s.id === id);
}

/** Combo for a registered shortcut id (empty string if unknown). */
export function comboFor(id: string): string {
  return getShortcut(id)?.combo ?? "";
}

/** The key as it's typed, for anything that isn't a named key. */
function plainKey(part: string): string {
  return part.length === 1
    ? part.toUpperCase()
    : part.charAt(0).toUpperCase() + part.slice(1);
}

/**
 * Split a combo into **display** tokens — glyphs wherever a key has one, on
 * every platform.
 *
 * Windows used to get the words: a `mod+enter` chip read "Ctrl" "Enter", two
 * wide boxes where a Mac had two small ones, and in a compact control strip
 * that's the difference between fitting and not. ⌃ and ↵ are the same symbols
 * either way, so a hint stays the size of a hint.
 *
 * Alt keeps its name below: ⌥ means Option, and Windows has no glyph for Alt
 * that anyone would recognise — an unreadable symbol is worse than a wide one.
 *
 * These are for the eye only. `Kbd` renders them `aria-hidden`, and anything
 * spoken or written into prose wants `shortcutKeyNames` instead — a screen
 * reader announcing "up arrowhead" helps nobody.
 */
export function formatShortcutKeys(combo: string, isMac: boolean): string[] {
  if (!combo) return [];
  return combo.split("+").map((part) => {
    switch (part) {
      case "mod":
        return isMac ? "⌘" : "⌃";
      case "shift":
        return "⇧";
      case "alt":
        return isMac ? "⌥" : "Alt";
      case "ctrl":
        return "⌃";
      case "enter":
        return "↵";
      case "esc":
        return "Esc";
      case "space":
        return "Space";
      default:
        return plainKey(part);
    }
  });
}

/**
 * The same combo in **words**, for anywhere the symbols can't do the job:
 * `aria-label`s, titles, and prose (including the FAQ copy that Google reads,
 * where "Ctrl + Enter" is a phrase people search for and "⌃ + ↵" is not).
 */
export function shortcutKeyNames(combo: string, isMac: boolean): string[] {
  if (!combo) return [];
  return combo.split("+").map((part) => {
    switch (part) {
      case "mod":
        return isMac ? "Cmd" : "Ctrl";
      case "shift":
        return "Shift";
      case "alt":
        return isMac ? "Option" : "Alt";
      case "ctrl":
        return isMac ? "Control" : "Ctrl";
      case "enter":
        return "Enter";
      case "esc":
        return "Esc";
      case "space":
        return "Space";
      default:
        return plainKey(part);
    }
  });
}

/** A flat single-string rendering for visible inline hints — all glyphs, so
 * they run together the way ⌘↵ does rather than needing a separator. */
export function formatShortcut(combo: string, isMac: boolean): string {
  return formatShortcutKeys(combo, isMac).join("");
}

/** A flat single-string rendering for screen readers and titles. */
export function describeShortcut(combo: string, isMac: boolean): string {
  return shortcutKeyNames(combo, isMac).join("+");
}
