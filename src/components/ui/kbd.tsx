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
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-foreground/30 bg-muted px-1.5 text-xs leading-none font-semibold text-foreground shadow-[0_1px_0_var(--border)]"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
