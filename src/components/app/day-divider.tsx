import { cn } from "@/lib/utils";

/**
 * A day's date pill between messages.
 *
 * `sticky` (the tracker): the pill stays pinned, centred, just under the sticky
 * header while you scroll through that day, WhatsApp-style. It sticks within
 * its day's group — the divider's parent — so as the day ends the next day's
 * pill arrives from below and pushes it up and out. It's the one element for
 * the date: nothing is duplicated, so a screen reader reads each date once, in
 * order, wherever the pill happens to be drawn. `--tracker-header-bottom` is
 * measured from the header (`useTrackerChromeVars`); the fallback only covers
 * the first paint before that runs. The row lets clicks through to the bubbles
 * it floats over, and sits above them but under the header.
 *
 * The pill takes focus (programmatically only) so a jump to a date can move
 * keyboard and screen-reader users to the day it opened.
 */
export function DayDivider({ label, sticky = false }: { label: string; sticky?: boolean }) {
  return (
    <div
      className={cn(
        "my-3 flex items-center justify-center",
        sticky &&
          "pointer-events-none sticky top-[calc(var(--tracker-header-bottom,7rem)_+_0.5rem)] z-[5]",
      )}
    >
      <span
        data-day-pill={sticky ? "" : undefined}
        tabIndex={sticky ? -1 : undefined}
        className={cn(
          "rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground",
          sticky && "shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
      >
        {label}
      </span>
    </div>
  );
}
