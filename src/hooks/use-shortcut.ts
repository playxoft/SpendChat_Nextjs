"use client";

import { useEffect, useSyncExternalStore } from "react";

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

function normalizeKey(e: KeyboardEvent): string {
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
  /** Target element to listen on (defaults to window). */
  target?: HTMLElement | null;
};

/** Bind a keyboard combo (see `lib/shortcuts.ts` for the DSL) to a handler. */
export function useShortcut(
  combo: string,
  handler: (e: KeyboardEvent) => void,
  options: Options = {},
) {
  const isMac = useIsMac();
  const { enabled = true, allowInInput = false, target } = options;

  useEffect(() => {
    if (!enabled || !combo) return;
    const node: Window | HTMLElement = target ?? window;
    function onKeyDown(e: Event) {
      const ke = e as KeyboardEvent;
      if (!allowInInput && isTypingTarget(ke.target)) return;
      if (matches(ke, combo, isMac)) {
        ke.preventDefault();
        handler(ke);
      }
    }
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [combo, isMac, enabled, allowInInput, target, handler]);
}
