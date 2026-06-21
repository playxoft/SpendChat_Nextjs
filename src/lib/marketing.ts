/**
 * Shared sizing for prominent call-to-action buttons on the marketing site.
 * Larger than the in-app `Button` sizes by design — landing pages want bold,
 * tappable CTAs. Apply on top of the base `<Button>` (overrides height, padding,
 * radius, text size, and icon size).
 */
export const marketingCta =
  "h-12 gap-2 rounded-xl px-7 text-base [&_svg:not([class*='size-'])]:size-5";
