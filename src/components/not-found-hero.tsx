import type { CSSProperties, ReactNode } from "react";
import { NotFoundExperience } from "@/components/not-found-experience";
import { cn } from "@/lib/utils";

type FloatingCoinStyle = CSSProperties & { "--coin-opacity"?: number };

/** Drifting-coins backdrop data (kept here so it stays a server value). */
const FLOATING_COINS = [
  { left: "5%", size: 26, duration: 16, delay: 0, opacity: 0.1, glyph: "$" },
  { left: "17%", size: 16, duration: 21, delay: 6, opacity: 0.08, glyph: "¢" },
  { left: "29%", size: 20, duration: 18, delay: 11, opacity: 0.09, glyph: "€" },
  { left: "44%", size: 30, duration: 23, delay: 3, opacity: 0.07, glyph: "$" },
  { left: "58%", size: 15, duration: 19, delay: 9, opacity: 0.09, glyph: "£" },
  { left: "70%", size: 24, duration: 17, delay: 14, opacity: 0.08, glyph: "₹" },
  { left: "82%", size: 18, duration: 22, delay: 1, opacity: 0.1, glyph: "$" },
  { left: "92%", size: 22, duration: 20, delay: 8, opacity: 0.07, glyph: "¥" },
];

/**
 * The 404 hero — coins backdrop plus `NotFoundExperience` — shared by both
 * not-found boundaries.
 *
 * There are two because of where they render. The root `not-found.tsx` catches
 * unmatched URLs *outside* any route group, so it brings its own nav and
 * footer. A `notFound()` thrown inside `(marketing)` (an unknown blog slug, a
 * dev-only page in prod) renders *inside* the marketing layout, which already
 * has both — so `(marketing)/not-found.tsx` renders only this hero, with
 * `inLayout` to drop the nav clearance the layout's `<main>` already provides.
 * Rendering the root page there is what produced two footers.
 */
export function NotFoundHero({ nav, inLayout = false }: { nav?: ReactNode; inLayout?: boolean }) {
  const Body = inLayout ? "div" : "main";
  return (
    <div className={cn("relative flex flex-col", inLayout ? "min-h-[calc(100svh-5rem)]" : "min-h-svh")}>
      {/* Drifting coins backdrop — decorative, hidden under reduced motion. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden motion-reduce:hidden"
      >
        {FLOATING_COINS.map((coin, i) => (
          <span
            key={i}
            className="absolute bottom-[-14vh] grid place-items-center rounded-full border border-foreground/15 bg-card font-semibold text-muted-foreground"
            style={
              {
                left: coin.left,
                width: coin.size,
                height: coin.size,
                fontSize: coin.size * 0.5,
                "--coin-opacity": coin.opacity,
                animation: `mt-coin-drift ${coin.duration}s linear ${coin.delay}s infinite`,
              } as FloatingCoinStyle
            }
          >
            {coin.glyph}
          </span>
        ))}
      </div>

      {nav}

      {/* The marketing layout already provides the page's <main>. */}
      <Body
        className={cn(
          "relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-8",
          inLayout ? "pt-4" : "pt-20 sm:pt-24",
        )}
      >
        <NotFoundExperience />
      </Body>
    </div>
  );
}
