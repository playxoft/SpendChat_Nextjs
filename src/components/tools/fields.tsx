"use client";

import { useId, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CURRENCIES } from "@/lib/currencies";
import { toISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useToolCurrency, useToolLocale } from "@/components/tools/tool-state";
import { sanitizeNumberInput } from "@/lib/tools/format";

/**
 * Form controls for the `/tools/*` calculators.
 *
 * Built for thumbs first: 44px targets, 16px text (so iOS doesn't zoom on
 * focus), a native `<select>` so each phone shows its own picker, the app's
 * calendar for dates, and `inputMode="decimal"` so number fields open the
 * number pad.
 * Every control is a real labelled form element — no div-buttons.
 */

const control =
  "h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base tabular-nums outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30";

/** Label, control, then either the error or the hint underneath. */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label id={`${id}-label`} htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A number typed as text. `type="number"` is avoided on purpose: it rejects
 * grouping commas people paste (`1,00,000`), silently swallows invalid input,
 * and changes value when you scroll past it. Parse with `parseNumber`.
 */
export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  error,
  placeholder,
  className,
  integer,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  /** Shown inside the box, before the number — usually the currency symbol. */
  prefix?: ReactNode;
  /** Shown inside the box, after the number — `%`, `years`, `kWh`. */
  suffix?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  placeholder?: string;
  className?: string;
  /** Whole numbers only — opens the plain numeric keypad. */
  integer?: boolean;
}) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      <div
        className={cn(
          "flex h-11 items-center rounded-xl border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 dark:bg-input/30",
          error && "border-destructive ring-destructive/20",
        )}
      >
        {prefix != null && (
          <span className="shrink-0 pl-3 text-sm whitespace-nowrap text-muted-foreground select-none" aria-hidden>
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="text"
          inputMode={integer ? "numeric" : "decimal"}
          autoComplete="off"
          enterKeyHint="done"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(sanitizeNumberInput(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className="h-full w-full min-w-0 bg-transparent px-3 text-base tabular-nums outline-none placeholder:text-muted-foreground/70"
        />
        {suffix != null && (
          <span className="shrink-0 pr-3 text-sm whitespace-nowrap text-muted-foreground select-none" aria-hidden>
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}

/** A plain text input with the same shape as the number fields. */
export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  className,
  maxLength = 200,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: string | null;
  placeholder?: string;
  className?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={control}
      />
    </Field>
  );
}

/**
 * A date, picked from the app's calendar in a popover — the same calendar the
 * tracker uses, with a year picker for dates decades away and a "Today"
 * shortcut. `value` is `YYYY-MM-DD`, or `""` when empty. The trigger reads the
 * date back with its weekday, which is half the point in a date calculator.
 */
export function DateField({
  label,
  value,
  onChange,
  hint,
  error,
  min,
  max,
  className,
  placeholder = "Pick a date",
  open: openProp,
  onOpenChange,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: string | null;
  min?: string;
  max?: string;
  className?: string;
  placeholder?: string;
  /** Control the calendar from outside — e.g. a "Custom" choice that opens it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const id = useId();
  const locale = useToolLocale();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            // Name = the label *and* the date, so a screen reader hears
            // "Date of birth, Sat 14 Mar 1990" rather than just the label.
            aria-labelledby={`${id}-label ${id}-value`}
            aria-describedby={error || hint ? `${id}-msg` : undefined}
            className={cn(
              control,
              // A container, so the label can drop the weekday when the field is narrow.
              "@container flex cursor-pointer items-center gap-2 text-left",
              !value && "text-muted-foreground",
              error && "border-destructive",
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span id={`${id}-value`} className="sr-only">
              {value ? dateLabel(value, locale, true) : placeholder}
            </span>
            {value ? (
              <>
                <span className="min-w-0 truncate @min-[13rem]:hidden">{dateLabel(value, locale, false)}</span>
                <span className="hidden min-w-0 truncate @min-[13rem]:inline">{dateLabel(value, locale, true)}</span>
              </>
            ) : (
              <span className="min-w-0 truncate">{placeholder}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" closeOnOutsideClick className="w-auto p-3">
          <Calendar selected={value || null} min={min} max={max} onSelect={pick} className="w-72" />
          <div className="flex justify-between gap-2 border-t pt-2.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => pick(toISODate(new Date()))}>
              Today
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

/** "Mon, 28 Sep 2026" (or without the weekday) in the visitor's order. Parsed as UTC so no zone can shift the day. */
function dateLabel(iso: string, locale: string, weekday: boolean): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, {
    weekday: weekday ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type Option = { value: string; label: string };
/** A labelled run of options — a native `<optgroup>`. */
export type OptionGroup = { label: string; options: readonly Option[] };

/** Native `<select>` — the OS picker is the most usable one on a phone. */
export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: readonly (Option | OptionGroup)[];
  hint?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const option = (o: Option) => (
    <option key={o.value} value={o.value}>
      {o.label}
    </option>
  );
  return (
    <Field id={id} label={label} hint={hint} className={className}>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-msg` : undefined}
          className={cn(control, "appearance-none pr-9")}
        >
          {options.map((o) =>
            "options" in o ? (
              <optgroup key={o.label} label={o.label}>
                {o.options.map(option)}
              </optgroup>
            ) : (
              option(o)
            ),
          )}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        >
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Field>
  );
}

const CURRENCY_OPTIONS: Option[] = CURRENCIES.map((c) => ({
  value: c.code,
  label: `${c.code} — ${c.name}`,
}));

/**
 * The page's currency. Shared by every tool (and remembered), so picking INR on
 * one calculator carries over to the next.
 */
export function CurrencyField({ className, label = "Currency" }: { className?: string; label?: ReactNode }) {
  const [currency, setCurrency] = useToolCurrency();
  return (
    <SelectField
      label={label}
      value={currency}
      onChange={setCurrency}
      options={CURRENCY_OPTIONS}
      className={className}
    />
  );
}

/**
 * A row of mutually exclusive choices — the calculator's mode, compounding
 * frequency, add vs remove. Real radio inputs underneath, so arrow keys,
 * screen readers and form semantics all work without extra code.
 */
export function Segmented({
  label,
  value,
  onChange,
  options,
  className,
  hideLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  className?: string;
  /** Keep the label for screen readers only, when the options speak for themselves. */
  hideLabel?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className={cn("mb-1.5 text-sm font-medium", hideLabel && "sr-only")}>{label}</legend>
      <div className="flex flex-wrap gap-1 rounded-xl border bg-muted/50 p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className="relative flex min-h-9 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 py-1.5 text-center text-sm font-medium text-muted-foreground transition-colors select-none hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/40"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Optional inputs, collapsed by default — a native `<details>`, so it opens
 * with Enter/Space and needs no state. `summary` reads the current choices back
 * ("monthly compounding · 3% inflation") so a shared link's settings aren't
 * hidden behind a closed box.
 */
export function MoreOptions({
  summary,
  className,
  bodyClassName = "grid gap-4 sm:grid-cols-2",
  children,
}: {
  summary?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <details className={cn("group rounded-xl border", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          More options
          {summary && <span className="ml-2 font-normal text-muted-foreground">{summary}</span>}
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className={cn("border-t p-4", bodyClassName)}>{children}</div>
    </details>
  );
}

/**
 * A compact row of pill-shaped choices — quick picks that sit under the field
 * they fill in (payment terms under the due date). One line tall and never
 * wrapping inside a pill, where a `Segmented` bar with long labels grows to two
 * lines. Real radio inputs underneath, like `Segmented`.
 */
export function ChoiceChips({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2", className)}>
      <legend className="float-left mr-1 text-sm text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className="inline-flex h-8 cursor-pointer items-center rounded-full border bg-background px-2.5 text-sm whitespace-nowrap text-muted-foreground transition-colors select-none hover:bg-muted hover:text-foreground has-checked:border-foreground has-checked:bg-foreground has-checked:text-background has-focus-visible:ring-3 has-focus-visible:ring-ring/40 dark:bg-input/30 dark:has-checked:bg-foreground"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
