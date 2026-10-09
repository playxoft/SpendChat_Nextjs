"use client";

import { useState } from "react";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BulkAddDialog } from "./bulk-add-dialog";
import { writeTargetOf } from "@/lib/profile-scope";
import { useProfileScope } from "@/hooks/use-profile-scope";
import type { Category, Profile } from "@/db/schema";

/**
 * Bulk-add entry point for the mobile top header. Resolves the active profile
 * from the URL (same reading as the pages: no `?profile=` → first profile; a
 * selection → its first profile, with the picker open) and opens the shared
 * BulkAddDialog. Rendered only on mobile by the topbar.
 */
export function MobileBulkAdd({
  categories,
  profiles,
  currency,
  locale,
  today,
}: {
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles: Pick<Profile, "id" | "name" | "icon" | "spaceId">[];
  currency: string;
  locale: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const { resolved } = useProfileScope(profiles);
  const { activeProfileId, allProfiles } = writeTargetOf(resolved, profiles);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Bulk add"
        onClick={() => setOpen(true)}
      >
        <ListPlus className="size-5" />
      </Button>
      <BulkAddDialog
        today={today}
        categories={categories}
        profiles={profiles}
        activeProfileId={activeProfileId}
        allProfiles={allProfiles}
        currency={currency}
        locale={locale}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
