"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { snapToTotal, type SliderState } from "@/lib/split-sliders";
import { cn } from "@/lib/utils";

/**
 * The people side of an expense, shared by the app (the chat composer and the
 * expense dialog) and the free split calculator: who's in it, what each one's
 * part is, and — for an exact or percent split, or several payers — a slider
 * per person that can't make the total wrong (`lib/split-sliders.ts`).
 */

export type SplitPerson = {
  id: string;
  name: string;
  /** Shown under the name when the viewer may see it (the app: the group's creator). */
  email?: string | null;
  isYou?: boolean;
};

/** Sliders for some of the people: their state, how a value reads, and what moving one does. */
export type SliderBinding = {
  state: SliderState;
  step: number;
  /** A value as words — "₹30.00", "25%". */
  format: (units: number) => string;
  onMove: (id: string, units: number) => void;
  /** While saving: the thumbs don't move (a disabled fieldset doesn't reach them). */
  disabled?: boolean;
};

/** The slider for one person in a binding — the same in every list. */
function BoundSlider({ binding, person, what }: { binding: SliderBinding; person: SplitPerson; what: string }) {
  const { state, step } = binding;
  const value = state.values[person.id] ?? 0;
  return (
    <Slider
      value={[value]}
      min={0}
      max={Math.max(state.total, 1)}
      step={step}
      disabled={binding.disabled || state.total === 0 || state.ids.length < 2}
      onValueChange={([v]) => {
        if (v !== undefined) binding.onMove(person.id, snapToTotal(v, state.total, step));
      }}
      thumbLabel={`${what} for ${person.isYou ? "you" : person.name}`}
      valueText={binding.format(value)}
      className="flex-1"
    />
  );
}

function PersonName({ person, className }: { person: SplitPerson; className?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-col", className)}>
      <span className="truncate text-sm">{person.isYou ? `${person.name} (you)` : person.name}</span>
      {person.email ? <span className="truncate text-xs text-muted-foreground">{person.email}</span> : null}
    </span>
  );
}

/**
 * One person's slider: name (and email), the value it stands at, and the
 * slider under them. `aside` replaces the value on the right (a percent row
 * shows the money there and the percent beside the slider).
 */
export function ShareSliderRow({
  person,
  binding,
  avatar,
  aside,
  disabled,
  what = "Share",
}: {
  person: SplitPerson;
  binding: SliderBinding;
  avatar?: React.ReactNode;
  aside?: React.ReactNode;
  disabled?: boolean;
  /** What the slider sets, for its accessible name: "Share", "Paid". */
  what?: string;
}) {
  const text = binding.format(binding.state.values[person.id] ?? 0);
  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {avatar}
        <PersonName person={person} className="flex-1" />
        <span className="shrink-0 text-sm font-medium tabular-nums">{aside ?? text}</span>
      </div>
      <div className="flex items-center gap-3">
        <BoundSlider binding={disabled ? { ...binding, disabled: true } : binding} person={person} what={what} />
        {aside !== undefined && (
          <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{text}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Who's in an expense: a tick per person, with Select all / Deselect all (or
 * one "All" box in the corner) at the top, each person's email under their
 * name, and their part on the right. Pass `sliders` for an exact or percent
 * split: everyone ticked gets a slider under their row.
 */
export function SplitPeopleList({
  people,
  included,
  onIncludedChange,
  shareText,
  sliders,
  sliderAside,
  avatar,
  header = "buttons",
  label = "Split between",
  className,
}: {
  people: SplitPerson[];
  included: ReadonlySet<string>;
  onIncludedChange: (ids: string[]) => void;
  /** What someone's part comes to, or null for "—". */
  shareText: (id: string) => string | null;
  sliders?: SliderBinding | null;
  /** With sliders: what to show on the right instead of the slider's value. */
  sliderAside?: (id: string) => React.ReactNode;
  avatar?: (person: SplitPerson) => React.ReactNode;
  header?: "buttons" | "checkbox";
  label?: string;
  className?: string;
}) {
  const base = React.useId();
  const all = people.length > 0 && people.every((p) => included.has(p.id));
  const some = people.some((p) => included.has(p.id));
  const set = (id: string, on: boolean) =>
    onIncludedChange(people.filter((p) => (p.id === id ? on : included.has(p.id))).map((p) => p.id));

  return (
    <div className={cn("rounded-xl border", className)}>
      <div className="flex min-h-10 items-center gap-2 border-b px-3 py-1.5">
        {header === "checkbox" ? (
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={all ? true : some ? "indeterminate" : false}
              onCheckedChange={(on) => onIncludedChange(on === true ? people.map((p) => p.id) : [])}
              aria-label={all ? "Deselect everyone" : "Select everyone"}
            />
            <span className="truncate">
              All <span className="font-normal text-muted-foreground">· {label.toLowerCase()}</span>
            </span>
          </label>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={all}
              onClick={() => onIncludedChange(people.map((p) => p.id))}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!some}
              onClick={() => onIncludedChange([])}
            >
              Deselect all
            </Button>
          </>
        )}
      </div>
      <ul className="divide-y">
        {people.map((p, i) => {
          const id = `${base}-${i}`;
          const on = included.has(p.id);
          const share = shareText(p.id);
          const withSlider = sliders && on && sliders.state.ids.includes(p.id);
          return (
            <li key={p.id} className="px-3 py-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <Checkbox id={id} checked={on} onCheckedChange={(v) => set(p.id, v === true)} />
                {avatar?.(p)}
                <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                  <PersonName person={p} />
                </label>
                <span
                  className={cn(
                    "shrink-0 text-right text-sm tabular-nums",
                    share ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {share ?? "—"}
                </span>
              </div>
              {withSlider && (
                <div className="mt-2 flex items-center gap-3 pl-6.5">
                  <BoundSlider binding={sliders} person={p} what="Share" />
                  {sliderAside !== undefined && (
                    <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {sliderAside(p.id)}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
