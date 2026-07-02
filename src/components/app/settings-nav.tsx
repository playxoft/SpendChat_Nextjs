"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Keyboard,
  Palette,
  Tags,
  TextCursorInput,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const SETTINGS_SECTIONS = [
  { href: "/settings/account", label: "Account", icon: UserRound },
  { href: "/settings/workspace", label: "Workspace", icon: Building2 },
  { href: "/settings/theme", label: "Theme", icon: Palette },
  { href: "/settings/input", label: "Input", icon: TextCursorInput },
  { href: "/settings/categories", label: "Categories", icon: Tags },
  { href: "/settings/shortcuts", label: "Shortcuts", icon: Keyboard },
] as const;

/**
 * Secondary settings navigation: a left rail on desktop, a horizontal
 * scrollable tab row on mobile.
 */
export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-1 overflow-x-auto pb-2 sm:w-44 sm:shrink-0 sm:flex-col sm:overflow-visible sm:pb-0"
    >
      {SETTINGS_SECTIONS.map((s) => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <s.icon className="size-4" />
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
