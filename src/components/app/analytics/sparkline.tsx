import { cn } from "@/lib/utils";

/**
 * A tiny line of a few values, in plain SVG (a handful of these sit in one
 * card, so a chart library per row would be heavy). The last value is the
 * month in progress: its segment is dashed and its point hollow, so a
 * half-finished month doesn't read as a drop. Decorative — the row beside it
 * states the numbers — so it is hidden from assistive tech.
 */
export function Sparkline({
  values,
  className,
  partialLast = true,
}: {
  values: number[];
  className?: string;
  partialLast?: boolean;
}) {
  const w = 80;
  const h = 28;
  const pad = 3;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)] as const);
  const path = (list: (readonly [number, number])[]) =>
    list.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const solid = partialLast ? pts.slice(0, -1) : pts;
  const last = pts.at(-1);
  const beforeLast = pts.at(-2);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn("h-7 w-20 shrink-0 overflow-visible text-foreground", className)}
    >
      {solid.length > 1 ? (
        <path
          d={path(solid)}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.7}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {partialLast && last && beforeLast ? (
        <path
          d={path([beforeLast, last])}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.5}
          strokeWidth={1.5}
          strokeDasharray="2 3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {last ? (
        <circle
          cx={last[0]}
          cy={last[1]}
          r={2.25}
          fill={partialLast ? "var(--card)" : "currentColor"}
          stroke="currentColor"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}
