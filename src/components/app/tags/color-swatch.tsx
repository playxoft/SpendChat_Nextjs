"use client";

import { Check } from "lucide-react";
import { TAG_COLORS } from "@/lib/tags";
import { cn } from "@/lib/utils";

/**
 * The 20-swatch palette picker, shared by the transaction-tag form and the
 * vault's (which re-exports it under its old name).
 *
 * Exactly twenty cells in a 10×2 grid, and no "no color" cell — a tag always
 * has a color. Callers seed the value with `defaultTagColor(name)` so the form
 * opens on something deliberate rather than always on red.
 */
export function ColorSwatch({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="grid grid-cols-10 gap-1.5">
      {TAG_COLORS.map((color) => {
        const selected = value.toLowerCase() === color;
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            aria-label={`Color ${color}`}
            aria-pressed={selected}
            title={color}
            className={cn(
              "flex size-6 items-center justify-center rounded-full",
              selected && "ring-2 ring-ring ring-offset-1 ring-offset-background",
            )}
            style={{ backgroundColor: color }}
          >
            {selected ? <Check className="size-3.5 text-white" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
