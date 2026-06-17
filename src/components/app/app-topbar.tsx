"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "./user-menu";

export function AppTopbar({ email }: { email: string | null }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-sm md:hidden print:hidden">
      <Link href="/app" aria-label="Tracker">
        <Logo />
      </Link>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <UserMenu email={email} compact />
      </div>
    </header>
  );
}
