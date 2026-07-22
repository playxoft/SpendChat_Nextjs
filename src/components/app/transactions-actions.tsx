"use client";

import { useState } from "react";
import { CalendarPlus, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { comboFor } from "@/lib/shortcuts";
import { TransactionDialog } from "./transaction-dialog";
import { BulkAddDialog } from "./bulk-add-dialog";
import { usePermissions } from "./permissions";
import { PageAttachmentDrop } from "./attachments/page-attachment-drop";
import { pickAcceptedFiles } from "./attachments/upload-client";
import { ATTACHMENT_MAX_PER_TRANSACTION } from "@/lib/validation";
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
  const { canWrite } = usePermissions();
  // Files dropped anywhere on the page open the Add dialog pre-staged.
  const [addOpen, setAddOpen] = useState(false);
  const [dropped, setDropped] = useState<File[]>([]);

  function handlePageDrop(files: File[]) {
    const { accepted, errors } = pickAcceptedFiles(files, ATTACHMENT_MAX_PER_TRANSACTION);
    errors.forEach((e) => toast.error(e));
    if (accepted.length === 0) return;
    setDropped(accepted);
    setAddOpen(true);
  }

  return (
    <>
      <PageAttachmentDrop onFiles={handlePageDrop} disabled={!canWrite} />
      <TransactionDialog
        mode="add"
        categories={categories}
        profiles={profiles}
        activeProfileId={activeProfileId}
        currency={currency}
        locale={locale}
        today={today}
        open={addOpen}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) setDropped([]);
        }}
        initialFiles={dropped}
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
