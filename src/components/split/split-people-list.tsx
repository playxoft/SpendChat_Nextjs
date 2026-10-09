"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { committedUnits, inputHint, type SliderInput } from "@/lib/split-slider-input";
import { snapToTotal, type SliderState } from "@/lib/split-sliders";
import { cn } from "@/lib/utils";

/**
 * The people side of an expense, shared by the app (the chat composer and the
 * expense dialog) and the free split calculator: who's in it, what each one's
 * part is, and — for an exact or percent split, or several payers — a slider
 * per person that can't make the total wrong (`lib/split-sliders.ts`), with a
 * number box beside it for typing a figure instead (`lib/split-slider-input.ts`).
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
  /** The number box beside each slider: how it shows, filters and reads a value. */
  input: SliderInput;
  /** While saving: the thumbs don't move (a disabled fieldset doesn't reach them). */
  disabled?: boolean;
};

/** A slider's (and its box's) accessible name: "Share for Asha", "What you paid". */
function sliderLabel(what: string, person: SplitPerson): string {
  if (what === "Paid") return person.isYou ? "What you paid" : `What ${person.name} paid`;
  return `${what} for ${person.isYou ? "you" : person.name}`;
}

/**
 * Type a figure instead of dragging. Nothing moves while typing; Enter or
 * leaving the box commits it like a slider move (clamped to 0…total, the
 * others rebalancing — and the person counts as set by hand, even at the same
 * figure). A figure that can't be read stays in the box, marked invalid with
 * an example in the viewer's format, rather than snapping back unexplained.
 * Escape puts the value back. While a figure is being typed the box carries
 * `data-editing`, so a dialog can let Escape revert it rather than close.
 */
function SliderNumberBox({ binding, person, what }: { binding: SliderBinding; person: SplitPerson; what: string }) {
  const { state, input } = binding;
  const value = state.values[person.id] ?? 0;
  const [draft, setDraft] = React.useState<string | null>(null);
  const [invalid, setInvalid] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  const hintId = React.useId();
  const shown = draft ?? input.toText(value);
  const commit = () => {
    if (draft === null) return;
    const units = committedUnits(draft, input, state.total);
    if (units === null && draft.trim()) {
      // Keep what was typed so it can be fixed; say what a number looks like here.
      setInvalid(true);
      return;
    }
    setDraft(null);
    setInvalid(false);
    if (units !== null) binding.onMove(person.id, units);
  };
  // Another box committing rebalances this one while it has focus; React's
  // rewrite of the value drops the selection, so typing would append to the
  // old figure. Select it again whenever the shown value changes under focus.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el && draft === null && document.activeElement === el) el.select();
  }, [shown, draft]);
  const disabled = binding.disabled || state.total === 0 || state.ids.length < 2;
  return (
    <div className="relative min-w-0 max-w-36 flex-1">
      <div
        className={cn(
          "flex h-8 w-full items-center rounded-md border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 dark:bg-input/30",
          invalid && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20",
          disabled && "opacity-50",
        )}
      >
        {input.prefix && (
          // The symbol from `sm` up; on a phone the box needs the room for digits.
          <span aria-hidden className="hidden pl-2 text-sm text-muted-foreground select-none sm:inline">
            {input.prefix}
          </span>
        )}
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={shown}
          disabled={disabled}
          data-editing={draft !== null ? "" : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? hintId : undefined}
          aria-label={`${sliderLabel(what, person)}${input.suffix ? ` (${input.suffix})` : ""}`}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const typed = e.target.value;
            setInvalid(false);
            setDraft((prev) => input.accept(prev ?? shown, typed));
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              // Commit, never submit the form around it.
              e.preventDefault();
              commit();
            } else if (e.key === "Escape" && draft !== null) {
              e.preventDefault();
              e.stopPropagation();
              setDraft(null);
              setInvalid(false);
            }
          }}
          // 16px on phones, so iOS doesn't zoom in on focus.
          className="h-full w-full min-w-0 bg-transparent px-1.5 text-right text-base tabular-nums outline-none sm:px-2 md:text-sm"
        />
        {input.suffix && (
          <span aria-hidden className="pr-1.5 text-sm text-muted-foreground select-none sm:pr-2">
            {input.suffix}
          </span>
        )}
      </div>
      {invalid && (
        <p
          id={hintId}
          role="status"
          className="absolute top-full right-0 z-10 mt-1 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm"
        >
          {inputHint(input)}
        </p>
      )}
    </div>
  );
}

/**
 * For a dialog's `onEscapeKeyDown`: Escape in a number box that's mid-edit
 * reverts the figure instead of closing the dialog.
 */
export function keepOpenWhileTyping(event: KeyboardEvent): void {
  if (event.target instanceof HTMLElement && event.target.dataset.editing !== undefined) event.preventDefault();
}

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
      thumbLabel={sliderLabel(what, person)}
      valueText={binding.format(value)}
      className="min-w-24 flex-1"
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
 * One person's slider: name (and email) over the slider and its number box.
 * `aside` goes on the right of the name — a percent row shows the money there.
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
  const bound = disabled ? { ...binding, disabled: true } : binding;
  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {avatar}
        <PersonName person={person} className="flex-1" />
        {aside !== undefined && <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{aside}</span>}
      </div>
      <div className="flex items-center gap-3">
        <BoundSlider binding={bound} person={person} what={what} />
        <SliderNumberBox binding={bound} person={person} what={what} />
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
  /**
   * With sliders, the right of a person's row shows this instead of their
   * share — a percent split shows the money; by default nothing, since the
   * number box beside the slider already says it.
   */
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
                {withSlider ? (
                  sliderAside !== undefined && (
                    <span className="shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                      {sliderAside(p.id)}
                    </span>
                  )
                ) : (
                  <span
                    className={cn(
                      "shrink-0 text-right text-sm tabular-nums",
                      share ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {share ?? "—"}
                  </span>
                )}
              </div>
              {withSlider && (
                <div className="mt-2 flex items-center gap-3 sm:pl-6.5">
                  <BoundSlider binding={sliders} person={p} what="Share" />
                  <SliderNumberBox binding={sliders} person={p} what="Share" />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
