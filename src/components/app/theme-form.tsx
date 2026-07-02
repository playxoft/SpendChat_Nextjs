"use client";

import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { patchSettings } from "@/actions/settings";

type Theme = "light" | "dark" | "system";

/**
 * Theme picker: applies instantly via next-themes and persists to
 * user_settings so other devices pick it up. Mirrors the live theme so it
 * always agrees with the sidebar toggle, whichever one changed it.
 */
export function ThemeForm({ theme }: { theme: string }) {
  const { theme: liveTheme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<Theme>((theme as Theme) ?? "system");

  const [synced, setSynced] = useState<string | undefined>(undefined);
  if (liveTheme && liveTheme !== synced) {
    setSynced(liveTheme);
    setValue(liveTheme as Theme);
  }

  function handleChange(v: string) {
    const next = v as Theme;
    setValue(next);
    setTheme(next);
    startTransition(async () => {
      const res = await patchSettings({ theme: next });
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <div className="max-w-xs space-y-1.5">
      <Label>Theme</Label>
      <Select value={value} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="light">Light</SelectItem>
          <SelectItem value="dark">Dark</SelectItem>
          <SelectItem value="system">System</SelectItem>
        </SelectContent>
      </Select>
      <p className="pt-1 text-sm text-muted-foreground">
        Saved to your account, so it follows you across devices.
      </p>
    </div>
  );
}
