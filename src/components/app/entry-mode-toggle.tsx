"use client";

import { useEffect, useRef } from "react";
import { Pencil, Sparkles } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { radioGroupKeys } from "@/lib/radio-group-keys";
import { comboFor } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { ControlHint } from "./control-hint";
import { AI_GRADIENT } from "./ai-accent";

export type EntryMode = "manual" | "ai";

const MODES = ["manual", "ai"] as const;

/** Marks both instances of this toggle, so the focus hand-over below can tell
 * "focus was in one of these" from "focus was somewhere else entirely". */
const TOGGLE_SLOT = "entry-mode-toggle";

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
  pane,
}: {
  mode: EntryMode;
  onChange: (m: EntryMode) => void;
  className?: string;
  dense?: boolean;
  /** Which composer pane this instance lives in. Both panes stay mounted, so
   * this is what tells the two twins apart when focus has to move between
   * them — see the effect below. */
  pane: EntryMode;
}) {
  const combo = comboFor("tracker.toggle-mode");
  const groupRef = useRef<HTMLDivElement>(null);

  // Both composer panes render this toggle, pinned to the same pixel, and the
  // pane that isn't showing stays mounted but hidden (that's what keeps the
  // toggle from jumping on a switch). So the twin the keyboard was in is hidden
  // by the very change it made and the browser drops focus to <body> — which
  // would make the arrow keys work exactly once. The instance in the pane that's
  // *appearing* takes focus instead; `pane` says which one that is, rather than
  // asking the DOM which group is visible (a question that's easy to ask wrong:
  // `checkVisibility()` ignores `visibility` unless told not to, `offsetParent`
  // only sees `display: none`, and the outgoing button is still
  // `document.activeElement` here because the blur is deferred a frame).
  useEffect(() => {
    if (pane !== mode) return;
    const active = document.activeElement;
    // Only when focus was already in one of the two twins. The `a` shortcut
    // switches modes from anywhere — pulling focus into the composer then would
    // be a surprise, and it's the reason this can't just always fire.
    if (!(active instanceof HTMLElement) || !active.closest(`[data-slot="${TOGGLE_SLOT}"]`)) return;
    const group = groupRef.current;
    if (!group || group.contains(active)) return;
    group.querySelector<HTMLElement>(`[role="radio"][data-mode="${mode}"]`)?.focus();
  }, [mode, pane]);

  // One tab stop, arrows move and select — what `role="radiogroup"` promises.
  const keys = radioGroupKeys(MODES, mode);
  return (
    // `radiogroup`, not `tablist`: there are no tab panels here — picking a side
    // swaps which composer is live. A tablist would have a screen reader
    // announce panels that don't exist and hunt for `aria-controls`.
    <div
      role="radiogroup"
      aria-label="Composer mode"
      data-slot={TOGGLE_SLOT}
      data-pane={pane}
      ref={groupRef}
      onKeyDown={(e) => keys.onKeyDown(e, onChange)}
      // Dense gives each side its own tooltip; a native title on the group would
      // fight with it (two hints for one hover).
      title={dense ? undefined : "Toggle Manual / AI"}
      className={cn(
        // `h-9` at every density. This and the control group beside it are the
        // two *containers* on the strip, so they share a height; the controls
        // they wrap are all `h-8`. Left intrinsic the two containers differ by
        // ~6px, which reads as a mistake rather than a hierarchy.
        "inline-flex h-9 shrink-0 items-center rounded-full border bg-muted/50 p-0.5 text-sm",
        // Same muted track at every density: the active side is what carries
        // the raised fill, and dense used to invert the track too — which read
        // as a different control between the two densities rather than the same
        // one, more tightly packed.
        className,
      )}
    >
      {MODES.map((m) => {
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
              data-mode={m}
              tabIndex={keys.tabIndexFor(m)}
              onClick={() => onChange(m)}
              className={cn(
                // `h-8` — the strip's one control height, matching the type,
                // date and category controls in the group beside this.
                "inline-flex h-8 items-center gap-1.5 rounded-full font-medium capitalize transition-colors",
                dense ? "px-2" : "px-2.5 sm:px-3",
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
