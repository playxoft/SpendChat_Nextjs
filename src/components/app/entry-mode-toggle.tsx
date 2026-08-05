"use client";

import { Pencil, Sparkles } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { comboFor } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { ControlHint } from "./control-hint";

export type EntryMode = "manual" | "ai";

/** Blue→violet accent that marks the AI affordance. The app is otherwise
 * gradient-free (see AGENTS.md); this is a deliberate, user-requested exception
 * so AI entry stands out from plain Manual entry. */
const AI_GRADIENT = "bg-gradient-to-r from-blue-600 to-violet-600";

/**
 * The row this toggle rides in, at compact density — applied verbatim by *both*
 * composer panes (Manual's control strip and AI's header).
 *
 * It exists because the toggle is the one control that must not move: it's what
 * you click to switch panes, and the panes swap under it. Left to size
 * themselves, the two rows differ (Manual carries the taller grouped widget), so
 * the toggle would jump a few pixels on every switch. A fixed height on both,
 * with `items-center`, pins it. Tall enough for the grouped widget — raise both
 * together if anything in either row outgrows it.
 */
export const MODE_ROW_DENSE = "flex h-9 items-center gap-2";

/**
 * Segmented Manual / AI switch shared by both composer modes. Kept compact so it
 * can ride inline on a mode's first row rather than claiming a line of its own.
 * The AI side is tinted blue→violet so it reads as the "smart" option even when
 * inactive. Toggled with the `a` shortcut (bound in the composer).
 *
 * `dense` drops both sides to bare icons for the compact composer — the names
 * and the ⌘ hint move into hover tooltips (`ControlHint`). Manual borrows the
 * `Pencil` glyph there: it has no icon of its own at normal density, where the
 * word carries it.
 */
export function EntryModeToggle({
  mode,
  onChange,
  className,
  dense = false,
}: {
  mode: EntryMode;
  onChange: (m: EntryMode) => void;
  className?: string;
  dense?: boolean;
}) {
  const combo = comboFor("tracker.toggle-mode");
  return (
    // `radiogroup`, not `tablist`: there are no tab panels here — picking a side
    // swaps which composer is live. A tablist would have a screen reader
    // announce panels that don't exist and hunt for `aria-controls`.
    <div
      role="radiogroup"
      aria-label="Composer mode"
      // Dense gives each side its own tooltip; a native title on the group would
      // fight with it (two hints for one hover).
      title={dense ? undefined : "Toggle Manual / AI"}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border p-0.5 text-sm",
        // Dense sits this beside the recessed control group, so it takes the
        // opposite fill — raised on the card's own background — to read as a
        // standalone button rather than another field in the set.
        dense ? "bg-background shadow-sm" : "bg-muted/50",
        className,
      )}
    >
      {(["manual", "ai"] as const).map((m) => {
        const active = mode === m;
        const isAi = m === "ai";
        const label = isAi ? "AI mode" : "Manual mode";
        return (
          <ControlHint key={m} label={label} combo={combo} enabled={dense}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              onClick={() => onChange(m)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full font-medium capitalize transition-colors",
                dense ? "px-2 py-1" : "px-2.5 py-1 sm:px-3",
                isAi
                  ? active
                    ? cn(AI_GRADIENT, "text-white shadow-sm")
                    // Inactive AI: gradient text so it still draws the eye.
                    : cn(AI_GRADIENT, "bg-clip-text text-transparent")
                  : active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isAi ? (
                <>
                  <Sparkles
                    className={cn(
                      // size-4 at dense so this pill measures exactly the same as
                      // the expense/income one beside it — they're siblings, and
                      // a 2px difference reads as a mistake.
                      dense ? "size-4" : "size-3.5",
                      active ? "text-white" : "text-violet-600",
                    )}
                  />
                  {!dense && "AI"}
                </>
              ) : dense ? (
                <Pencil className="size-4" />
              ) : (
                "Manual"
              )}
              {/* The ⌘A hint rides inside the active pill, like ⌘E on the type
                  toggle (desktop only) — dense moves it into the tooltip. */}
              {active && !dense && (
                <Kbd combo={combo} className="hidden opacity-80 sm:inline-flex" />
              )}
            </button>
          </ControlHint>
        );
      })}
    </div>
  );
}
