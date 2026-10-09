"use client";

import { useEffect, useState } from "react";
import { isTypingTarget } from "@/lib/shortcuts";

/**
 * True while Shift is held down — what the sidebar shows its multi-select
 * outlines on. A Shift pressed while typing is a capital letter, not a
 * selection, so it doesn't count from a text field. Losing focus (another
 * window, a hidden tab) resets it, because the keyup then lands elsewhere and
 * the outlines would otherwise stick.
 */
export function useShiftHeld(enabled = true): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift" && !isTypingTarget(e.target)) setHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift" || !e.shiftKey) setHeld(false);
    };
    const reset = () => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [enabled]);
  return enabled && held;
}
