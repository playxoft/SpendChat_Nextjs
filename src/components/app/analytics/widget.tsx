import type * as React from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LockedBody } from "./locked-body";

/**
 * The analytics page's layout, in one place, so the loading skeletons, the
 * streamed widgets and the locked preview can't disagree about it: the page
 * shell's width, the grid, each card's column span and each body's minimum
 * height. A skeleton is the same `WidgetCard` with placeholder lines in it, so
 * nothing widens or jumps when the data lands.
 *
 * No hooks — renders on the server, or inside a client component.
 */

/** The page column: the skeleton (`loading.tsx`) and the page use exactly this. */
export const ANALYTICS_SHELL = "mx-auto w-full max-w-5xl space-y-6 px-4 py-6";

/** The cards' grid: one column, two from `lg`. */
export const WIDGET_GRID = "grid min-w-0 gap-4 lg:grid-cols-2";

/**
 * Each widget body's minimum height — shared by the widget, its skeleton and
 * its locked preview. Bodies can grow past it (a long list); they never start
 * shorter.
 */
export const BODY = {
  categories: "min-h-56",
  // Legend 16 + chart 208 + footer 20, 12 apart.
  trend: "min-h-[16.75rem]",
  insights: "min-h-[7.5rem]",
  pace: "min-h-[18rem]",
  trends: "min-h-[18rem]",
  calendar: "min-h-[15rem]",
  recurring: "min-h-[13rem]",
  anomalies: "min-h-[13rem]",
  breakdown: "min-h-[15rem]",
} as const;

export type WidgetSpan = "full" | "half";

const spanClass = (span: WidgetSpan) => (span === "full" ? "lg:col-span-2" : undefined);

/** A card title as a real heading (the page's `<h1>` → section `<h2>` → card `<h3>`). */
function WidgetTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 data-slot="card-title" className="font-heading text-base leading-snug font-medium">
      {children}
    </h3>
  );
}

export function WidgetCard({
  title,
  description,
  span = "half",
  bodyClassName,
  locked,
  children,
}: {
  title: React.ReactNode;
  description: React.ReactNode;
  span?: WidgetSpan;
  /** `BODY.<widget>`, plus anything else the body needs. */
  bodyClassName?: string;
  /** Free: the body is sample data under a lock (`LockedBody`). */
  locked?: { hint: string } | null;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("min-w-0", spanClass(span))}>
      <CardHeader>
        <WidgetTitle>{title}</WidgetTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={cn("min-w-0", bodyClassName)}>
        {locked ? <LockedBody hint={locked.hint}>{children}</LockedBody> : children}
      </CardContent>
    </Card>
  );
}

/** One line of placeholder text, at the height the real line takes. */
export function SkeletonLine({
  className,
  lineClassName = "h-5",
}: {
  /** The bar's own width/height. */
  className?: string;
  /** The line box it sits in (the real text's line height). */
  lineClassName?: string;
}) {
  return (
    <div className={cn("flex items-center", lineClassName)}>
      <Skeleton className={cn("h-3.5", className)} />
    </div>
  );
}

/**
 * A `WidgetCard` while its data loads. Pass the card's real `title` and
 * `description` when they don't depend on the data (every insights card): the
 * header is then the card's own, wrapping exactly as it will. Without them the
 * header is two placeholder lines.
 */
export function WidgetCardSkeleton({
  span = "half",
  bodyClassName,
  title,
  description,
  titleWidth = "w-36",
  descriptionWidth = "w-56",
  children,
}: {
  span?: WidgetSpan;
  bodyClassName?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  titleWidth?: string;
  descriptionWidth?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className={cn("min-w-0", spanClass(span))} aria-hidden>
      <CardHeader>
        {/* text-base leading-snug = 22px; text-sm = 20px */}
        {title !== undefined ? (
          <WidgetTitle>{title}</WidgetTitle>
        ) : (
          <SkeletonLine className={cn("h-4", titleWidth)} lineClassName="h-[1.375rem]" />
        )}
        {description !== undefined ? (
          <CardDescription>{description}</CardDescription>
        ) : (
          <SkeletonLine className={cn("max-w-full", descriptionWidth)} />
        )}
      </CardHeader>
      <CardContent className={cn("min-w-0", bodyClassName)}>{children}</CardContent>
    </Card>
  );
}
