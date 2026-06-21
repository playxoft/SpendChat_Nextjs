"use client";

import { useIsMac } from "@/hooks/use-shortcut";
import { formatShortcutKeys } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * Render a keyboard-shortcut hint, localized to the platform (⌘ on macOS,
 * Ctrl on Windows/Linux). Decorative — hidden from assistive tech.
 */
export function Kbd({ combo, className }: { combo: string; className?: string }) {
  const isMac = useIsMac();
  const keys = formatShortcutKeys(combo, isMac);
  if (keys.length === 0) return null;

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-hidden="true">
      {keys.map((k, i) => {
        // Symbol glyphs (⇧ ⌘ ⌥ ⌃ ↵ `) render visually tiny next to letters, so
        // give them a noticeably larger font than alphanumeric keys.
        const isSymbol = /^[^A-Za-z0-9]$/.test(k);
        return (
          <kbd
            key={`${k}-${i}`}
            className={cn(
              "inline-flex h-[22px] min-w-[22px] items-center justify-center rounded border border-foreground/30 bg-muted px-1.5 leading-none font-semibold text-foreground shadow-[0_1px_0_var(--border)]",
              isSymbol ? "text-base" : "text-xs",
            )}
          >
            {k}
          </kbd>
        );
      })}
    </span>
  );
}
