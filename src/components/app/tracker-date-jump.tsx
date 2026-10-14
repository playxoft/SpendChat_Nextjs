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

function longMonth(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * "Go to a date" in the tracker header: a month calendar whose days with
 * transactions (in the profiles on view) carry a dot. Picking a day opens the
 * feed at that day; "Go to <month>" opens it at the month's latest day with
 * transactions. A day or month with nothing on it lands on the nearest earlier
 * day that has something, and the feed says so.
 *
 * Opens on the month under the header (the one the balance is showing). The
 * dots load per month as you page through, once per opening — a fresh opening
 * reads again, so a transaction added since shows up.
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
        className="w-auto"
        onCloseAutoFocus={(e) => {
          // The feed moves focus to the day's date pill once it's there.
          if (jumping.current) e.preventDefault();
          jumping.current = false;
        }}
      >
        <Calendar
          defaultMonth={activeMonth}
          today={today}
          markedDays={marks.get(month) ?? new Set()}
          onMonthChange={(m) => void loadMonth(m)}
          onSelect={(iso) => void go({ kind: "day", date: iso })}
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => void go({ kind: "month", month })}
        >
          Go to {longMonth(month, locale)}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
