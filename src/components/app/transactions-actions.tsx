"use client";

import { CalendarPlus, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { comboFor } from "@/lib/shortcuts";
import { TransactionDialog } from "./transaction-dialog";
import { BulkAddDialog } from "./bulk-add-dialog";
import type { Category, Profile } from "@/db/schema";

/**
 * Add / bulk-add actions for the transactions page. A client component so the
 * dialog trigger elements are authored here rather than passed as props from the
 * server page — passing a client-component element across the RSC boundary into
 * a Radix `asChild` slot trips react-slot's single-element check.
 */
export function TransactionsActions({
  categories,
  profiles,
  activeProfileId,
  currency,
  locale,
  today,
  allProfiles,
}: {
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  activeProfileId?: string;
  currency: string;
  locale: string;
  today: string;
  allProfiles: boolean;
}) {
  return (
    <>
      <TransactionDialog
        mode="add"
        categories={categories}
        profiles={profiles}
        activeProfileId={activeProfileId}
        currency={currency}
        locale={locale}
        today={today}
        trigger={
          <Button className="gap-1.5">
            <CalendarPlus className="size-4" />
            Add transaction
            <Kbd combo={comboFor("action.add")} className="hidden sm:inline-flex" />
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
        locale={locale}
        trigger={
          <Button variant="outline">
            <ListPlus className="size-4" />
            <span className="hidden sm:inline">Bulk add</span>
            <Kbd combo={comboFor("action.bulk")} className="hidden sm:inline-flex" />
          </Button>
        }
      />
    </>
  );
}
