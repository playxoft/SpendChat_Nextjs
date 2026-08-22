"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The blue→violet AI accent, and the small controls that carry it.
 *
 * `AGENTS.md` allows exactly one gradient in an otherwise gradient-free app —
 * it marks "this calls a model" — and is explicit that a second one must never
 * be added. That rule is only enforceable if there's one definition to point
 * at. Until now the same colours were written out twice (`AI_GRADIENT` in
 * `entry-mode-toggle.tsx`, `AI_BTN` in `ai-transaction-input.tsx`), which is
 * how a third copy eventually appears half a shade off. Both now import from
 * here, as does the marketing site's AI demo.
 */
export const AI_GRADIENT = "bg-gradient-to-r from-blue-600 to-violet-600";

/** The gradient as a primary button: AI mode's confirm and send actions. */
export const AI_BTN = `border-0 ${AI_GRADIENT} text-white shadow-sm hover:from-blue-600 hover:to-violet-700`;

/** Compact expense/income switch — the tracker's pill toggle stripped to icons. */
export function RowTypeToggle({
  value,
  onChange,
}: {
  value: "income" | "expense";
  onChange: (t: "income" | "expense") => void;
}) {
  return (
    <div className="inline-flex shrink-0 items-center rounded-full border bg-muted/60 p-0.5">
      {(["expense", "income"] as const).map((t) => {
        const active = value === t;
        const Icon = t === "income" ? Plus : Minus;
        const color =
          t === "income"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400";
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            aria-label={t}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center justify-center rounded-full px-2.5 py-1 transition-all",
              active ? "bg-background shadow-sm" : "opacity-45 hover:opacity-90",
            )}
          >
            <Icon className={cn("size-4", color)} />
          </button>
        );
      })}
    </div>
  );
}
