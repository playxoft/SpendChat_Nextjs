"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { TypeFilterOptions } from "@/components/app/type-filter-options";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseISODate, toISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * The filter row: every control exactly `h-9` (36px) and in the same 14px
 * text — the range toggle (its 28px buttons fill the 36px box: 1px border +
 * 3px padding each side), the date picker and the type select. Where they fit,
 * one row. On a phone the toggle takes its own row, its five options sharing
 * it evenly under short labels ("3 mo"), so all of them show at 320px without
 * scrolling; the date and type then share the next row, or take a full row
 * each — growing to fill it rather than leave a ragged edge.
 */
const FILTER_ROW = "flex flex-wrap items-center gap-2 print:hidden";
const SEGMENTED =
  "no-scrollbar flex h-9 w-full min-w-0 max-w-full shrink items-center gap-0.5 overflow-x-auto rounded-lg border bg-muted/40 p-[3px] sm:w-auto";
/** One option of the toggle — the buttons and their loading placeholders. */
const SEGMENT = "h-7 min-w-0 flex-1 px-1.5 text-sm sm:flex-none sm:shrink-0 sm:px-2.5";
const DATE_CONTROL = "h-9 flex-1 sm:flex-none";
const TYPE_CONTROL = "h-9 min-w-32 flex-1 data-[size=default]:h-9 sm:w-32 sm:flex-none";

/**
 * `short` is what a phone shows; it is always contained in `label`, which is
 * the button's accessible name, so a voice command for what's on screen still
 * finds it.
 */
const RANGES = [
  { key: "1", label: "This month", short: "Month", months: 1 },
  { key: "3", label: "3 months", short: "3 mo", months: 3 },
  { key: "6", label: "6 months", short: "6 mo", months: 6 },
  { key: "12", label: "12 months", short: "12 mo", months: 12 },
  { key: "all", label: "All time", short: "All", months: 0 },
] as const;

function SegmentLabel({ r }: { r: (typeof RANGES)[number] }) {
  return (
    <>
      <span className="truncate sm:hidden">{r.short}</span>
      <span className="hidden sm:inline">{r.label}</span>
    </>
  );
}

export function AnalyticsFilters({ today, locale }: { today: string; locale?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const span = sp.get("span");
  const type = sp.get("type") ?? "all";

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  // Date bounds for a preset (months back, anchored to today).
  function rangeBounds(months: number) {
    const end = parseISODate(today);
    const startMonth = startOfMonth(subMonths(end, months - 1));
    return {
      from: toISODate(startMonth),
      to: toISODate(months === 1 ? endOfMonth(end) : end),
    };
  }

  // Which preset (if any) the current URL reflects — drives the toggle highlight.
  const activeKey: string | null = (() => {
    if (span === "all") return "all";
    if (from || to) {
      for (const r of RANGES) {
        if (r.months === 0) continue;
        const b = rangeBounds(r.months);
        if (b.from === from && b.to === to) return r.key;
      }
      return null; // a custom From/To range
    }
    return "1"; // no params → the default view is the current month
  })();

  function applyRange(r: (typeof RANGES)[number]) {
    if (r.months === 0) {
      // "All time" is explicit so it doesn't collide with the default view.
      update({ from: undefined, to: undefined, span: "all" });
      return;
    }
    const b = rangeBounds(r.months);
    update({ from: b.from, to: b.to, span: undefined });
  }

  // The range shown in the calendar control. With no date params the page
  // defaults to the current month, so surface that (not an empty "All dates").
  const monthFrom = toISODate(startOfMonth(parseISODate(today)));
  const monthTo = toISODate(endOfMonth(parseISODate(today)));
  const effFrom = span === "all" ? "" : from || monthFrom;
  const effTo = span === "all" ? "" : to || monthTo;

  function handleRange(next: { from?: string; to?: string }) {
    // "All dates" (both cleared) means "All time" for analytics.
    if (!next.from && !next.to) {
      update({ from: undefined, to: undefined, span: "all" });
    } else {
      update({ from: next.from, to: next.to, span: undefined });
    }
  }

  const hasFilters = !!from || !!to || span === "all" || type !== "all";

  return (
    <div className={FILTER_ROW}>
      {/* Segmented range toggle: scrolls horizontally on narrow screens
          instead of pushing the page wider than the viewport. */}
      <div className={SEGMENTED}>
        {RANGES.map((r) => {
          const active = activeKey === r.key;
          return (
            <Button
              key={r.key}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={active}
              aria-label={r.label}
              className={cn(
                SEGMENT,
                "transition-colors",
                active
                  ? "bg-background font-medium text-foreground shadow-sm hover:bg-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => applyRange(r)}
            >
              <SegmentLabel r={r} />
            </Button>
          );
        })}
      </div>

      <DateRangeFilter
        from={effFrom}
        to={effTo}
        today={today}
        locale={locale}
        onChange={handleRange}
        className={DATE_CONTROL}
      />

      <Select value={type} onValueChange={(v) => update({ type: v === "all" ? undefined : v })}>
        {/* The trigger's own size rule (`data-[size=default]:h-8`) outranks a
            plain `h-9`, so the height is set on the same variant. */}
        <SelectTrigger className={TYPE_CONTROL} aria-label="Type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <TypeFilterOptions />
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => update({ from: undefined, to: undefined, span: undefined, type: undefined })}
        >
          <X className="size-4" /> Clear
        </Button>
      )}

      {pending && (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
      )}
    </div>
  );
}

/**
 * The filter row while the page loads (`loading.tsx`): the same range toggle
 * with the same labels, so it is exactly as wide, and placeholders the size of
 * the date and type controls.
 */
export function AnalyticsFiltersSkeleton() {
  return (
    <div className={FILTER_ROW} aria-hidden>
      <div className={SEGMENTED}>
        {RANGES.map((r) => (
          <span
            key={r.key}
            // The same box as the buttons, border included.
            className={cn(SEGMENT, "inline-flex items-center justify-center border border-transparent text-muted-foreground")}
          >
            <SegmentLabel r={r} />
          </span>
        ))}
      </div>
      <Skeleton className={cn(DATE_CONTROL, "min-w-[11rem] rounded-lg sm:w-[12.5rem]")} />
      <Skeleton className={cn(TYPE_CONTROL, "rounded-lg")} />
    </div>
  );
}
