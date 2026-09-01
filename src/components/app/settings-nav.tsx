"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Building2,
  Keyboard,
  Mic,
  Palette,
  Tags,
  TextCursorInput,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hrefWithProfile } from "./nav-items";

export const SETTINGS_SECTIONS = [
  { href: "/app/settings/account", label: "Account", icon: UserRound },
  { href: "/app/settings/workspace", label: "Workspace", icon: Building2 },
  { href: "/app/settings/theme", label: "Theme", icon: Palette },
  { href: "/app/settings/input", label: "Input", icon: TextCursorInput },
  { href: "/app/settings/voice", label: "Voice", icon: Mic },
  { href: "/app/settings/categories", label: "Categories", icon: Tags },
  { href: "/app/settings/shortcuts", label: "Shortcuts", icon: Keyboard },
] as const;

/**
 * Secondary settings navigation: a left rail on desktop, a horizontal
 * scrollable tab row on mobile.
 */
export function SettingsNav() {
  const pathname = usePathname();
  const profile = useSearchParams().get("profile");

  return (
    <nav
      aria-label="Settings sections"
      // `scrollbar-slim`, not `no-scrollbar`: hiding the bar is right for the
      // category strip because every chip is also one tap away in the picker
      // beside it. There is no second way to reach a settings section — about
      // three of the seven fit on a narrow phone — so the bar is the only thing
      // saying the rest are there.
      className="scrollbar-slim flex gap-1 overflow-x-auto pb-2 lg:w-44 lg:shrink-0 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      {SETTINGS_SECTIONS.map((s) => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.href}
            href={hrefWithProfile(s.href, profile)}
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
