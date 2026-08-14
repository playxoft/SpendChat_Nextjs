"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { updateVoiceLanguages } from "@/actions/settings";
import {
  MAX_VOICE_LANGUAGES,
  VOICE_LANGUAGES,
  normalizeVoiceLanguages,
} from "@/lib/voice-languages";

/**
 * Pick the languages the mic should expect. A *multi*-select rather than one
 * language because the transcription model is told about them in the prompt, so
 * naming several is a real instruction it acts on — which is what makes a
 * code-mixed sentence ("groceries-க்கு 500 rupees") come out right instead of
 * being forced into a single script. See `lib/voice-languages.ts`.
 *
 * Presented as a searchable dropdown rather than a wall of chips: there are 27
 * languages, and on a phone the flat list ran to most of a screen before you
 * could reach Save. The trigger shows what's picked, so the current state is
 * still readable without opening anything.
 */
export function VoiceLanguagesForm({ languages }: { languages: string[] }) {
  const initial = normalizeVoiceLanguages(languages);
  const [selected, setSelected] = useState<string[]>(initial);
  const [baseline, setBaseline] = useState<string[]>(initial);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Re-baseline (and drop unsaved edits) whenever the saved value changes.
  const initialKey = initial.join(",");
  if (baseline.join(",") !== initialKey) {
    setBaseline(initial);
    setSelected(initial);
  }

  const dirty = selected.join(",") !== baseline.join(",");
  const atCap = selected.length >= MAX_VOICE_LANGUAGES;

  // Match on either name so "Tamil" and "தமிழ்" both find the same row — the
  // native name is what a speaker is most likely to type.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return VOICE_LANGUAGES;
    return VOICE_LANGUAGES.filter(
      (l) =>
        l.englishName.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase() === q,
    );
  }, [query]);

  const selectedLangs = useMemo(
    () =>
      selected
        .map((c) => VOICE_LANGUAGES.find((l) => l.code === c))
        .filter((l): l is (typeof VOICE_LANGUAGES)[number] => Boolean(l)),
    [selected],
  );

  function toggle(code: string) {
    setSelected((prev) => {
      if (prev.includes(code)) {
        // Never allow zero — an empty list would silently fall back to English
        // on save, which looks like the click did nothing.
        return prev.length === 1 ? prev : prev.filter((c) => c !== code);
      }
      return prev.length >= MAX_VOICE_LANGUAGES ? prev : [...prev, code];
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateVoiceLanguages(selected);
      if (res.ok) toast.success("Voice languages saved");
      else toast.error(res.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Languages for voice entry"
            // `h-auto` + wrapping: with several languages picked the chips need
            // more than one line, and a fixed-height trigger would clip them.
            className="h-auto min-h-9 w-full justify-between gap-2 py-1.5 font-normal"
          >
            <span className="flex flex-1 flex-wrap items-center gap-1 text-left">
              {selectedLangs.map((l) => (
                <span
                  key={l.code}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs"
                >
                  <span className="truncate">{l.englishName}</span>
                </span>
              ))}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          // Off by default app-wide, so it has to be opted into here — without
          // it the only way out of the list is Escape or the trigger.
          closeOnOutsideClick
          // Matches the trigger's width so the list never looks detached, and
          // stays inside a phone screen.
          className="w-[var(--radix-popover-trigger-width)] p-0"
          onOpenAutoFocus={(e) => {
            // Focus the search box, not the first row — typing is the point.
            e.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <div className="border-b p-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search languages…"
                aria-label="Search languages"
                className="h-8 pr-8 pl-8"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <div role="listbox" aria-multiselectable className="max-h-64 overflow-y-auto p-1">
            {results.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No language matches “{query}”.
              </p>
            ) : (
              results.map((lang) => {
                const active = selected.includes(lang.code);
                // At the cap, unpicked rows are disabled rather than hidden —
                // the list stays stable and the reason is stated below.
                const blocked = !active && atCap;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={blocked}
                    onClick={() => toggle(lang.code)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      blocked
                        ? "cursor-not-allowed opacity-40"
                        : "hover:bg-muted focus-visible:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40",
                      )}
                    >
                      {active && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{lang.englishName}</span>
                    {lang.nativeName !== lang.englishName && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {lang.nativeName}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t px-2 py-1.5 text-xs text-muted-foreground">
            {selected.length} of {MAX_VOICE_LANGUAGES} selected
          </div>
        </PopoverContent>
      </Popover>

      <p className="text-xs text-muted-foreground">
        {atCap
          ? `That's the maximum of ${MAX_VOICE_LANGUAGES}. Deselect one to choose another — a longer list stops narrowing anything down and starts costing accuracy.`
          : `Pick up to ${MAX_VOICE_LANGUAGES}. Choosing only the languages you actually speak works better than adding every option.`}
      </p>

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
