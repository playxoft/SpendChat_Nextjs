"use client";

import { useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ProfileList } from "./profile-list";
import { UserMenu } from "./user-menu";
import type { Profile } from "@/db/schema";

export function AppTopbar({
  email,
  profiles,
}: {
  email: string | null;
  profiles: Pick<Profile, "id" | "name" | "icon">[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-sm md:hidden print:hidden">
      <div className="flex items-center gap-1">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Profiles">
              <Users className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Profiles</SheetTitle>
              <SheetDescription>Switch between your transaction profiles.</SheetDescription>
            </SheetHeader>
            <div className="flex h-full flex-col pt-10">
              <ProfileList profiles={profiles} onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <Link href="/app" aria-label="Tracker">
          <Logo />
        </Link>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <UserMenu email={email} compact />
      </div>
    </header>
  );
}
