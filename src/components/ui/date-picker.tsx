"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateLabel, formatDateShort } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Button + popover calendar. A reliable replacement for `<input type="date">`,
 * which rendered inconsistently and could fail to show the picked date.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  locale,
  id,
  className,
  placeholder = "Pick a date",
  compact = false,
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  locale?: string;
  id?: string;
  className?: string;
  placeholder?: string;
  /** On mobile show a year-less label (e.g. "6 Jul"); full date on desktop. */
  compact?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start gap-2 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-4 opacity-60" />
          {!value ? (
            placeholder
          ) : compact ? (
            <>
              <span className="sm:hidden">{formatDateShort(value, locale)}</span>
              <span className="hidden sm:inline">{formatDateLabel(value, locale)}</span>
            </>
          ) : (
            formatDateLabel(value, locale)
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" closeOnOutsideClick className="w-auto">
        <Calendar
          selected={value || null}
          min={min}
          max={max}
          onSelect={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
