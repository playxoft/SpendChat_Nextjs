"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Profile } from "@/db/schema";

type P = Pick<Profile, "id" | "name" | "icon">;

const SWIPE_MIN_X = 60; // horizontal distance to count as a swipe
const SWIPE_MAX_Y = 45; // ignore mostly-vertical gestures (scrolling)
const SWIPE_MAX_MS = 600;

/**
 * Mobile: a horizontal swipe across the tracker moves to the next/previous
 * profile (wrapping through "All profiles"). Renders nothing. Gestures that
 * start inside the composer, an input, a dialog/menu, or a horizontal scroller
 * are ignored so normal interaction and vertical scrolling are unaffected.
 */
export function ProfileSwipe({
  profiles,
  filterProfileId,
}: {
  profiles: P[];
  filterProfileId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  useEffect(() => {
    if (profiles.length === 0) return;
    // View order: each profile, then "All profiles" last.
    const seq: string[] = [...profiles.map((p) => p.id), "all"];

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let tracking = false;

    function navTo(target: string) {
      const params = new URLSearchParams(sp.toString());
      // Profile id or "all" — both explicit (no param means the first profile).
      params.set("profile", target);
      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    }

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        tracking = false;
        return;
      }
      const el = e.target as HTMLElement | null;
      if (
        el?.closest(
          'input,textarea,select,button,a,form,[role="dialog"],[role="menu"],[role="listbox"],[data-no-swipe]',
        )
      ) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      tracking = true;
    }

    function onEnd(e: TouchEvent) {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Date.now() - startT > SWIPE_MAX_MS) return;
      if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dy) > SWIPE_MAX_Y) return;
      const idx = seq.indexOf(filterProfileId ?? "all");
      const base = idx < 0 ? 0 : idx;
      // Swipe left → next profile; swipe right → previous. Wrap around.
      const nextIdx = (base + (dx < 0 ? 1 : -1) + seq.length) % seq.length;
      navTo(seq[nextIdx]);
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [profiles, filterProfileId, router, pathname, sp]);

  return null;
}
