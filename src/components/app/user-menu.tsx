"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { GithubIcon } from "@/components/icons/github";
import { Button } from "@/components/ui/button";
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
import { siteConfig } from "@/lib/site";
import { hrefWithProfile } from "./nav-items";

export function UserMenu({
  email,
  compact = false,
}: {
  email: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const profile = useSearchParams().get("profile");
  const [pending, startTransition] = useTransition();
  const initial = (email ?? "?").charAt(0).toUpperCase();

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
        {compact ? (
          <Button variant="ghost" size="icon" aria-label="Account menu">
            <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {initial}
            </span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="h-9 min-w-0 flex-1 justify-start gap-2 px-2"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {initial}
            </span>
            <span className="truncate text-sm">{email ?? "Account"}</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email ?? "Signed in"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={hrefWithProfile("/app/settings", profile)} className="cursor-pointer">
            <SettingsIcon className="size-4" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={handleSignOut}
          disabled={pending}
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/*
          The AGPL's network clause (section 13) asks a hosted copy to offer its
          users the source, and this menu is the one piece of furniture every
          signed-in user has on every screen — it renders in the desktop sidebar
          and, `compact`, in the mobile topbar. The marketing footer carries the
          same link but never appears inside /app, so on its own it reaches
          nobody actually using the program. Keeping the offer here is also what
          makes the promise on the landing page true for anyone who forks this
          and deploys it.
        */}
        <DropdownMenuItem asChild>
          <a
            href={siteConfig.links.github}
            target="_blank"
            rel="noreferrer"
            className="cursor-pointer"
          >
            <GithubIcon className="size-4" />
            <span className="truncate">Source code · {siteConfig.license}</span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
