"use client";

import { useLayoutEffect } from "react";
import { trackerHeaderBottom } from "./use-feed-scroll";

/** Where the sticky tracker header ends (viewport px) — the day pills stick just below it. */
export const HEADER_BOTTOM_VAR = "--tracker-header-bottom";
/** How much of the window's bottom the composer (or the viewer bar) and the phone's nav cover. */
export const DOCK_HEIGHT_VAR = "--tracker-dock-height";

/** The bottom bar's footprint: its sticky `bottom` (the phone's nav, or 0) plus its height. */
function dockHeight(): number | null {
  const dock = document.querySelector<HTMLElement>("[data-tracker-dock]");
  if (!dock) return null;
  const bottom = parseFloat(getComputedStyle(dock).bottom);
  return (Number.isFinite(bottom) ? bottom : 0) + dock.offsetHeight;
}

/**
 * Publish the tracker's sticky chrome as CSS variables on the root, for the
 * things that have to sit just inside it: each day's date pill sticks under
 * the header, and the "jump to latest" button floats above the composer.
 *
 * Measured, not hard-coded: the header is a 56px bar plus the profile row on a
 * phone and a taller block on a desktop, and both grow and shrink — the
 * balance streams in, a long name wraps, the composer opens a draft list. A
 * ResizeObserver on each keeps the numbers current, and the window's resize
 * covers the breakpoint moving the sticky offsets themselves.
 */
export function useTrackerChromeVars(): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const measure = () => {
      root.style.setProperty(HEADER_BOTTOM_VAR, `${trackerHeaderBottom()}px`);
      const dock = dockHeight();
      if (dock === null) root.style.removeProperty(DOCK_HEIGHT_VAR);
      else root.style.setProperty(DOCK_HEIGHT_VAR, `${dock}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const el of document.querySelectorAll<HTMLElement>("[data-tracker-header], [data-tracker-dock]")) {
      observer.observe(el);
    }
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty(HEADER_BOTTOM_VAR);
      root.style.removeProperty(DOCK_HEIGHT_VAR);
    };
  }, []);
}
