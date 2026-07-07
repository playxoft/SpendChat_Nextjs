"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useShortcut } from "@/hooks/use-shortcut";
import { comboFor } from "@/lib/shortcuts";
import { resolveWebProfile } from "@/lib/filters";
import { TransactionDialog } from "./transaction-dialog";
import { BulkAddDialog } from "./bulk-add-dialog";
import type { Category, Profile } from "@/db/schema";

/**
 * App-wide keyboard shortcuts that work from any page: jump between sections
 * (t/r/a/s), add a transaction (e) or bulk add (b), and focus a page's search
 * box (/). The add/bulk dialogs are mounted here so the keys open them anywhere.
 *
 * Single-key shortcuts are suppressed while typing or while another dialog/menu
 * is open (see `requireNoOverlay`), so they never hijack normal input.
 */
export function GlobalShortcuts({
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
  const router = useRouter();
  const sp = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Same default as the pages: no `?profile=` → the first profile.
  const activeProfileId = resolveWebProfile(sp.get("profile"), profiles[0]?.id);
  const allProfiles = !activeProfileId;
  const nav = { requireNoOverlay: true } as const;

  useShortcut(comboFor("nav.tracker"), () => router.push("/app"), nav);
  useShortcut(comboFor("nav.transactions"), () => router.push("/transactions"), nav);
  useShortcut(comboFor("nav.analytics"), () => router.push("/analytics"), nav);
  useShortcut(comboFor("nav.settings"), () => router.push("/settings"), nav);
  useShortcut(comboFor("action.add"), () => setAddOpen(true), nav);
  useShortcut(comboFor("action.bulk"), () => setBulkOpen(true), nav);
  useShortcut(
    comboFor("global.search"),
    () => {
      const el = document.querySelector<HTMLElement>("[data-shortcut-search]");
      el?.focus();
    },
    nav,
  );

  return (
    <>
      <TransactionDialog
        mode="add"
        categories={categories}
        profiles={profiles}
        activeProfileId={activeProfileId}
        currency={currency}
        today={today}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      <BulkAddDialog
        today={today}
        categories={categories}
        profiles={profiles}
        activeProfileId={activeProfileId}
        allProfiles={allProfiles}
        currency={currency}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
      />
    </>
  );
}
