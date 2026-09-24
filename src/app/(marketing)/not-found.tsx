import { NotFoundHero } from "@/components/not-found-hero";

/**
 * 404 for a `notFound()` thrown inside `(marketing)` — e.g. an unknown blog
 * slug. The marketing layout already renders the nav and footer around this,
 * so it's the hero alone (see `NotFoundHero`).
 */
export default function MarketingNotFound() {
  return <NotFoundHero inLayout />;
}
