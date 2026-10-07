"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { LogOut, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "firebase/auth";
import { clearSession, getFirebaseAuth } from "@/lib/firebase";
import { count } from "@/lib/plan-copy";
import { formatPlanStorage } from "@/lib/plan-limit";
import { PLAN_LIMITS, PLAN_NAMES, type PersonalPlan } from "@/lib/plans";
import { comboFor } from "@/lib/shortcuts";
import { hrefWithProfile } from "./nav-items";
import { PlanBadge } from "./plan-badge";
import { usePlan } from "./upgrade-dialog";

/** "50 AI actions a month · 1 GB" — what this workspace's plan gives, on one line. */
function planLine(plan: PersonalPlan): string {
  const limits = PLAN_LIMITS[plan];
  return `${count(limits.aiActionsPerMonth)} AI actions a month · ${formatPlanStorage(limits.storageBytes)}`;
}

/**
 * The account menu, top right on every app page: the person's picture (or
 * initial), and under it who's signed in, the current workspace's plan with a
 * way up, then Settings, Trash and Sign out. The plan shown is the
 * *workspace's* — plans are per workspace — read from the layout's
 * `PlanProvider`.
 */
export function UserMenu({
  email,
  name,
  image,
}: {
  email: string | null;
  name: string | null;
  image: string | null;
}) {
  const router = useRouter();
  const profile = useSearchParams().get("profile");
  const { plan } = usePlan();
  const [pending, startTransition] = useTransition();
  const displayName = name?.trim() || null;
  const initial = (displayName ?? email ?? "?").charAt(0).toUpperCase();

  function handleSignOut() {
    startTransition(async () => {
      await signOut(getFirebaseAuth());
      await clearSession();
      router.push("/sign-in");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
          <Avatar className="size-8">
            {image ? <AvatarImage src={image} alt="" /> : null}
            <AvatarFallback className="text-xs font-medium">{initial}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-72 p-1.5">
        <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
          <Avatar className="size-9">
            {image ? <AvatarImage src={image} alt="" /> : null}
            <AvatarFallback className="text-sm font-medium">{initial}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            {displayName ? (
              <span className="block truncate text-sm font-medium text-foreground">{displayName}</span>
            ) : null}
            <span className="block truncate text-sm text-muted-foreground">
              {email ?? "Signed in"}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="space-y-2 px-2 py-2">
          <div className="flex items-center gap-2">
            <PlanBadge plan={plan} className="h-5 px-2 text-xs" />
            <span className="truncate text-xs text-muted-foreground">{planLine(plan)}</span>
          </div>
          {/* Free and Plus have somewhere to go; Pro just shows its name. */}
          {plan !== "pro" ? (
            <Button asChild size="sm" className="w-full">
              <Link href={hrefWithProfile("/app/upgrade", profile)}>
                {plan === "free" ? "Upgrade" : `Upgrade to ${PLAN_NAMES.pro}`}
              </Link>
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="px-2 py-2">
          <Link href={hrefWithProfile("/app/settings", profile)} className="cursor-pointer">
            <SettingsIcon className="size-4" /> Settings
            <Kbd combo={comboFor("nav.settings")} className="ml-auto opacity-70" />
          </Link>
        </DropdownMenuItem>
        {/* The trash sits beside Settings: a place people go to rarely — not
            worth a slot in the main nav, but always one click away. */}
        <DropdownMenuItem asChild className="px-2 py-2">
          <Link href={hrefWithProfile("/app/trash", profile)} className="cursor-pointer">
            <Trash2 className="size-4" /> Trash
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer px-2 py-2"
          onClick={handleSignOut}
          disabled={pending}
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
        {/*
          The source link used to sit here. The AGPL's network clause (section
          13) asks a hosted copy to offer its users the source, and this menu is
          on every screen — but Settings → About is two taps away from the
          Settings item above, is in the same always-reachable place, and can
          say what the licence actually means instead of being a bare link in a
          menu. The offer moved there; it did not go away.
        */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
