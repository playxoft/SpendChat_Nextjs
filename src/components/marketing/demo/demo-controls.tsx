"use client";

import { CalendarIcon, Minus, Plus } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ControlHint } from "@/components/app/control-hint";
import {
  DEMO_PROFILES,
  DEMO_PROFILE_ICON,
  type DemoProfile,
  type DemoTxnType,
} from "./demo-data";
import { comboFor } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * The expense/income capsule from the composer's control strip.
 *
 * Copied class-for-class from `transaction-composer.tsx`'s `typeToggle`, down
 * to the `h-8` control height the whole strip shares and the rose/emerald icon
 * tints. The real one is defined inline inside a 1,100-line component that also
 * owns attachments, profile selection, date handling and the `#`-tag picker —
 * lifting it out would mean refactoring the app's busiest surface to serve a
 * marketing page, which is the wrong trade. The shortcut chip comes from
 * `comboFor()`, so at least the key it advertises can never go stale.
 *
 * `dense` mirrors the app's compact density: bare icons, tighter padding, and
 * the label plus shortcut moved into a hover tooltip. The demos run compact
 * throughout, because that's the density that fits a control strip on one line.
 */
export function DemoTypeToggle({
  type,
  onChange,
  dense = false,
  className,
}: {
  type: DemoTxnType;
  onChange: (t: DemoTxnType) => void;
  dense?: boolean;
  className?: string;
}) {
  const combo = comboFor("tracker.toggle-type");

  return (
    <div
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-full border bg-muted/50 p-0.5 text-sm",
        className,
      )}
    >
      {(["expense", "income"] as const).map((t) => {
        const active = type === t;
        // "+" reads as money in, "−" as money out — clearer than arrows.
        const Icon = t === "income" ? Plus : Minus;
        const color =
          t === "income"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400";
        return (
          <ControlHint
            key={t}
            label={t === "income" ? "Income · money in" : "Expense · money out"}
            combo={combo}
            enabled={dense}
          >
            <button
              type="button"
              onClick={() => onChange(t)}
              aria-pressed={active}
              aria-label={t}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full py-1 capitalize transition-colors",
                dense ? "px-2" : "px-2.5 sm:px-3",
                active
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", color)} />
              {!dense && <span className="hidden sm:inline">{t}</span>}
              {active && !dense && (
                <Kbd combo={combo} className="hidden opacity-70 sm:inline-flex" />
              )}
            </button>
          </ControlHint>
        );
      })}
    </div>
  );
}

/** What a transaction-type *filter* can be set to — unlike the composer's
 * toggle, "no filter" is a first-class option rather than an absence. */
export type DemoTypeFilterValue = "all" | DemoTxnType;

const TYPE_FILTER_LABELS: Record<DemoTypeFilterValue, string> = {
  all: "All",
  income: "+ Income",
  expense: "− Expense",
};

/**
 * The type filter for the transactions view — a dropdown, not the composer's
 * segmented toggle.
 *
 * The composer is *choosing* what a new transaction is, so expense-or-income is
 * the whole question and a two-way switch says it best. A filter also has to
 * express "don't filter", and once there are three options a select says which
 * one is active in words rather than by which segment happens to look raised.
 * The signs are kept in the labels because they're how the amounts read in the
 * table underneath.
 */
export function DemoTypeFilter({
  value,
  onChange,
  className,
}: {
  value: DemoTypeFilterValue;
  onChange: (v: DemoTypeFilterValue) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DemoTypeFilterValue)}>
      <SelectTrigger
        className={cn("h-8 w-auto min-w-28 gap-1", className)}
        aria-label="Transaction type"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {(Object.keys(TYPE_FILTER_LABELS) as DemoTypeFilterValue[]).map((id) => (
          <SelectItem key={id} value={id}>
            {TYPE_FILTER_LABELS[id]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The profile control, matching the composer's `profileSelect`: the emoji is
 * the profile's identity, with the name alongside it once there's room. Dense
 * never spends the width on the name — the emoji carries it in the switcher too.
 */
export function DemoProfilePicker({
  profile,
  onChange,
  dense = false,
  className,
}: {
  profile: DemoProfile;
  onChange: (p: DemoProfile) => void;
  dense?: boolean;
  className?: string;
}) {
  return (
    <Select value={profile} onValueChange={(v) => onChange(v as DemoProfile)}>
      <SelectTrigger
        className={cn("h-8 w-auto shrink-0 gap-1", className)}
        aria-label="Profile"
      >
        <span aria-hidden className="text-base leading-none">
          {DEMO_PROFILE_ICON[profile]}
        </span>
        <span className={cn("max-w-24 truncate", dense ? "hidden" : "hidden md:inline")}>
          {profile}
        </span>
      </SelectTrigger>
      <SelectContent align="end" position="popper">
        {DEMO_PROFILES.map((p) => (
          <SelectItem key={p} value={p}>
            {DEMO_PROFILE_ICON[p]} {p}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The compact composer's grouped control widget — the recessed pill that holds
 * the type, date, profile and category controls as one set.
 *
 * Same shape as the app: `h-9` to clear the `h-8` controls inside it plus the
 * border and `py-0.5`, matching the `EntryModeToggle` beside it so the two read
 * as one row rather than two stray controls.
 */
export function DemoControlGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ml-auto flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-full border bg-muted/40 px-0.5 py-0.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A read-only date chip styled as the app's compact `DatePicker` trigger.
 *
 * Inert on purpose: a real picker drags `react-day-picker` into the marketing
 * bundle, and no demo here is about choosing a date.
 */
export function DemoDateChip({
  label = "Today",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm font-normal text-muted-foreground",
        className,
      )}
    >
      <CalendarIcon className="size-4 shrink-0 opacity-60" />
      {label}
    </span>
  );
}
