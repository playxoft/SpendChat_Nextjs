"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { scopeLabel } from "@/lib/profile-scope";
import { useProfileScope } from "@/hooks/use-profile-scope";
import { useLoadingOverlay } from "./loading-overlay";
import type { Profile } from "@/db/schema";

type P = Pick<Profile, "id" | "name" | "icon" | "spaceId">;

/**
 * The tracker header's profile display. On mobile it's a dropdown to switch
 * profiles (the sidebar is hidden there); on desktop it's static, since the
 * sidebar already handles switching.
 *
 * A sidebar multi-selection (several profiles, or a space) reads straight from
 * the URL: the page resolves it the same way, and passes no single
 * `filterProfileId` for it. It shows the selection's names and how many
 * profiles it covers; picking a profile from the menu narrows back to one.
 */
export function ProfileSwitcher({
  profiles,
  filterProfileId,
  allProfiles,
}: {
  profiles: P[];
  filterProfileId?: string;
  allProfiles: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { runQuiet } = useLoadingOverlay();

  const { resolved } = useProfileScope(profiles);
  const selection = resolved.multi ? (resolved.profileIds ?? []) : null;
  const checked = new Set(selection ?? (filterProfileId ? [filterProfileId] : []));
  const active = profiles.find((p) => p.id === filterProfileId) ?? null;
  const icon = selection ? "🗂️" : (active?.icon ?? (filterProfileId ? "👤" : "🗂️"));
  const name = selection ? scopeLabel(resolved, profiles, 2) : (active?.name ?? "All profiles");
  const subtitle = selection
    ? `${selection.length} profile${selection.length === 1 ? "" : "s"} selected`
    : allProfiles
      ? `${profiles.length} profile${profiles.length === 1 ? "" : "s"}`
      : "Transactions this month";

  function go(id: string | null) {
    const params = new URLSearchParams(sp.toString());
    // "All profiles" is explicit now (no param defaults to the first profile).
    params.set("profile", id ?? "all");
    params.delete("page");
    const qs = params.toString();
    // Quiet transition: gate the composer until the new profile loads.
    runQuiet(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  const iconEl = (
    <div
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg"
    >
      {icon}
    </div>
  );

  return (
    <>
      {/* Mobile: tap the profile to switch. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-colors hover:bg-accent/50 md:hidden"
          >
            {iconEl}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 font-medium">
                <span className="truncate">{name}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </p>
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Switch profile
          </DropdownMenuLabel>
          {profiles.map((p) => (
            <DropdownMenuItem
              key={p.id}
              className="cursor-pointer gap-2"
              onClick={() => go(p.id)}
            >
              <span aria-hidden>{p.icon ?? "👤"}</span>
              <span className="flex-1 truncate">{p.name}</span>
              {checked.has(p.id) && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onClick={() => go(null)}
          >
            <LayoutGrid className="size-4" />
            <span className="flex-1">All profiles</span>
            {!filterProfileId && !selection && <Check className="size-4" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Desktop: static (the sidebar switches profiles). */}
      <div className={cn("hidden min-w-0 flex-1 items-center gap-3 md:flex")}>
        {iconEl}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </>
  );
}
