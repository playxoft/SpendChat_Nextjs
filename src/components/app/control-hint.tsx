"use client";

import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Name a composer control on hover, with its keyboard shortcut.
 *
 * Compact density strips the visible labels and the inline `Kbd` chips off the
 * control strip to fit it on one line; this is where that information goes
 * instead, so the row stays learnable rather than becoming a line of
 * unexplained icons. `enabled` is what keeps that scoped — at normal density the
 * labels and chips are still on screen, so the wrapper steps out of the way
 * entirely and renders the control as-is.
 *
 * `combo` is optional: some controls are worth naming but have no binding.
 */
export function ControlHint({
  label,
  combo,
  side = "top",
  enabled = true,
  children,
}: {
  label: string;
  combo?: string;
  side?: "top" | "bottom" | "left" | "right";
  enabled?: boolean;
  children: React.ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <span>{label}</span>
        {combo ? <Kbd combo={combo} /> : null}
      </TooltipContent>
    </Tooltip>
  );
}
