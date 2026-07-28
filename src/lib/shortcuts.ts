/**
 * Central keyboard-shortcut registry. Combos use a small DSL:
 *   "mod+e"        → Cmd on macOS, Ctrl elsewhere
 *   "shift+enter"  → Shift + Enter
 *   "/"            → a single key
 * `mod` renders as ⌘ on macOS and "Ctrl" on Windows/Linux. `switchmod` renders
 * as ⌘ on macOS and "Alt" elsewhere (the workspace peek avoids Ctrl off-Mac,
 * where Ctrl+Shift is word-wise selection).
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
  { id: "nav.settings", combo: "s", label: "Go to settings", scope: "Navigation" },
  { id: "action.add", combo: "r", label: "Add a transaction", scope: "Actions" },
  { id: "action.bulk", combo: "b", label: "Bulk add transactions", scope: "Actions" },
  { id: "tracker.submit", combo: "mod+enter", label: "Send the transaction", scope: "Tracker" },
  { id: "tracker.description", combo: "shift+enter", label: "Jump to the description field", scope: "Tracker" },
  { id: "tracker.toggle-mode", combo: "a", label: "Switch between Manual and AI entry", scope: "Tracker" },
  { id: "tracker.category", combo: "#", label: "Tag a category from the title field", scope: "Tracker" },
  { id: "tracker.toggle-type", combo: "mod+e", label: "Switch between expense and income", scope: "Tracker" },
  { id: "profiles.all", combo: "shift+`", label: "Show all profiles", scope: "Profiles" },
  { id: "profiles.switch", combo: "shift+1", label: "Switch to a profile (Shift + 1…9, 0 for the 10th)", scope: "Profiles" },
  // Display-only: the hold gesture is handled by WorkspaceSwitchHud, not `useShortcut`.
  { id: "workspace.switch", combo: "switchmod+shift", label: "Hold to switch workspace", scope: "Workspaces" },
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

/** Split a combo into display tokens, localized for the platform. */
export function formatShortcutKeys(combo: string, isMac: boolean): string[] {
  if (!combo) return [];
  return combo.split("+").map((part) => {
    switch (part) {
      case "mod":
        return isMac ? "⌘" : "Ctrl";
      case "switchmod":
        return isMac ? "⌘" : "Alt";
      case "shift":
        return isMac ? "⇧" : "Shift";
      case "alt":
        return isMac ? "⌥" : "Alt";
      case "ctrl":
        return isMac ? "⌃" : "Ctrl";
      case "enter":
        return isMac ? "↵" : "Enter";
      case "esc":
        return "Esc";
      case "space":
        return "Space";
      default:
        return part.length === 1
          ? part.toUpperCase()
          : part.charAt(0).toUpperCase() + part.slice(1);
    }
  });
}

/** A flat single-string rendering (e.g. for title attributes). */
export function formatShortcut(combo: string, isMac: boolean): string {
  return formatShortcutKeys(combo, isMac).join(isMac ? "" : "+");
}
