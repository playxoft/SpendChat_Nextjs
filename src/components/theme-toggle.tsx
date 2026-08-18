"use client";

import { useSyncExternalStore } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme">
          <Sun className="size-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className="cursor-pointer justify-between gap-6"
          >
            {opt.label}
            <Check
              className={cn("size-4", theme === opt.value ? "opacity-100" : "opacity-0")}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Whether we're past hydration. The server snapshot is `false` and the client
// one `true`, which is exactly the "don't paint a selection until the browser
// has read localStorage" signal — and unlike a `useEffect` flag it costs no
// extra render pass (same shape as `useIsMac`).
const noopSubscribe = () => () => {};

const CAPSULE_OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

/**
 * The sidebar's theme control: all three choices as one segmented capsule, so
 * switching is a single click on the icon you want instead of opening a menu
 * and reading a list. The dropdown `ThemeToggle` above stays for the places
 * with no room for three targets (the topbar, the marketing nav).
 */
export function ThemeCapsule({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // `theme` is only known in the browser (it's read from localStorage), so the
  // server renders no selection at all rather than guessing one and hydrating
  // into a mismatch.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border bg-muted/50 p-0.5",
        className,
      )}
    >
      {CAPSULE_OPTIONS.map(({ value, label, Icon }) => {
        const active = hydrated && theme === value;
        return (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={label}
                onClick={() => setTheme(value)}
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
