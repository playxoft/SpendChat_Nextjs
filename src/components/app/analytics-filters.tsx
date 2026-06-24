"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { parseISODate, toISODate } from "@/lib/dates";

const RANGES = [
  { key: "1", label: "This month", months: 1 },
  { key: "3", label: "3 months", months: 3 },
  { key: "6", label: "6 months", months: 6 },
  { key: "12", label: "12 months", months: 12 },
  { key: "all", label: "All time", months: 0 },
] as const;

export function AnalyticsFilters({ today }: { today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  function applyRange(months: number) {
    if (months === 0) {
      update({ from: undefined, to: undefined });
      return;
    }
    const end = parseISODate(today);
    const startMonth = startOfMonth(subMonths(end, months - 1));
    update({
      from: toISODate(startMonth),
      to: toISODate(months === 1 ? endOfMonth(end) : end),
    });
  }

  const hasRange = !!from || !!to;

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {/* Segmented range control: scrolls horizontally on narrow screens
          instead of pushing the page wider than the viewport. */}
      <div className="flex h-9 min-w-0 max-w-full shrink items-center gap-0.5 overflow-x-auto rounded-md border bg-muted/40 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {RANGES.map((r) => (
          <Button
            key={r.key}
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2.5 text-xs"
            onClick={() => applyRange(r.months)}
          >
            {r.label}
          </Button>
        ))}
      </div>

      <DatePicker
        value={from}
        max={to || today}
        placeholder="From"
        onChange={(iso) => update({ from: iso || undefined })}
        className="h-9 w-[calc(50%-0.25rem)] sm:w-[9.5rem]"
      />
      <DatePicker
        value={to}
        min={from || undefined}
        max={today}
        placeholder="To"
        onChange={(iso) => update({ to: iso || undefined })}
        className="h-9 w-[calc(50%-0.25rem)] sm:w-[9.5rem]"
      />

      {hasRange && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => update({ from: undefined, to: undefined })}
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
