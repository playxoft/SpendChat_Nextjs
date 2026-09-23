"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateComposerDensity } from "@/actions/settings";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { ComposerPreview } from "./composer-preview";
import type { ComposerDensity, InputMode } from "@/lib/validation";

type Option = {
  value: ComposerDensity;
  label: string;
  description: string;
};

const OPTIONS: Option[] = [
  {
    value: "normal",
    label: "Normal",
    description:
      "The full layout. Controls are labelled and the category list gets a row of its own.",
  },
  {
    value: "compact",
    label: "Compact",
    description:
      "One line. Controls drop to icons and the date to “Aug 3”, freeing the rest of the row for the category list. Hover any control to see its name and shortcut.",
  },
];

/**
 * Picks `ui_prefs.composer.density`. Mirrors `InputModeForm` (radio cards with a
 * mock of the result, save/cancel against a baseline) because the two settings
 * sit together on the input page and describe the same strip of UI — one its
 * field order, the other how much room it takes.
 */
export function ComposerDensityForm({
  density,
  inputMode,
  onSelectedChange,
  preview,
}: {
  density: string;
  /** The layout the previews render — follows the *selected* option in the
   *  card above, so changing one shows its effect on the other before either
   *  is saved. They describe the same strip of UI. */
  inputMode: InputMode;
  /** Reports the *selected* (not yet saved) density, so the layout card above
   *  previews at it. */
  onSelectedChange?: (density: ComposerDensity) => void;
  /** Workspace facts the preview renders — currency symbol, locale, today. */
  preview: { symbol: string; locale: string; today: string };
}) {
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
              onClick={() => {
                setSelected(opt.value);
                onSelectedChange?.(opt.value);
              }}
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
              {/* The composer as it would actually look at this density,
                  in the layout selected above — not a drawing of it. */}
              <ComposerPreview
                {...preview}
                density={opt.value}
                inputMode={inputMode}
                className="mt-auto"
              />
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
          onClick={() => {
            setSelected(baseline);
            onSelectedChange?.(baseline);
          }}
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
