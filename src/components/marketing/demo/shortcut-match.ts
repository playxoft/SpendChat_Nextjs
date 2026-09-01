// The React synthetic event, not the DOM one: these panels listen on their own
// container via `onKeyDown`, never on `window`.
import type { KeyboardEvent } from "react";
import {
  SHORTCUTS,
  describeShortcut,
  isTypingTarget,
  splitCombo,
  type ShortcutDef,
} from "@/lib/shortcuts";

/**
 * Keyboard matching for the marketing shortcut demos.
 *
 * Two panels model the same keyboard: `demo/shortcuts-demo.tsx` (the feature
 * page — full sidebar, live composer, the whole generated cheat sheet) and
 * `demo/shortcuts-preview.tsx` (the homepage panel, which keeps only the part
 * that proves single keys really do this). They have to agree about which key
 * fires what, or the two pages advertise different products — so the matching
 * lives here once rather than being copied into both.
 *
 * This is deliberately *not* the app's matcher. `useShortcut` /
 * `useHoldShortcut` in `src/hooks/use-shortcut.ts` answer a different question:
 * "did this event fire *my* combo?", one binding at a time, on a real DOM
 * `KeyboardEvent`, with `window` listeners and `preventDefault` baked in. The
 * demos ask the inverse — "which registry entry, if any, does this keystroke
 * satisfy?" — off a React synthetic event on a focused panel, and they also
 * need the pressed combo echoed back as a string, which the app never wants.
 * Both read the same combos out of `SHORTCUTS`, which is the part that actually
 * has to stay true.
 */

/**
 * Keys that must always reach the browser: the ways out of the panel, and the
 * ways around the page.
 *
 * Tab and Escape are the escape hatches — nothing may hold a visitor inside a
 * marketing demo. The rest are how a page is read without a mouse: arrows and
 * Page/Home/End scroll, Backspace goes back. None of them appears in the
 * registry, so looking gains nothing and costs something real — every one of
 * these would otherwise be answered with "Nothing is bound to that, so nothing
 * happens", which is a panel narrating a visitor's attempt to scroll away from
 * it, out loud, into a live region.
 *
 * Enter is not on the list, deliberately: two combos end in it.
 */
export const PASSTHROUGH = new Set([
  "Tab",
  "Escape",
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Backspace",
]);

/**
 * Whether the panel may swallow a keystroke it matched — `preventDefault` — or
 * has to answer for it and still let it through.
 *
 * `PASSTHROUGH` above is the blunt version, decided before we know what was
 * pressed. This is the version that needs the match: the registry documents two
 * keys the app doesn't bind (`unbound`), and both belong to someone else while
 * we describe them. ⌘/Ctrl + P is the browser's print dialog, `#` is a
 * character the title field is waiting for. Swallowing either would take
 * something real away from a visitor **in the same breath as the panel's own
 * copy saying we didn't** — the page would be lying about itself, on a page
 * whose entire argument is that the keyboard is honest here.
 *
 * `/` keeps the swallow, deliberately, even though Firefox opens Quick Find
 * with it. The app genuinely binds it (`app/global-shortcuts.tsx` via
 * `useShortcut`, which calls `preventDefault` on a match) and this panel exists
 * to show what the app does; a demo that let `/` fall through would be
 * advertising a cheat-sheet key that then didn't open the cheat sheet. It's no
 * different from `t` or `r`, which also mean something to a browser in
 * type-ahead-find mode — the line isn't "does anyone else want this key", it's
 * "did we take it". And nothing is taken until the visitor focuses the panel,
 * with Tab and Escape still the way back out.
 */
export function shouldSwallow(s: ShortcutDef): boolean {
  return s.unbound === undefined;
}

/**
 * The one sentence the panels' live region announces: the key in words, then
 * what it did.
 *
 * Both panels answer a keystroke in two places a screen reader never reaches —
 * an `aria-hidden` echo chip and a paragraph mutated in place — which is how a
 * playground about the keyboard ended up silent to the people most likely to
 * use it. This is that answer, composed once so both panels say it the same
 * way, for an `aria-live` region to carry.
 *
 * One sentence, not a live chip *and* a live line: two regions firing on the
 * same keystroke talk over each other, and the key would be announced twice.
 * It stays empty until something has actually been pressed, which is what lets
 * the region render from the first paint — it has to, or the first change lands
 * in a region that wasn't being watched yet — without announcing on arrival.
 *
 * An identical keystroke repeated is not re-announced (same text, no mutation),
 * and that's the honest answer: pressing `t` on the transactions page a second
 * time doesn't change the visible panel either. The one place that rule had to
 * be worked around is the held voice key, where press and release are two
 * events with one keystroke between them — the release rewrites the effect (see
 * `onKeyUp` in the demo), so the region changes and the stop gets said.
 */
export function announceKeystroke(
  pressed: string,
  effect: string,
  isMac: boolean,
): string {
  if (!pressed || !effect) return "";
  return `${describeShortcut(pressed, isMac)}. ${effect}`;
}

/**
 * The combo the visitor actually pressed, in the registry's DSL, for the echo
 * chip — including chords nothing is bound to, so an unmatched keystroke still
 * shows up rather than vanishing.
 */
export function pressedCombo(e: KeyboardEvent, key: string, isMac: boolean): string {
  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push("mod");
  if (isMac ? e.ctrlKey : e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

/**
 * What the panel shows and says it heard.
 *
 * Usually that's the chord the visitor pressed. The exception is a `typed`
 * entry, which is a *character*: on a US keyboard `#` is Shift+3, and a chip
 * reading ⇧3 next to a highlighted row about `#` looks like a different key
 * altogether — and reads, aloud, as a different key altogether. The character
 * is what the visitor typed and what the row is about, so that's what comes
 * back, identically on every layout.
 */
export function echoCombo(
  e: KeyboardEvent,
  key: string,
  isMac: boolean,
  match: ShortcutDef | undefined,
): string {
  return match?.unbound === "typed" ? match.combo : pressedCombo(e, key, isMac);
}

/** First registry entry this keystroke satisfies, or nothing. */
export function resolveShortcut(
  e: KeyboardEvent,
  key: string,
  isMac: boolean,
): ShortcutDef | undefined {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  // Ctrl on a Mac (or the Meta key on Windows) is a different chord entirely.
  if ((isMac ? e.ctrlKey : e.metaKey) || e.altKey) return undefined;

  // A `typed` entry is a character, so it matches on the character that was
  // printed (`e.key`) rather than on the physical key underneath — and only
  // while a field has focus, because that is the only moment the character is
  // what the visitor meant and the only moment the app behaves this way.
  //
  // That single condition settles both layouts and the collision between them.
  // On a US keyboard `#` is Shift+3, which `normalizeKey` reports as the
  // physical "3": outside a field it is Shift + a digit and belongs to
  // `profiles.switch`, exactly as in the app, and inside one the bare-key
  // shortcut stands down and the "#" types. On UK/DE/IT/ES layouts `#` is its
  // own unshifted key and reaches the fallthrough below on its own. Either way
  // the panel now says what the row beside it says.
  //
  // AltGr layouts (`#` is AltGr+3 on AZERTY) never get here — AltGr arrives as
  // Ctrl+Alt and is rejected above — so the character simply types, which is
  // the right outcome even if the panel stays quiet about it.
  if (!mod && isTypingTarget(e.target)) {
    const typed = SHORTCUTS.find((s) => s.unbound === "typed" && s.combo === e.key);
    if (typed) return typed;
  }

  return SHORTCUTS.find((s) => {
    const parts = splitCombo(s.combo);
    if (parts.includes("mod") !== mod) return false;
    if (parts.includes("shift") !== e.shiftKey) return false;
    // Shift + any digit lands on the profile switcher; the registry stores the
    // first one as the representative combo.
    if (s.id === "profiles.switch") return e.shiftKey && /^[0-9]$/.test(key);
    return parts[parts.length - 1] === key;
  });
}
