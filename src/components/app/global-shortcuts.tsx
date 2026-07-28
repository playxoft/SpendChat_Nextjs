"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useShortcut } from "@/hooks/use-shortcut";
import { comboFor } from "@/lib/shortcuts";
import { resolveWebProfile } from "@/lib/filters";
import { TransactionDialog } from "./transaction-dialog";
import { BulkAddDialog } from "./bulk-add-dialog";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { hrefWithProfile } from "./nav-items";
import type { Category, Profile } from "@/db/schema";

/**
 * App-wide keyboard shortcuts that work from any page: jump between sections
 * (q/t/e/s), add a transaction (r) or bulk add (b), and show the shortcuts
 * cheat sheet (/). The dialogs are mounted here so the keys open them anywhere.
 * (The tracker's Manual/AI toggle, `a`, lives in the composer since it needs its
 * state — see `transaction-composer.tsx`.)
 *
 * Single-key shortcuts are suppressed while typing or while another dialog/menu
 * is open (see `requireNoOverlay`), so they never hijack normal input.
 */
export function GlobalShortcuts({
  categories,
  profiles,
  currency,
  locale,
  today,
  canWrite,
}: {
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles: Pick<Profile, "id" | "name" | "icon">[];
  currency: string;
  locale: string;
  today: string;
  /** Viewers (no editor access anywhere) can't add — the r/b shortcuts no-op. */
  canWrite: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Same default as the pages: no `?profile=` → the first profile.
  const profileParam = sp.get("profile");
  const activeProfileId = resolveWebProfile(profileParam, profiles[0]?.id);
  const allProfiles = !activeProfileId;
  const nav = { requireNoOverlay: true } as const;

  // Section jumps carry the active profile so switching pages never resets it.
  useShortcut(comboFor("nav.tracker"), () => router.push(hrefWithProfile("/app", profileParam)), nav);
  useShortcut(comboFor("nav.transactions"), () => router.push(hrefWithProfile("/transactions", profileParam)), nav);
  useShortcut(comboFor("nav.analytics"), () => router.push(hrefWithProfile("/analytics", profileParam)), nav);
  useShortcut(comboFor("nav.settings"), () => router.push(hrefWithProfile("/settings", profileParam)), nav);
  useShortcut(comboFor("action.add"), () => canWrite && setAddOpen(true), nav);
  useShortcut(comboFor("action.bulk"), () => canWrite && setBulkOpen(true), nav);
  useShortcut(comboFor("global.shortcuts"), () => setShortcutsOpen(true), nav);

  return (
    <>
      {canWrite && (
        <>
          <TransactionDialog
            mode="add"
            categories={categories}
            profiles={profiles}
            activeProfileId={activeProfileId}
            currency={currency}
            locale={locale}
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
            locale={locale}
            open={bulkOpen}
            onOpenChange={setBulkOpen}
          />
        </>
      )}
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
