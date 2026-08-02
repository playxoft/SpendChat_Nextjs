"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

function detectMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua =
    // navigator.userAgentData is not yet in TS lib types.
    (navigator as unknown as { userAgentData?: { platform?: string } })
      .userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    "";
  return /mac|iphone|ipad|ipod/i.test(ua);
}

// Platform never changes within a session, so the snapshot is stable.
const noopSubscribe = () => () => {};

/** True on macOS / iOS, detected client-side (false during SSR + first paint). */
export function useIsMac(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => detectMac(),
    () => false,
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
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

/**
 * True when a modal layer (dialog, menu, select listbox, etc.) is open. Radix
 * unmounts these on close, so their presence in the DOM means they're open.
 * Used to suppress bare single-key shortcuts that would otherwise clash with
 * menu typeahead or steal focus while a dialog is being filled in.
 */
function hasOpenOverlay(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector(
    '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]',
  );
}

function normalizeKey(e: KeyboardEvent): string {
  // Match a few keys by physical code so Shift combos work regardless of layout
  // (Shift+1 yields "!", Shift+` yields "~", etc.).
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

function matches(e: KeyboardEvent, combo: string, isMac: boolean): boolean {
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const wantMod = parts.includes("mod");
  const wantShift = parts.includes("shift");
  const wantAlt = parts.includes("alt");

  const modActive = isMac ? e.metaKey : e.ctrlKey;
  const otherMod = isMac ? e.ctrlKey : e.metaKey;

  if (wantMod !== modActive) return false;
  if (wantMod && otherMod) return false;
  if (wantShift !== e.shiftKey) return false;
  if (wantAlt !== e.altKey) return false;

  return normalizeKey(e) === key;
}

type Options = {
  enabled?: boolean;
  /** Allow firing while focus is in a text field (default false). */
  allowInInput?: boolean;
  /** Don't fire while a dialog / menu / listbox is open (default false).
   * Use for bare single-key shortcuts to avoid clashing with menu typeahead. */
  requireNoOverlay?: boolean;
  /** Target element to listen on (defaults to window). */
  target?: HTMLElement | null;
};

/**
 * Bind a combo as *push-to-talk*: `onDown` when it's pressed, `onUp` when it's
 * released. For a hold gesture rather than a trigger — see `useShortcut` for the
 * ordinary press-once case.
 *
 * Three things separate this from a plain keydown/keyup pair:
 *   - auto-repeat is ignored, so holding fires `onDown` exactly once;
 *   - `onUp` also fires on window blur, because a key released while the window
 *     is in the background never delivers `keyup` and the hold would never end;
 *   - `onUp` only fires if `onDown` did, so a release that arrives after the
 *     shortcut was disabled can't fire on its own.
 */
export function useHoldShortcut(
  combo: string,
  onDown: () => void,
  onUp: () => void,
  options: Omit<Options, "target"> = {},
) {
  const isMac = useIsMac();
  const { enabled = true, allowInInput = false, requireNoOverlay = false } = options;

  // Refs so re-created handler props don't tear down a hold in progress. Synced
  // in an effect rather than during render — the listeners below only read them
  // from event callbacks, so being one commit behind is impossible in practice.
  const downRef = useRef(onDown);
  const upRef = useRef(onUp);
  const heldRef = useRef(false);
  useEffect(() => {
    downRef.current = onDown;
    upRef.current = onUp;
  });

  useEffect(() => {
    if (!enabled || !combo) {
      // Disabled mid-hold (mode switch, dialog opened) — end it rather than
      // stranding the caller in its "held" state forever.
      if (heldRef.current) {
        heldRef.current = false;
        upRef.current();
      }
      return;
    }

    function release() {
      if (!heldRef.current) return;
      heldRef.current = false;
      upRef.current();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || heldRef.current) return;
      if (!allowInInput && isTypingTarget(e.target)) return;
      if (requireNoOverlay && hasOpenOverlay()) return;
      if (!matches(e, combo, isMac)) return;
      e.preventDefault();
      heldRef.current = true;
      downRef.current();
    }
    function onKeyUp(e: KeyboardEvent) {
      // Match on the key alone: modifiers are often let go first, and a combo
      // check here would miss the release and leave the hold stuck on.
      if (!heldRef.current) return;
      const key = combo.toLowerCase().split("+").pop()!;
      if (normalizeKey(e) !== key) return;
      e.preventDefault();
      release();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
      release();
    };
  }, [combo, isMac, enabled, allowInInput, requireNoOverlay]);
}

/** Bind a keyboard combo (see `lib/shortcuts.ts` for the DSL) to a handler. */
export function useShortcut(
  combo: string,
  handler: (e: KeyboardEvent) => void,
  options: Options = {},
) {
  const isMac = useIsMac();
  const {
    enabled = true,
    allowInInput = false,
    requireNoOverlay = false,
    target,
  } = options;

  useEffect(() => {
    if (!enabled || !combo) return;
    const node: Window | HTMLElement = target ?? window;
    function onKeyDown(e: Event) {
      const ke = e as KeyboardEvent;
      if (!allowInInput && isTypingTarget(ke.target)) return;
      if (requireNoOverlay && hasOpenOverlay()) return;
      if (matches(ke, combo, isMac)) {
        ke.preventDefault();
        handler(ke);
      }
    }
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [combo, isMac, enabled, allowInInput, requireNoOverlay, target, handler]);
}
