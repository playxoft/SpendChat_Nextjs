"use client";

import * as React from "react";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { updateCategory } from "@/actions/categories";

type Nameable = { id: string; name: string };

/**
 * Inline rename for a category row, shared by the settings manager and the "/"
 * editor dialog: both show the name as an editable field with a pencil beside
 * the remove button.
 *
 * `items` comes back with the in-flight name already applied, so the row reads
 * as renamed the moment it's submitted. React drops that override once the
 * transition settles — on success the revalidated props already carry the new
 * name (no flicker), and on failure dropping it *is* the revert to the previous
 * name. `savingId` marks the row to disable while its write is in flight.
 */
export function useCategoryRename<T extends Nameable>(items: T[]) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [optimisticItems, applyRename] = useOptimistic(items, (state, renamed: Nameable) =>
    state.map((c) => (c.id === renamed.id ? { ...c, name: renamed.name } : c)),
  );

  function start(c: Nameable) {
    setEditingId(c.id);
    setDraft(c.name);
  }

  function cancel() {
    setEditingId(null);
    setDraft("");
  }

  function commit(c: Nameable) {
    const name = draft.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    if (name === c.name) {
      cancel();
      return;
    }
    // Close the field first — the row renders `name` optimistically from here,
    // so keeping the input open would just show it twice.
    cancel();
    setSavingId(c.id);
    startTransition(async () => {
      applyRename({ id: c.id, name });
      const res = await updateCategory({ id: c.id, name });
      setSavingId(null);
      if (res.ok) toast.success("Category renamed");
      else toast.error(res.error);
    });
  }

  /** Enter commits, Escape reverts — both stopped so a host dialog stays open. */
  function keyHandler(c: Nameable) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        commit(c);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
  }

  return {
    items: optimisticItems,
    editingId,
    savingId,
    draft,
    setDraft,
    pending,
    start,
    cancel,
    commit,
    keyHandler,
  };
}
