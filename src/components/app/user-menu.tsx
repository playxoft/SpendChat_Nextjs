"use client";

import Link from "next/link";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { useUser } from "@stackframe/stack";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function UserMenu({
  email,
  compact = false,
}: {
  email: string | null;
  compact?: boolean;
}) {
  const user = useUser();
  const initial = (email ?? "?").charAt(0).toUpperCase();

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
          <Link href="/settings" className={cn("cursor-pointer")}>
            <SettingsIcon className="size-4" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => user?.signOut()}
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
