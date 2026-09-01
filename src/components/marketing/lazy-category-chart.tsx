"use client";

import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The analytics pie chart, loaded and mounted only once it scrolls into view.
 *
 * Three things are going on, and all of them matter.
 *
 * **Cost.** Recharts is by some distance the heaviest thing the marketing site
 * could pull in, and this chart sits well below the fold — paying for it during
 * the initial load would cost the homepage its LCP to draw something nobody has
 * scrolled to. So the import is a `lazy()` boundary that is only *rendered*
 * after an intersection: the chunk isn't requested until then, and it never
 * renders during SSR because `mounted` starts false on both passes.
 *
 * **Content.** Keeping the chart out of the server pass keeps `CategoryPieChart`
 * out of the HTML — and its ranked list with it, since the list lives inside
 * that component. Whatever is passed as `fallback` is therefore the *only*
 * version of these numbers a crawler, a no-JS reader, or anyone whose chunk
 * hasn't landed will ever see. Pass the numbers, not a grey box:
 *
 * - the homepage renders `SpendBreakdown` beside the chart and leaves
 *   `fallback` unset, so the skeleton is right — the list is already there;
 * - the analytics demo has no room for a second list, so it passes its ranked
 *   list *as* the fallback and the chart absorbs it on arrival.
 *
 * A caller that does neither ships a page whose category breakdown exists only
 * in a JS chunk. Don't be that caller.
 *
 * **Correctness.** Recharts sizes itself from a `ResponsiveContainer`, which
 * measures its parent when it mounts. Mounting it in the same frame the chunk
 * arrives can catch the container mid-layout, and it then draws at a few pixels
 * wide and never recovers — a squashed ribbon instead of a pie. Waiting for an
 * intersection means layout has long since settled by the time it measures.
 * The `rootMargin` starts the fetch just before the chart is actually needed,
 * so the fallback is rarely on screen for long.
 */
const CategoryPieChart = lazy(() =>
  import("@/components/app/category-pie-chart").then((m) => ({
    default: m.CategoryPieChart,
  })),
);

export function LazyCategoryChart({
  data,
  currency,
  locale,
  chartKey,
  fallback,
}: {
  data: { name: string; value: number; icon?: string | null }[];
  currency: string;
  locale: string;
  /**
   * Remounts the chart when the dataset behind it is swapped.
   *
   * Recharts holds its computed geometry across prop changes, so replacing the
   * slices under it leaves the old shape on screen; a fresh mount is cheap and
   * always right. This is a prop rather than a `key` on `LazyCategoryChart`
   * itself because a key there remounts the *gate*, resetting `mounted` and
   * putting the fallback back on screen until the observer fires again — a
   * skeleton (or, worse, a list) strobing on every toggle. Keyed here, only the
   * chart is rebuilt; the gate, and the already-loaded chunk, stay put.
   */
  chartKey?: string;
  /**
   * What stands in for the chart before it arrives — and what the server pass
   * renders. Defaults to a skeleton, which is only correct where the same
   * numbers are rendered in plain text somewhere else on the page. See the
   * "Content" note above.
   */
  fallback?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const placeholder = fallback ?? <Skeleton className="h-56 w-full rounded-xl" />;

  return (
    // The chart's own height, reserved up front, so its arrival shifts nothing.
    <div ref={ref} className="min-h-56">
      {mounted ? (
        // The same placeholder covers the gap between "the chunk was asked for"
        // and "the chunk is here", so the fallback isn't briefly replaced by a
        // skeleton on the way in.
        //
        // No entry animation: this chart mounts from a lazily-loaded chunk that
        // can arrive before the container has been measured, and recharts'
        // animation resolves against that bad measurement and draws nothing.
        // See the note on the `animate` prop.
        <Suspense fallback={placeholder}>
          <CategoryPieChart
            key={chartKey}
            data={data}
            currency={currency}
            locale={locale}
            animate={false}
          />
        </Suspense>
      ) : (
        placeholder
      )}
    </div>
  );
}
