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
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-foreground/20 bg-background/60 px-1 text-[11px] leading-none font-semibold text-muted-foreground"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
