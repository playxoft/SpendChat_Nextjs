"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BulkAddDialog } from "./bulk-add-dialog";
import { resolveWebProfile } from "@/lib/filters";
import type { Category, Profile } from "@/db/schema";

/**
 * Bulk-add entry point for the mobile top header. Resolves the active profile
 * from the URL (same default as the pages: no `?profile=` → first profile) and
 * opens the shared BulkAddDialog. Rendered only on mobile by the topbar.
 */
export function MobileBulkAdd({
  categories,
  profiles,
  currency,
  today,
}: {
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  currency: string;
  today: string;
}) {
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const activeProfileId = resolveWebProfile(sp.get("profile"), profiles[0]?.id);
  const allProfiles = !activeProfileId;

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
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
