"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { GrowthChartLabels } from "@/components/tools/growth-chart";
import type { YearRow } from "@/lib/tools/growth";

/**
 * `GrowthChart`, fetched and mounted only once it scrolls near the viewport —
 * the same pattern as `LazyCategoryChart` on the marketing pages.
 *
 * The chart sits below the calculator, so recharts has no business in the
 * first load: `ssr: false` keeps it out of the static HTML, and the
 * intersection gate keeps the chunk from being requested until someone
 * scrolls towards it. The year-by-year table rendered next to it is the
 * server-rendered, accessible version of the same numbers. The placeholder
 * reserves the chart's exact height, so its arrival shifts nothing.
 */

const placeholder = <Skeleton className="h-64 w-full rounded-xl" />;

const GrowthChart = dynamic(
  () => import("@/components/tools/growth-chart").then((m) => m.GrowthChart),
  { ssr: false, loading: () => placeholder },
);

export function LazyGrowthChart(props: {
  rows: YearRow[];
  currency: string;
  locale: string;
  labels: GrowthChartLabels;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // Decorative for assistive tech: the table under it has every figure.
    <div ref={ref} className="h-64" aria-hidden>
      {visible ? <GrowthChart {...props} /> : placeholder}
    </div>
  );
}
