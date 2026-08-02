"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
 */
export function VoiceLanguagesForm({ languages }: { languages: string[] }) {
  const initial = normalizeVoiceLanguages(languages);
  const [selected, setSelected] = useState<string[]>(initial);
  const [baseline, setBaseline] = useState<string[]>(initial);
  const [pending, startTransition] = useTransition();

  // Re-baseline (and drop unsaved edits) whenever the saved value changes.
  const initialKey = initial.join(",");
  if (baseline.join(",") !== initialKey) {
    setBaseline(initial);
    setSelected(initial);
  }

  const dirty = selected.join(",") !== baseline.join(",");
  const atCap = selected.length >= MAX_VOICE_LANGUAGES;

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
      <div
        role="group"
        aria-label="Languages for voice entry"
        className="flex flex-wrap gap-2"
      >
        {VOICE_LANGUAGES.map((lang) => {
          const active = selected.includes(lang.code);
          // At the cap, unpicked options are disabled rather than hidden — the
          // list stays stable, and the reason is stated below.
          const blocked = !active && atCap;
          return (
            <button
              key={lang.code}
              type="button"
              role="checkbox"
              aria-checked={active}
              disabled={blocked}
              onClick={() => toggle(lang.code)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "text-muted-foreground hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground",
                blocked && "cursor-not-allowed opacity-40 hover:border-border hover:bg-transparent",
              )}
            >
              {active && <Check className="size-3.5 shrink-0" strokeWidth={3} />}
              <span>{lang.englishName}</span>
              {lang.nativeName !== lang.englishName && (
                <span className="text-xs opacity-70">{lang.nativeName}</span>
              )}
            </button>
          );
        })}
      </div>

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
