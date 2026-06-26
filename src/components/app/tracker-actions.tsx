"use client";

import { CalendarPlus, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransactionDialog } from "./transaction-dialog";
import { BulkAddDialog } from "./bulk-add-dialog";
import type { Category, Profile } from "@/db/schema";

/**
 * Tracker header actions (add / bulk add). Kept as a client component so the
 * dialog trigger elements are authored here rather than passed as props from the
 * server page — passing a client-component element across the RSC boundary into
 * a Radix `asChild` slot trips react-slot's single-element check.
 */
export function TrackerActions({
  categories,
  profiles,
  activeProfileId,
  currency,
  today,
  allProfiles,
}: {
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  activeProfileId?: string;
  currency: string;
  today: string;
  allProfiles: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <TransactionDialog
        mode="add"
        categories={categories}
        profiles={profiles}
        activeProfileId={activeProfileId}
        currency={currency}
        today={today}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Add with a custom date"
            className="hidden md:inline-flex"
          >
            <CalendarPlus className="size-4" />
          </Button>
        }
      />
      <BulkAddDialog
        today={today}
        categories={categories}
        profiles={profiles}
        activeProfileId={activeProfileId}
        allProfiles={allProfiles}
        currency={currency}
        trigger={
          <Button variant="outline" size="sm">
            <ListPlus className="size-4" />
            <span className="hidden sm:inline">Bulk add</span>
          </Button>
        }
      />
    </div>
  );
}
