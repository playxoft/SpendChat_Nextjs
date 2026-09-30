"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { FireChartRow, FireTarget } from "./fire-chart";

/**
 * `FireChart`, fetched and mounted only once it scrolls near the viewport —
 * the same pattern as `LazyGrowthChart`. recharts stays out of the static HTML
 * and the first load; the table next to it is the server-rendered, accessible
 * version of the same numbers. The placeholder reserves the exact height.
 */

const placeholder = <Skeleton className="h-64 w-full rounded-xl" />;

const FireChart = dynamic(() => import("./fire-chart").then((m) => m.FireChart), {
  ssr: false,
  loading: () => placeholder,
});

export function LazyFireChart(props: {
  rows: FireChartRow[];
  targets: FireTarget[];
  currency: string;
  locale: string;
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
      {visible ? <FireChart {...props} /> : placeholder}
    </div>
  );
}
