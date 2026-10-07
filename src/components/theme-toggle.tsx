"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * One button, two themes: a click flips between light and dark. "System" is
 * still a choice in Settings → Appearance; here it would only be a third state
 * to read before clicking. Starting from "system", the first click picks the
 * opposite of what the screen shows now (`resolvedTheme`).
 *
 * Both icons render and CSS shows the right one (`dark:` variants), so the
 * server — which can't know the theme — paints the same markup as the client.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Switch between light and dark theme"
          onClick={() => setTheme(next)}
        >
          <Sun className="size-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="dark:hidden">Dark theme</span>
        <span className="hidden dark:inline">Light theme</span>
      </TooltipContent>
    </Tooltip>
  );
}
