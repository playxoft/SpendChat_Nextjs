"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CURRENCIES } from "@/lib/currencies";

/**
 * Searchable currency picker (the plain select got unwieldy at 59 currencies).
 * Popover + filtered list built from existing primitives — no cmdk dependency.
 */
export function CurrencyCombobox({
  value,
  onValueChange,
  id,
  disabled,
}: {
  value: string;
  onValueChange: (code: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selected = CURRENCIES.find((c) => c.code === value);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? CURRENCIES.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q),
      )
    : CURRENCIES;

  // Reset the search each time the popover opens.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setHighlighted(Math.max(0, CURRENCIES.findIndex((c) => c.code === value)));
    }
  }

  function choose(code: string) {
    onValueChange(code);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[highlighted];
      if (pick) choose(pick.code);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selected ? `${selected.code} — ${selected.name} (${selected.symbol})` : "Select currency"}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlighted(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search currency…"
            aria-label="Search currency"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            autoFocus
          />
        </div>
        <div ref={listRef} className="max-h-64 overflow-y-auto p-1" role="listbox">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No currency found
            </p>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.code}
              type="button"
              role="option"
              aria-selected={c.code === value}
              data-index={i}
              onClick={() => choose(c.code)}
              onMouseEnter={() => setHighlighted(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                i === highlighted && "bg-accent text-accent-foreground",
              )}
            >
              <Check
                className={cn("size-4 shrink-0", c.code === value ? "opacity-100" : "opacity-0")}
              />
              <span className="w-12 shrink-0 font-medium tabular-nums">{c.code}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.name}</span>
              <span className="shrink-0 text-muted-foreground">{c.symbol}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
