"use client";

import { useState, useTransition } from "react";
import { Calendar, Check, Minus, Pencil, Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateComposerDensity } from "@/actions/settings";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { ComposerDensity } from "@/lib/validation";

type Option = {
  value: ComposerDensity;
  label: string;
  description: string;
  /** A small visual mock of the composer's control strip at this density. */
  example: React.ReactNode;
};

/** A faux control used purely to illustrate each density. */
function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border bg-background px-2 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

const OPTIONS: Option[] = [
  {
    value: "normal",
    label: "Normal",
    description:
      "The full layout. Controls are labelled and the category list gets a row of its own.",
    example: (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <Pill>Manual</Pill>
          <Pill>
            <Minus className="size-3" />
            Expense
          </Pill>
          <Pill className="ml-auto">
            <Calendar className="size-3" />3 Aug 2026
          </Pill>
        </div>
        <div className="flex items-center gap-1">
          <Pill>🍎 Food</Pill>
          <Pill>🚕 Travel</Pill>
          <Pill>More</Pill>
        </div>
      </div>
    ),
  },
  {
    value: "compact",
    label: "Compact",
    description:
      "One line. Controls drop to icons and the date to “Aug 3”, freeing the rest of the row for the category list. Hover any control to see its name and shortcut.",
    example: (
      <div className="flex items-center gap-1">
        <Pill>
          <Pencil className="size-3" />
        </Pill>
        <Pill>
          <Minus className="size-3" />
        </Pill>
        <Pill>
          <Calendar className="size-3" />
          Aug 3
        </Pill>
        <Pill>🍎 Food</Pill>
        <Pill>
          <Tags className="size-3" />
        </Pill>
      </div>
    ),
  },
];

/**
 * Picks `ui_prefs.composer.density`. Mirrors `InputModeForm` (radio cards with a
 * mock of the result, save/cancel against a baseline) because the two settings
 * sit together on the input page and describe the same strip of UI — one its
 * field order, the other how much room it takes.
 */
export function ComposerDensityForm({ density }: { density: string }) {
  const initial = (OPTIONS.some((o) => o.value === density)
    ? density
    : "normal") as ComposerDensity;
  const [selected, setSelected] = useState<ComposerDensity>(initial);
  const [baseline, setBaseline] = useState<ComposerDensity>(initial);
  const [pending, startTransition] = useTransition();
  // Phones render the composer at Compact whatever is stored, so Normal isn't a
  // real choice here — it's disabled rather than silently ignored. Width-based,
  // so a landscape phone (>= 768px, where the full layout does fit) keeps both
  // options. Saving is blocked too: submitting a value the device can't show is
  // the confusing part, more than the radio itself.
  const isMobile = useIsMobile();

  // Re-baseline (and drop unsaved edits) whenever the saved value changes.
  if (baseline !== initial) {
    setBaseline(initial);
    setSelected(initial);
  }

  const dirty = selected !== baseline;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateComposerDensity(selected);
      if (res.ok) toast.success("Composer density saved");
      else toast.error(res.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div
        role="radiogroup"
        aria-label="Transaction composer density"
        className="grid gap-3 lg:grid-cols-2"
      >
        {OPTIONS.map((opt) => {
          const active = selected === opt.value;
          // Only Normal is unavailable — Compact is what a phone already shows.
          const blocked = isMobile && opt.value === "normal";
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={blocked}
              // Spells out *why* it's disabled — a bare `disabled` radio reads
              // as a bug to a screen reader user, who can't see the badge.
              aria-describedby={blocked ? "density-normal-unavailable" : undefined}
              onClick={() => setSelected(opt.value)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                blocked
                  ? "cursor-not-allowed border-dashed opacity-60"
                  : active
                    ? "border-primary ring-1 ring-primary"
                    : "hover:border-foreground/30 hover:bg-muted/40",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {opt.label}
                  {blocked && (
                    <span
                      id="density-normal-unavailable"
                      // Amber, not muted grey: this is the one thing on the card
                      // the user needs to read, and grey-on-grey inside an
                      // already-dimmed card is exactly what gets missed.
                      className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                    >
                      Unavailable on mobile
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40",
                  )}
                >
                  {active && <Check className="size-3" strokeWidth={3} />}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {opt.description}
              </p>
              <div className="mt-auto overflow-hidden rounded-md bg-muted/50 p-2">
                {opt.example}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {isMobile && (
          <p className="mr-auto text-xs text-amber-700 dark:text-amber-400">
            Change this on a tablet or desktop.
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => setSelected(baseline)}
          disabled={!dirty || pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!dirty || pending || isMobile}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
