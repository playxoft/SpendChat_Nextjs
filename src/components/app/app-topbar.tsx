"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ProfileList, type SidebarProfile, type SidebarSpace } from "./profile-list";
import { AccountControls } from "./account-controls";
import { MobileBulkAdd } from "./mobile-bulk-add";
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher";
import { hrefWithProfile } from "./nav-items";
import type { Category } from "@/db/schema";

export function AppTopbar({
  profiles,
  spaces,
  collapsedSpaces,
  workspaces,
  currentWorkspaceId,
  categories,
  currency,
  locale,
  today,
  canWrite,
}: {
  profiles: SidebarProfile[];
  spaces: SidebarSpace[];
  collapsedSpaces: string[];
  workspaces: WorkspaceOption[];
  currentWorkspaceId: string;
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  currency: string;
  locale: string;
  today: string;
  /** Viewers (no editor access anywhere) don't get the bulk-add button. */
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const profile = useSearchParams().get("profile");

  return (
    // Phones only: the logo, the profile sheet and bulk add (which the desktop
    // sidebar has), then the theme button and the account menu. A desktop has
    // no bar here — each page puts those two at the end of its own first row
    // (`AccountControls`), so the page keeps the 56px this bar would take.
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
              <SheetDescription>Switch between your spaces and transaction profiles.</SheetDescription>
            </SheetHeader>
            <div className="flex h-full flex-col pt-10">
              <div className="shrink-0 px-3 pb-1">
                <WorkspaceSwitcher
                  workspaces={workspaces}
                  currentId={currentWorkspaceId}
                  onNavigate={() => setOpen(false)}
                />
              </div>
              <ProfileList
                profiles={profiles}
                spaces={spaces}
                collapsedSpaces={collapsedSpaces}
                onNavigate={() => setOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
        {canWrite && (
          <Suspense fallback={null}>
            <MobileBulkAdd
              categories={categories}
              profiles={profiles}
              currency={currency}
              locale={locale}
              today={today}
            />
          </Suspense>
        )}
        <AccountControls inTopbar />
      </div>
    </header>
  );
}
