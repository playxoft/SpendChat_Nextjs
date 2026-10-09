"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useShortcut } from "@/hooks/use-shortcut";
import { comboFor } from "@/lib/shortcuts";
import { writeTargetOf } from "@/lib/profile-scope";
import { useProfileScope } from "@/hooks/use-profile-scope";
import { useLoadingOverlay } from "./loading-overlay";
import { TransactionDialog } from "./transaction-dialog";
import { BulkAddDialog } from "./bulk-add-dialog";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { hrefWithProfile } from "./nav-items";
import type { Category, Profile } from "@/db/schema";
import type { TxnTagDTO } from "@/lib/tags";

/**
 * App-wide keyboard shortcuts that work from any page: jump between sections
 * (q/c/t/e/s…), add a transaction (r) or bulk add (b), and show the shortcuts
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
  tags,
  currency,
  locale,
  today,
  canWrite,
}: {
  categories: Pick<Category, "id" | "name" | "kind" | "icon">[];
  profiles: Pick<Profile, "id" | "name" | "icon" | "spaceId">[];
  /** The workspace's tags, for the add dialog's picker. */
  tags: TxnTagDTO[];
  currency: string;
  locale: string;
  today: string;
  /** Viewers (no editor access anywhere) can't add — the r/b shortcuts no-op. */
  canWrite: boolean;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // A profile or workspace switch in flight (the composer dims itself on this).
  const { pending: switching } = useLoadingOverlay();

  // Same reading as the pages: no `?profile=` → the first profile; a sidebar
  // selection → its first profile, with the dialogs' profile picker open.
  const { raw: profileParam, resolved } = useProfileScope(profiles);
  const { activeProfileId, allProfiles } = writeTargetOf(resolved, profiles);
  const nav = { requireNoOverlay: true } as const;
  // The two keys that open a *write* dialog also wait for the switch to land:
  // these bind to `window`, so nothing the switch disables can stop them, and
  // the dialog would be prefilled with the profile that's on its way out.
  // Section jumps aren't gated — a navigation mid-switch resolves to the new
  // profile like any other, and writes nothing.
  const write = { requireNoOverlay: true, enabled: !switching } as const;

  // Section jumps carry the active profile so switching pages never resets it.
  useShortcut(comboFor("nav.tracker"), () => router.push(hrefWithProfile("/app", profileParam)), nav);
  useShortcut(comboFor("nav.ask"), () => router.push(hrefWithProfile("/app/ask", profileParam)), nav);
  useShortcut(comboFor("nav.transactions"), () => router.push(hrefWithProfile("/app/transactions", profileParam)), nav);
  useShortcut(comboFor("nav.analytics"), () => router.push(hrefWithProfile("/app/analytics", profileParam)), nav);
  useShortcut(comboFor("nav.budgets"), () => router.push(hrefWithProfile("/app/budgets", profileParam)), nav);
  useShortcut(comboFor("nav.files"), () => router.push(hrefWithProfile("/app/files", profileParam)), nav);
  // Split lives outside workspaces, so it doesn't carry the profile along.
  useShortcut(comboFor("nav.split"), () => router.push("/app/split"), nav);
  useShortcut(comboFor("nav.settings"), () => router.push(hrefWithProfile("/app/settings", profileParam)), nav);
  useShortcut(comboFor("action.add"), () => canWrite && setAddOpen(true), write);
  useShortcut(comboFor("action.bulk"), () => canWrite && setBulkOpen(true), write);
  useShortcut(comboFor("global.shortcuts"), () => setShortcutsOpen(true), nav);

  return (
    <>
      {canWrite && (
        <>
          <TransactionDialog
            mode="add"
            categories={categories}
            profiles={profiles}
            tags={tags}
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
