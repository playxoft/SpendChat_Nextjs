import type { CSSProperties } from "react";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { NotFoundExperience } from "@/components/not-found-experience";

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
 * Root not-found. In Next 16 this single file also catches every unmatched URL
 * across the app, and it renders inside the root layout — so it inherits the
 * theme, fonts and Toaster automatically.
 */
export default function NotFound() {
  return (
    <div className="bg-background">
      {/* Hero — fills exactly one screen; the footer below is scrolled to. */}
      <div className="relative flex min-h-svh flex-col">
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

        <SiteNav />

        <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-8 pt-20 sm:pt-24">
          <NotFoundExperience />
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
