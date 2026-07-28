"use client";

import { Sparkles } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { comboFor } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

export type EntryMode = "manual" | "ai";

/** Blue→violet accent that marks the AI affordance. The app is otherwise
 * gradient-free (see AGENTS.md); this is a deliberate, user-requested exception
 * so AI entry stands out from plain Manual entry. */
const AI_GRADIENT = "bg-gradient-to-r from-blue-600 to-violet-600";

/**
 * Segmented Manual / AI switch shared by both composer modes. Kept compact so it
 * can ride inline on a mode's first row rather than claiming a line of its own.
 * The AI side is tinted blue→violet so it reads as the "smart" option even when
 * inactive. Toggled with the `a` shortcut (bound in the composer).
 */
export function EntryModeToggle({
  mode,
  onChange,
  className,
}: {
  mode: EntryMode;
  onChange: (m: EntryMode) => void;
  className?: string;
}) {
  const combo = comboFor("tracker.toggle-mode");
  return (
    // `radiogroup`, not `tablist`: there are no tab panels here — picking a side
    // swaps which composer is live. A tablist would have a screen reader
    // announce panels that don't exist and hunt for `aria-controls`.
    <div
      role="radiogroup"
      aria-label="Entry mode"
      title="Toggle Manual / AI"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border bg-muted/50 p-0.5 text-sm",
        className,
      )}
    >
      {(["manual", "ai"] as const).map((m) => {
        const active = mode === m;
        const isAi = m === "ai";
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={isAi ? "AI entry" : "Manual entry"}
            onClick={() => onChange(m)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium capitalize transition-colors sm:px-3",
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
                <Sparkles className={cn("size-3.5", active ? "text-white" : "text-violet-600")} />
                AI
              </>
            ) : (
              "Manual"
            )}
            {/* The ⌘A hint rides inside the active pill, like ⌘E on the type
                toggle (desktop only). */}
            {active && <Kbd combo={combo} className="hidden opacity-80 sm:inline-flex" />}
          </button>
        );
      })}
    </div>
  );
}
