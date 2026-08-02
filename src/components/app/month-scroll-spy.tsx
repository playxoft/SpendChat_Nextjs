"use client";

import { useEffect } from "react";
import { useActiveMonth } from "./active-month";

/**
 * Reports which month is currently under the sticky tracker header, so the
 * summary bar's month name + balance track the scroll position. As you scroll up
 * from June into May, the header flips to May the moment June's section drops
 * below the header line.
 *
 * The page scrolls in the window; each month section carries `data-month`, and
 * the header carries `data-tracker-header`. The active month is the last section
 * whose top has passed above the header's bottom edge (sections are laid out
 * oldest → newest, top → bottom). `signature` changes when the feed's rows do,
 * so the mapping is recomputed after a revalidation adds or removes rows.
 *
 * Resting at the bottom is the one case that rule gets wrong: the newest month's
 * section is usually shorter than the viewport, so its top never reaches the
 * header line and it could never become active — the tracker opens pinned to the
 * newest message and would title itself with the *previous* month. So when the
 * page is scrolled to the end (or too short to scroll at all), the newest section
 * wins outright, which is also what "you're looking at now" means in a chat.
 */
export function MonthScrollSpy({ signature }: { signature: string }) {
  const { setActiveMonth } = useActiveMonth();

  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-tracker-header]");
    let frame = 0;

    const compute = () => {
      frame = 0;
      const sections = document.querySelectorAll<HTMLElement>("[data-month]");
      if (sections.length === 0) return;

      const doc = document.documentElement;
      // 2px of slack absorbs fractional zoom / rounding, where a page resting at
      // the bottom reports a scrollY a hair under the true maximum.
      const atBottom = window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
      if (atBottom) {
        const newest = sections[sections.length - 1].dataset.month;
        if (newest) setActiveMonth(newest);
        return;
      }

      const line = header ? header.getBoundingClientRect().bottom : 0;
      let active = sections[0].dataset.month;
      for (const el of sections) {
        // Once a section starts below the header line, everything after it is
        // lower still — the previous one is the month currently in view.
        if (el.getBoundingClientRect().top - line > 1) break;
        active = el.dataset.month;
      }
      if (active) setActiveMonth(active);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(compute);
    };

    // Run once after paint so the initial (scrolled-to-bottom) position is read.
    frame = requestAnimationFrame(compute);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [setActiveMonth, signature]);

  return null;
}
