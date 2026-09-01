/**
 * Central keyboard-shortcut registry. Combos use a small DSL:
 *   "mod+e"        → Cmd on macOS, Ctrl elsewhere
 *   "shift+enter"  → Shift + Enter
 *   "/"            → a single key
 *   "shift++"      → Shift + the plus key (the separator is also a key — see
 *                    `splitCombo`, which is why nothing here splits on "+")
 * `mod` renders as ⌘ on macOS and ⌃ on Windows/Linux.
 */
export type ShortcutDef = {
  id: string;
  combo: string;
  label: string;
  scope: string;
  /**
   * Set on the entries this list *documents* but the app never listens for.
   * The value is the reason, because the reason is what anything echoing
   * keystrokes back has to act on:
   *   - `"browser"` — the chord belongs to the browser (⌘/Ctrl + P opens its
   *     print dialog). It's here because our pages print well, not because we
   *     took the key, so nothing may `preventDefault` it.
   *   - `"typed"` — it's a character you type into a field, and the field
   *     watches its own text; there is no binding to fire and nothing to
   *     swallow.
   * Absent means the app binds it for real — `preventDefault` included — and a
   * demo of the app should behave the same way (see `shouldSwallow` in
   * `components/marketing/demo/shortcut-match.ts`).
   */
  unbound?: "browser" | "typed";
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
  // The composer drives the picker off the field's text; this entry exists so
  // the cheat sheet documents it.
  //
  // Which physical key that is depends on the layout, and both shapes matter to
  // anything matching against this entry. On a US keyboard "#" is Shift+3, and
  // `normalizeKey` deliberately reports the *physical* key there ("3"), so this
  // combo can never match and Shift+3 outside a field belongs to
  // `profiles.switch` — which is exactly what the app does, because a bare-key
  // shortcut stands down while a field has focus and the character types
  // instead. On UK/DE/IT/ES layouts "#" is its own unshifted key and arrives as
  // "#". Match it on the character (`e.key`) while a field has focus and both
  // layouts land where the label says they do; see `resolveShortcut` in
  // `components/marketing/demo/shortcut-match.ts`.
  {
    id: "tracker.category",
    combo: "#",
    label: "Tag a category from the title field",
    scope: "Tracker",
    unbound: "typed",
  },
  { id: "tracker.toggle-type", combo: "mod+e", label: "Switch between expense and income", scope: "Tracker" },
  { id: "profiles.all", combo: "shift+`", label: "Show all profiles", scope: "Profiles" },
  { id: "profiles.switch", combo: "shift+1", label: "Switch to a profile (Shift + 1…9, 0 for the 10th)", scope: "Profiles" },
  { id: "workspace.switch", combo: "g", label: "Switch workspace (then 1…9)", scope: "Workspaces" },
  { id: "global.shortcuts", combo: "/", label: "Show keyboard shortcuts", scope: "Global" },
  // The browser's, not ours: we style the pages for print and document the key
  // people already know. Marked so nothing built on this list swallows it.
  {
    id: "global.print",
    combo: "mod+p",
    label: "Print the current page",
    scope: "Global",
    unbound: "browser",
  },
];

export function getShortcut(id: string): ShortcutDef | undefined {
  return SHORTCUTS.find((s) => s.id === id);
}

/** Combo for a registered shortcut id (empty string if unknown). */
export function comboFor(id: string): string {
  return getShortcut(id)?.combo ?? "";
}

/**
 * Split a combo into its parts — the one place that knows `+` is both the DSL's
 * separator and a key you can press.
 *
 * `"shift+a".split("+")` is right and `"shift++".split("+")` is `["shift","",""]`,
 * which draws two empty key boxes and says "Shift" followed by nothing. That
 * combo isn't hypothetical: the marketing playgrounds echo back whatever the
 * visitor actually pressed, assembled by joining the modifiers to the key with
 * the same `+`, so pressing Shift and the plus key produces exactly that string
 * and then renders as two holes.
 *
 * The scan below reads the combo as what it is — keys and separators, strictly
 * alternating — by tokenising into runs of non-`+` and single `+` characters and
 * keeping every other token. `"shift++"` tokenises to `["shift", "+", "+"]`:
 * key, separator, key. Nothing about the ordinary combos changes.
 */
export function splitCombo(combo: string): string[] {
  const tokens = combo.match(/\+|[^+]+/g) ?? [];
  return tokens.filter((_, i) => i % 2 === 0);
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
 * reader announcing "up arrowhead" helps nobody, and one that says nothing at
 * all for "/" (most, at their default punctuation verbosity) helps less.
 */
export function formatShortcutKeys(combo: string, isMac: boolean): string[] {
  if (!combo) return [];
  return splitCombo(combo).map((part) => {
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
 * Punctuation keys, in words.
 *
 * `plainKey` passes anything it doesn't recognise straight through, which is
 * right for letters and digits and wrong for punctuation: at the default
 * verbosity NVDA and VoiceOver drop most symbols rather than speak them, so an
 * `sr-only` "/" or a FAQ sentence built from "`" reaches the reader with a hole
 * where its subject was — the same failure the words exist to fix. The names
 * have to work in running prose too ("Press Slash anywhere in the app"), so
 * they're the words a person would say, not the Unicode ones.
 *
 * The table covers the printable punctuation a keyboard can produce rather than
 * only the three combos the registry names today, because the marketing demos
 * echo whatever the visitor actually pressed back through this function, and an
 * unnamed key there is the same silence.
 *
 * `+` is in here for the same reason it needed `splitCombo`: it is the DSL's
 * separator *and* a key, and the key half is reachable — Shift and the plus key
 * is one keystroke a visitor can press into a playground.
 */
const SPOKEN_PUNCTUATION: Record<string, string> = {
  "`": "Backtick",
  "~": "Tilde",
  "!": "Exclamation mark",
  "@": "At sign",
  "#": "Hash",
  $: "Dollar sign",
  "%": "Percent sign",
  "^": "Caret",
  "&": "Ampersand",
  "*": "Asterisk",
  "(": "Left parenthesis",
  ")": "Right parenthesis",
  "-": "Minus",
  _: "Underscore",
  "=": "Equals",
  "+": "Plus",
  "[": "Left bracket",
  "]": "Right bracket",
  "{": "Left brace",
  "}": "Right brace",
  "\\": "Backslash",
  "|": "Pipe",
  ";": "Semicolon",
  ":": "Colon",
  "'": "Apostrophe",
  '"': "Quote",
  ",": "Comma",
  ".": "Period",
  "<": "Less than",
  ">": "Greater than",
  "/": "Slash",
  "?": "Question mark",
};

/**
 * The same combo in **words**, for anywhere the symbols can't do the job:
 * `aria-label`s, titles, and prose (including the FAQ copy that Google reads,
 * where "Ctrl + Enter" is a phrase people search for and "⌃ + ↵" is not).
 *
 * Punctuation is named rather than passed through (see `SPOKEN_PUNCTUATION`);
 * `formatShortcutKeys` above still draws the glyph, so nothing visible changes.
 */
export function shortcutKeyNames(combo: string, isMac: boolean): string[] {
  if (!combo) return [];
  return splitCombo(combo).map((part) => {
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
        return SPOKEN_PUNCTUATION[part] ?? plainKey(part);
    }
  });
}

/** A flat single-string rendering for visible inline hints — all glyphs, so
 * they run together the way ⌘↵ does rather than needing a separator. */
export function formatShortcut(combo: string, isMac: boolean): string {
  return formatShortcutKeys(combo, isMac).join("");
}

/**
 * A flat single-string rendering for screen readers and titles.
 *
 * The separator is a spaced `" + "`, and the spaces are the whole point — this
 * is the eye-vs-ear split one level up from `SPOKEN_PUNCTUATION`. A bare `"+"`
 * is punctuation, and punctuation is what a reader drops at its default
 * verbosity: `"Cmd+Enter"` arrives as "CmdEnter", one invented word, in every
 * `sr-only` string and every live-region sentence built from this. Spaces
 * survive the drop because they were never spoken — the reader says "Cmd",
 * pauses, says "Enter" — and on the rare setup that *does* speak symbols it
 * reads as the plus it is. It's also the form the shortcuts page already writes
 * into its prose and JSON-LD ("Ctrl + Enter" is the phrase people search for),
 * so the two now agree.
 *
 * The glyph path is untouched: `formatShortcut` still runs ⌘↵ together, because
 * that one is for the eye and a chip is not a sentence.
 */
export function describeShortcut(combo: string, isMac: boolean): string {
  return shortcutKeyNames(combo, isMac).join(" + ");
}

/**
 * A keystroke, narrowed to the two fields matching actually reads.
 *
 * A DOM `KeyboardEvent` and React's synthetic one both satisfy this
 * structurally, which is the point: the app binds shortcuts off `window`
 * (`useShortcut`) while the marketing panels read React events off their own
 * container (`demo/shortcut-match.ts`), and before this they each kept a
 * private copy of the function below. Three copies of the key vocabulary is
 * three places to forget when the DSL above grows a key — and a demo that
 * disagrees with the product about which key does what is a worse bug than a
 * demo that doesn't work at all.
 */
export type KeyStroke = { key: string; code?: string };

/**
 * A keystroke in the vocabulary the `combo` strings are written in.
 *
 * Digits and the backtick come off `code` rather than `key` because the printed
 * character moves with the layout — Shift+1 is "!" on a US keyboard and
 * something else elsewhere — so matching what was printed would make the
 * profile shortcuts layout-dependent.
 */
export function normalizeKey(e: KeyStroke): string {
  if (typeof e.code === "string") {
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (digit) return digit[1];
    if (e.code === "Backquote") return "`";
  }
  if (e.key === "Enter") return "enter";
  if (e.key === "Escape") return "esc";
  if (e.key === " ") return "space";
  return e.key.toLowerCase();
}

/**
 * True when focus is in something you type into, so a bare single-key shortcut
 * has to stand down rather than steal a keystroke meant for text.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

/** Word-ish runs, so a label is matched on whole words rather than substrings. */
const LABEL_WORDS = /[\p{L}\p{N}]+/gu;

/**
 * Does `label` already spell out this combo's keys itself?
 *
 * Every cheat sheet in the product — the app's `ShortcutList`, the marketing
 * panels' generated lists — pairs an action label with an `aria-hidden` chip,
 * so each row has to carry its combo as `sr-only` words or a screen reader
 * hears a list of verbs with no bindings. One label already does that job in
 * prose: "Switch to a profile (Shift + 1…9, 0 for the 10th)" spells the binding
 * out because the binding is a *range* and the chip can only draw one member of
 * it. Appending "Shift + 1" there repeats the modifier and contradicts the
 * range.
 *
 * Asked of the label rather than of a list of ids, so a label reworded into —
 * or out of — naming its own keys needs no second edit. Matched on whole words
 * because a key name can be a single letter: the Manual/AI toggle is bound to
 * `a`, and "Switch between Manual and AI entry" must not read as spelling "A".
 *
 * This lived in two places at once — `shortcut-list.tsx` testing each key name
 * for a whole-word hit, `shortcut-match.ts` testing the joined phrase — which
 * disagreed on a label that names the same keys in a different order. The
 * per-name rule is the one that survives, because duplication is what we are
 * avoiding and a near-miss that announces twice is worse than one that stays
 * quiet.
 */
export function labelNamesShortcut(label: string, combo: string, isMac: boolean): boolean {
  const names = shortcutKeyNames(combo, isMac);
  if (names.length === 0) return false;
  const words = new Set(label.toLowerCase().match(LABEL_WORDS) ?? []);
  return names.every((name) => words.has(name.toLowerCase()));
}

/**
 * The combo in words for a cheat-sheet row, or `""` where the label already
 * says it. See `labelNamesShortcut` for why that exception exists.
 */
export function spokenShortcut(combo: string, label: string, isMac: boolean): string {
  return labelNamesShortcut(label, combo, isMac) ? "" : describeShortcut(combo, isMac);
}

/**
 * A keystroke plus its modifiers — everything matching a *combo* needs.
 *
 * Same structural trick as `KeyStroke`: a DOM `KeyboardEvent` and React's
 * synthetic one both satisfy it, so the app's global bindings and a component's
 * own `onKeyDown` can share one matcher instead of each rolling the modifier
 * logic again. That sharing is the point — this file has already absorbed
 * `normalizeKey` and `isTypingTarget` from private copies, and the mac/Windows
 * swap below was the last piece still being written out by hand.
 */
export type KeyChord = KeyStroke & {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/**
 * Does this keystroke fire `combo`?
 *
 * `mod` is Command on macOS and Control elsewhere, and the *other* one is
 * rejected rather than ignored: on a Mac, Ctrl+E is "move to end of line" and
 * must not be read as ⌘E. Shift and Alt have to match exactly too, so `mod+e`
 * is not satisfied by ⌘⇧E — a combo names the chord it names.
 */
export function matchesCombo(e: KeyChord, combo: string, isMac: boolean): boolean {
  const parts = splitCombo(combo.toLowerCase());
  const key = parts[parts.length - 1];
  const wantMod = parts.includes("mod");
  const modActive = isMac ? e.metaKey : e.ctrlKey;
  const otherMod = isMac ? e.ctrlKey : e.metaKey;

  if (wantMod !== modActive) return false;
  if (wantMod && otherMod) return false;
  if (parts.includes("shift") !== e.shiftKey) return false;
  if (parts.includes("alt") !== e.altKey) return false;

  return normalizeKey(e) === key;
}
