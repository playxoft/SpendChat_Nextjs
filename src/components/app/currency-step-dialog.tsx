"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check, ChevronsUpDown, Monitor, Moon, Search, Sun } from "lucide-react";
import { confirmCurrency, patchSettings } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { countryOptions, currencyForCountry, localeForCountry, type CountryOption } from "@/lib/geo";
import { formatMoney, toMinorUnits } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CurrencyCombobox } from "./currency-combobox";
import { useOnboardingFlow } from "./onboarding-flow";

/** 🇮🇳 from "IN" — regional-indicator letters (Windows shows the letters instead). */
function flagOf(code: string): string {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * A new account's one required step, straight after the terms and before
 * "About you" and the product tour: confirm the country and currency — both
 * already picked from where they signed up, so it's usually one tap. It sets
 * their own workspace's currency and number format, and sends the welcome
 * email in that currency (`confirmOnboardingCurrency`). It can't be dismissed:
 * every amount in the app depends on it.
 *
 * It also offers the theme, so the rest of the welcome is in the look they
 * want. That one applies and saves as soon as it's picked (like Settings →
 * Appearance), whether or not they go on.
 *
 * It opens on its turn in the welcome (`OnboardingFlowProvider`) — mounted
 * behind the terms gate, so it's there the instant that's answered — and
 * Continue hands straight over to "About you" while the save (and the welcome
 * email) goes on in the background. A failed save brings it back with the
 * error.
 */
export function CurrencyStepDialog({
  firstName,
  initialCountry,
  initialCurrency,
  currentLocale,
}: {
  firstName: string | null;
  initialCountry: string | null;
  initialCurrency: string;
  currentLocale: string;
}) {
  const { turn, answer, reopen } = useOnboardingFlow();
  const countries = React.useMemo(() => countryOptions(), []);
  const [country, setCountry] = React.useState<string | null>(initialCountry);
  const [currency, setCurrency] = React.useState(initialCurrency);
  const [error, setError] = React.useState<string | null>(null);
  const [, startSave] = React.useTransition();

  function pickCountry(code: string) {
    setCountry(code);
    const next = currencyForCountry(code);
    if (next) setCurrency(next);
  }

  const locale = country ? localeForCountry(country, currentLocale) : currentLocale;
  let example = "";
  try {
    example = formatMoney(toMinorUnits(123456.5, currency), currency, locale);
  } catch {
    example = "";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!country) {
      setError("Pick where you're based.");
      return;
    }
    setError(null);
    answer("currency");
    // The action refreshes the layout when it lands (`revalidatePath`), which
    // redraws every amount in the chosen currency under the next popup.
    startSave(async () => {
      const res = await confirmCurrency({ country, currency }).catch(() => null);
      if (!res?.ok) {
        setError(res?.error ?? "Couldn't save that. Check your connection and try again.");
        reopen("currency");
      }
    });
  }

  return (
    <Dialog open={turn === "currency"} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <form onSubmit={submit} className="space-y-6">
          <DialogHeader className="gap-2">
            <DialogTitle className="text-lg">
              {firstName ? `Welcome, ${firstName}! 👋` : "Welcome to SpendChat! 👋"}
            </DialogTitle>
            <DialogDescription>
              A couple of quick things before you start. We&apos;ve filled in your country and
              currency from your location.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <ThemePicker />
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-country">Where are you based?</Label>
              <CountryCombobox
                id="onboarding-country"
                countries={countries}
                value={country}
                onValueChange={pickCountry}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-currency">Your currency</Label>
              <CurrencyCombobox
                id="onboarding-currency"
                value={currency}
                onValueChange={setCurrency}
              />
            </div>
            <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
              {example ? (
                <>
                  Amounts will look like{" "}
                  <span className="font-medium text-foreground tabular-nums">{example}</span>.{" "}
                </>
              ) : null}
              You can change this anytime in Settings.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={!country} className="min-w-28">
              Continue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const subscribeNothing = () => () => {};

/**
 * Light, dark or the device's setting: three buttons, applied at once through
 * next-themes and saved to the account (`user_settings.theme`) so it follows
 * them to other devices. A failed save keeps the look on this device only, so
 * it's not worth stopping the welcome for.
 */
function ThemePicker() {
  const { theme, setTheme } = useTheme();
  // next-themes knows the theme only in the browser; until then nothing is
  // shown as picked, so the server's HTML matches the first client render.
  const mounted = React.useSyncExternalStore(subscribeNothing, () => true, () => false);
  const current = mounted ? (theme ?? "system") : null;

  function pick(value: (typeof THEMES)[number]["value"]) {
    setTheme(value);
    void patchSettings({ theme: value }).catch(() => {});
  }

  return (
    <div className="space-y-1.5">
      <Label id="onboarding-theme">How should SpendChat look?</Label>
      <div role="radiogroup" aria-labelledby="onboarding-theme" className="grid grid-cols-3 gap-2">
        {THEMES.map(({ value, label, icon: Icon }) => {
          const selected = current === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => pick(value)}
              className={cn(
                "flex h-9 items-center justify-center gap-1.5 rounded-md border text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected
                  ? "border-foreground/60 bg-muted font-medium text-foreground"
                  : "border-input bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Searchable country picker, the same shape as `CurrencyCombobox`. */
function CountryCombobox({
  id,
  countries,
  value,
  onValueChange,
  disabled,
}: {
  id?: string;
  countries: CountryOption[];
  value: string | null;
  onValueChange: (code: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selected = countries.find((c) => c.code === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? countries.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase() === q ||
          c.currency.toLowerCase() === q,
      )
    : countries;

  // Reset the search each time the popover opens.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setHighlighted(Math.max(0, countries.findIndex((c) => c.code === value)));
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
            {selected ? `${flagOf(selected.code)}  ${selected.name}` : "Select country"}
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
            placeholder="Search country…"
            aria-label="Search country"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            autoFocus
          />
        </div>
        <div ref={listRef} className="max-h-64 overflow-y-auto p-1" role="listbox">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No country found</p>
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
              <span aria-hidden className="shrink-0">
                {flagOf(c.code)}
              </span>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{c.currency}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
