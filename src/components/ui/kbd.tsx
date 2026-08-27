"use client";

import { useIsMac } from "@/hooks/use-shortcut";
import { describeShortcut, formatShortcutKeys } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * Render a keyboard-shortcut hint, localized to the platform (⌘ on macOS,
 * Ctrl on Windows/Linux).
 *
 * The chips themselves are decorative and hidden from assistive tech — the
 * glyphs are for the eye, and a screen reader announcing "up arrowhead" helps
 * nobody (see `formatShortcutKeys`). That's the right default beside a control
 * that already has an accessible name.
 *
 * **It is the wrong default in running prose.** "Press ⌘↵ to send" read aloud
 * becomes "Press to send" — the sentence loses its subject. Pass `describe`
 * there and the chip is followed by a visually-hidden "Cmd + Enter", so the
 * spoken sentence says what the visible one does.
 */
export function Kbd({
  combo,
  className,
  describe = false,
}: {
  combo: string;
  className?: string;
  /** Also emit the combo in words, `sr-only`. Use wherever the chip is part of a sentence. */
  describe?: boolean;
}) {
  const isMac = useIsMac();
  const keys = formatShortcutKeys(combo, isMac);
  if (keys.length === 0) return null;

  return (
    <>
      {/* `data-slot="kbd"` is what `TooltipContent` styles against when a hint
          carries a shortcut chip (it tightens its right padding to suit). */}
      <span
        data-slot="kbd"
        className={cn("inline-flex items-center gap-0.5", className)}
        aria-hidden="true"
      >
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
      {describe ? <span className="sr-only">{describeShortcut(combo, isMac)}</span> : null}
    </>
  );
}
