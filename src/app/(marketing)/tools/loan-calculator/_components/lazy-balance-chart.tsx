"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { BalanceChart as BalanceChartType } from "./balance-chart";

/**
 * `BalanceChart`, fetched and mounted only once it scrolls near the viewport —
 * the same pattern as `LazyGrowthChart`. `ssr: false` keeps recharts out of the
 * static HTML, and the intersection gate keeps the chunk from being requested
 * until someone scrolls towards it. The placeholder reserves the chart's exact
 * height, so its arrival shifts nothing.
 */

const placeholder = <Skeleton className="h-64 w-full rounded-xl" />;

const BalanceChart = dynamic(() => import("./balance-chart").then((m) => m.BalanceChart), {
  ssr: false,
  loading: () => placeholder,
});

export function LazyBalanceChart(props: ComponentProps<typeof BalanceChartType>) {
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
      {visible ? <BalanceChart {...props} /> : placeholder}
    </div>
  );
}
