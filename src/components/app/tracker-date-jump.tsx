"use client";

import { useCallback, useRef, useState } from "react";
import { CalendarSearch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { loadFeedDays } from "@/actions/transactions";
import type { FeedJumpTarget } from "@/lib/feed-days";
import { useActiveMonth } from "./active-month";
import { useFeedJump } from "./feed-jump";
import { PeriodGrid, type Quarter } from "./period-grid";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "Go to a date" in the tracker header, laid out like the transactions date
 * filter: whole months and quarters of a year on the left, and a month
 * calendar whose days with transactions (in the profiles on view) carry a dot.
 * Picking a day opens the feed at that day; a month opens it at the month's
 * latest day with transactions, and a quarter at the quarter's. A day or month with nothing on it lands on the nearest
 * earlier day that has something, and the feed says so.
 *
 * Opens on the month under the header (the one the balance is showing), which
 * the grid marks. The dots load per month as you page through, once per
 * opening — a fresh opening reads again, so a transaction added since shows up.
 */
export function TrackerDateJump({
  profileIds,
  today,
  locale,
}: {
  /** Profiles in view (one, or the sidebar's selection); null = all of them. */
  profileIds: string[] | null;
  today: string;
  locale: string;
}) {
  const { jump } = useFeedJump();
  const { activeMonth } = useActiveMonth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(activeMonth);
  const [year, setYear] = useState(() => Number(activeMonth.slice(0, 4)));
  const [marks, setMarks] = useState<ReadonlyMap<string, ReadonlySet<string>>>(() => new Map());
  // Months asked for in this opening, so paging back and forth reads each once.
  const asked = useRef(new Set<string>());
  // Closing because of a jump: focus goes to the day it opened, not back here.
  const jumping = useRef(false);

  const loadMonth = useCallback(
    async (m: string) => {
      setMonth(m);
      if (asked.current.has(m)) return;
      asked.current.add(m);
      const res = await loadFeedDays({ profileIds: profileIds ?? undefined, month: m });
      // A failure just shows no dots; every day can still be picked.
      if (!res.ok) {
        asked.current.delete(m);
        return;
      }
      setMarks((prev) => new Map(prev).set(m, new Set(res.days)));
    },
    [profileIds],
  );

  function onOpenChange(next: boolean) {
    if (next) {
      asked.current = new Set();
      setMarks(new Map());
      setMonth(activeMonth);
      setYear(Number(activeMonth.slice(0, 4)));
    }
    setOpen(next);
  }

  async function go(target: FeedJumpTarget) {
    jumping.current = true;
    setOpen(false);
    setBusy(true);
    try {
      await jump(target);
    } finally {
      setBusy(false);
    }
  }

  function goToQuarter(y: number, q: Quarter) {
    void go({ kind: "quarter", year: y, quarter: q });
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Go to a date"
              aria-busy={busy || undefined}
              className="shrink-0"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarSearch className="size-4" />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Go to a date</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        closeOnOutsideClick
        className="max-h-[min(36rem,var(--radix-popover-content-available-height))] w-auto overflow-y-auto p-0"
        onCloseAutoFocus={(e) => {
          // The feed moves focus to the day's date pill once it's there.
          if (jumping.current) e.preventDefault();
          jumping.current = false;
        }}
      >
        <div className="flex flex-col md:flex-row">
          {/* Left: whole months and quarters of one year. */}
          <div className="flex flex-col gap-2 border-b p-3 md:w-52 md:border-r md:border-b-0">
            <PeriodGrid
              year={year}
              onYearChange={setYear}
              today={today}
              locale={locale}
              activeMonth={{ year: Number(activeMonth.slice(0, 4)), month: Number(activeMonth.slice(5, 7)) - 1 }}
              activeQuarter={null}
              onPickMonth={(y, m) => void go({ kind: "month", month: `${y}-${pad(m + 1)}` })}
              onPickQuarter={goToQuarter}
            />
          </div>
          {/* Right: one day, with dots on the days that have something. */}
          <div className="p-3">
            <Calendar
              defaultMonth={activeMonth}
              today={today}
              // Nothing is dated after today — the grid beside disables future months too.
              max={today}
              markedDays={marks.get(month) ?? new Set()}
              onMonthChange={(m) => void loadMonth(m)}
              onSelect={(iso) => void go({ kind: "day", date: iso })}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
