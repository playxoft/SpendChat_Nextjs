"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { MobileBulkAdd } from "./mobile-bulk-add";
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher";
import { hrefWithProfile } from "./nav-items";
import type { Category, Profile } from "@/db/schema";

export function AppTopbar({
  email,
  profiles,
  workspaces,
  currentWorkspaceId,
  categories,
  currency,
  locale,
  today,
}: {
  email: string | null;
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  workspaces: WorkspaceOption[];
  currentWorkspaceId: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  currency: string;
  locale: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const profile = useSearchParams().get("profile");

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-sm md:hidden print:hidden">
      <div className="flex items-center gap-1">
        <Link href={hrefWithProfile("/app", profile)} aria-label="Tracker">
          <Logo />
        </Link>
      </div>
      <div className="flex items-center gap-1">
        {/* Workspace + profile switcher, to the left of the bulk-add button. */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Workspaces and profiles">
              <Users className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Profiles</SheetTitle>
              <SheetDescription>Switch between your transaction profiles.</SheetDescription>
            </SheetHeader>
            <div className="flex h-full flex-col pt-10">
              <div className="shrink-0 px-3 pb-1">
                <WorkspaceSwitcher
                  workspaces={workspaces}
                  currentId={currentWorkspaceId}
                  onNavigate={() => setOpen(false)}
                />
              </div>
              <ProfileList profiles={profiles} onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <Suspense fallback={null}>
          <MobileBulkAdd
            categories={categories}
            profiles={profiles}
            currency={currency}
            locale={locale}
            today={today}
          />
        </Suspense>
        <ThemeToggle />
        <UserMenu email={email} compact />
      </div>
    </header>
  );
}
