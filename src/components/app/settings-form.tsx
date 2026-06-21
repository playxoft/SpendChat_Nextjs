"use client";

import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateSettings } from "@/actions/settings";
import { CURRENCIES } from "@/lib/currencies";

const LOCALES = [
  { value: "en-US", label: "English (US) · 1,234.56" },
  { value: "en-GB", label: "English (UK) · 1,234.56" },
  { value: "en-IN", label: "English (India) · 1,23,456" },
  { value: "de-DE", label: "German · 1.234,56" },
  { value: "fr-FR", label: "French · 1 234,56" },
  { value: "es-ES", label: "Spanish · 1.234,56" },
  { value: "pt-BR", label: "Portuguese (BR) · 1.234,56" },
  { value: "ja-JP", label: "Japanese · 1,234" },
];

type Theme = "light" | "dark" | "system";

export function SettingsForm({
  currency,
  locale,
  theme,
}: {
  currency: string;
  locale: string;
  theme: string;
}) {
  const { theme: liveTheme, setTheme } = useTheme();
  const [cur, setCur] = useState(currency);
  const [loc, setLoc] = useState(locale);
  const [th, setTh] = useState<Theme>((theme as Theme) ?? "system");
  const [pending, startTransition] = useTransition();

  // Re-baseline (and reset edits) whenever the saved settings change.
  const [baseline, setBaseline] = useState({ currency, locale, theme });
  if (
    baseline.currency !== currency ||
    baseline.locale !== locale ||
    baseline.theme !== theme
  ) {
    setBaseline({ currency, locale, theme });
    setCur(currency);
    setLoc(locale);
    setTh((theme as Theme) ?? "system");
  }

  // Mirror the live theme (next-themes) so this selector always agrees with the
  // sidebar toggle and the actually-applied theme, whichever one changed it.
  const [syncedTheme, setSyncedTheme] = useState<string | undefined>(undefined);
  if (liveTheme && liveTheme !== syncedTheme) {
    setSyncedTheme(liveTheme);
    setTh(liveTheme as Theme);
  }

  const dirty =
    cur !== baseline.currency || loc !== baseline.locale || th !== baseline.theme;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateSettings({ currency: cur, locale: loc, theme: th });
      if (res.ok) toast.success("Settings saved");
      else toast.error(res.error);
    });
  }

  function handleCancel() {
    setCur(baseline.currency);
    setLoc(baseline.locale);
    const baseTheme = (baseline.theme as Theme) ?? "system";
    setTh(baseTheme);
    setTheme(baseTheme); // undo the live theme preview
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Select value={cur} onValueChange={setCur}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code} — {c.name} ({c.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Number format</Label>
          <Select value={loc} onValueChange={setLoc}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Theme</Label>
          <Select
            value={th}
            onValueChange={(v) => {
              const next = v as Theme;
              setTh(next);
              setTheme(next);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Currency is applied across the whole app. Existing amounts keep their stored
        value; only how they&apos;re displayed changes.
      </p>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={handleCancel} disabled={!dirty || pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={!dirty || pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
