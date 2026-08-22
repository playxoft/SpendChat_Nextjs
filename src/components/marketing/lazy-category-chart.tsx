"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The analytics pie chart, loaded and mounted only once it scrolls into view.
 *
 * Two things are going on, and both matter.
 *
 * **Cost.** Recharts is by some distance the heaviest thing the marketing site
 * could pull in, and this chart sits well below the fold — paying for it during
 * the initial load would cost the homepage its LCP to draw something nobody has
 * scrolled to. `ssr: false` is safe here *only* because the same numbers are
 * rendered as a plain list beside the chart, server-side: a crawler reads the
 * breakdown either way, and the chart is presentation rather than content.
 * Don't reuse this pattern where the lazy piece is the only place the
 * information appears.
 *
 * **Correctness.** Recharts sizes itself from a `ResponsiveContainer`, which
 * measures its parent when it mounts. Mounting it in the same frame the chunk
 * arrives can catch the container mid-layout, and it then draws at a few pixels
 * wide and never recovers — a squashed ribbon instead of a pie. Waiting for an
 * intersection means layout has long since settled by the time it measures.
 * The `rootMargin` starts the fetch just before the chart is actually needed,
 * so the skeleton is rarely seen.
 */
const CategoryPieChart = dynamic(
  () => import("@/components/app/category-pie-chart").then((m) => m.CategoryPieChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-56 w-full rounded-xl" />,
  },
);

export function LazyCategoryChart({
  data,
  currency,
  locale,
}: {
  data: { name: string; value: number; icon?: string | null }[];
  currency: string;
  locale: string;
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

  return (
    // The chart's own height, reserved up front, so its arrival shifts nothing.
    <div ref={ref} className="min-h-56">
      {mounted ? (
        // No entry animation: this chart mounts from a lazily-loaded chunk that
        // can arrive before the container has been measured, and recharts'
        // animation resolves against that bad measurement and draws nothing.
        // See the note on the `animate` prop.
        <CategoryPieChart
          data={data}
          currency={currency}
          locale={locale}
          animate={false}
        />
      ) : (
        <Skeleton className="h-56 w-full rounded-xl" />
      )}
    </div>
  );
}
