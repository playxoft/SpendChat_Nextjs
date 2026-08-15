"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateInputMode } from "@/actions/settings";
import type { InputMode } from "@/lib/validation";

type Option = {
  value: InputMode;
  label: string;
  description: string;
  /** A small visual mock of the composer layout for this option. */
  example: React.ReactNode;
};

/** A faux input pill used purely to illustrate each layout. */
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
        "inline-flex h-7 items-center rounded-md border bg-background px-2 text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

const OPTIONS: Option[] = [
  {
    value: "amount_title",
    label: "Amount, then title",
    description: "The original layout. Type the amount first, then a title beside it.",
    example: (
      <div className="flex items-center gap-1.5">
        <Pill className="w-16 justify-start">$ 100</Pill>
        <Pill className="flex-1 justify-start">fruits</Pill>
      </div>
    ),
  },
  {
    value: "title_amount",
    label: "Title, then amount",
    description: "Flip it around — type the title first, with the amount beside it.",
    example: (
      <div className="flex items-center gap-1.5">
        <Pill className="flex-1 justify-start">fruits</Pill>
        <Pill className="w-16 justify-start">$ 100</Pill>
      </div>
    ),
  },
  {
    value: "combined",
    label: "One field (amount + title)",
    description:
      "A single field. The leading number becomes the amount and the rest becomes the title — fastest for quick entries.",
    example: (
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill className="justify-start font-medium text-foreground">100 fruits</Pill>
        <span className="text-xs text-muted-foreground">→ $100 · fruits</span>
      </div>
    ),
  },
];

export function InputModeForm({ inputMode }: { inputMode: string }) {
  const initial = (OPTIONS.some((o) => o.value === inputMode)
    ? inputMode
    : "amount_title") as InputMode;
  const [selected, setSelected] = useState<InputMode>(initial);
  const [baseline, setBaseline] = useState<InputMode>(initial);
  const [pending, startTransition] = useTransition();

  // Re-baseline (and drop unsaved edits) whenever the saved value changes.
  if (baseline !== initial) {
    setBaseline(initial);
    setSelected(initial);
  }

  const dirty = selected !== baseline;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateInputMode(selected);
      if (res.ok) toast.success("Input layout saved");
      else toast.error(res.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div
        role="radiogroup"
        aria-label="Transaction input layout"
        className="grid gap-3 lg:grid-cols-3"
      >
        {OPTIONS.map((opt) => {
          const active = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(opt.value)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-primary ring-1 ring-primary"
                  : "hover:border-foreground/30 hover:bg-muted/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{opt.label}</span>
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
              <div className="mt-auto rounded-md bg-muted/50 p-2">{opt.example}</div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setSelected(baseline)}
          disabled={!dirty || pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!dirty || pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
