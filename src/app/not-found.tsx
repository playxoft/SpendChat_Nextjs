import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { NotFoundHero } from "@/components/not-found-hero";

/**
 * Root not-found. In Next 16 this single file also catches every unmatched URL
 * across the app, and it renders inside the root layout — so it inherits the
 * theme, fonts and Toaster automatically. It brings its own nav and footer;
 * `(marketing)/not-found.tsx` is the variant for 404s thrown inside the
 * marketing layout, which already has them.
 */
export default function NotFound() {
  return (
    <div className="bg-background">
      {/* Hero — fills exactly one screen; the footer below is scrolled to. */}
      <NotFoundHero
        nav={
          // No active nav item: this page is prerendered once, at
          // `/_not-found`, but served for whatever URL was requested — marking
          // a section here would light up after hydration and not before it,
          // for a page that doesn't exist. See `SiteNav`.
          <SiteNav markActive={false} />
        }
      />

      <SiteFooter />
    </div>
  );
}
