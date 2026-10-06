"use client";

import { toast } from "sonner";
import { restoreFromTrash } from "@/actions/trash";
import { TRASH_DAYS, describeTrashCounts, type TrashCounts, type TrashSelection } from "@/lib/trash";
import { TRASH_SELECTION_MAX } from "@/lib/validation";

/** One restore request per `TRASH_SELECTION_MAX` transaction ids (a big multi-select). */
function chunks(selection: TrashSelection): TrashSelection[] {
  const ids = selection.transactionIds ?? [];
  if (ids.length <= TRASH_SELECTION_MAX) return [selection];
  const parts: TrashSelection[] = [];
  for (let i = 0; i < ids.length; i += TRASH_SELECTION_MAX) {
    parts.push({ transactionIds: ids.slice(i, i + TRASH_SELECTION_MAX) });
  }
  return parts;
}

function count(selection: TrashSelection): number {
  return (
    (selection.transactionIds?.length ?? 0) +
    (selection.fileIds?.length ?? 0) +
    (selection.folderIds?.length ?? 0) +
    (selection.profileIds?.length ?? 0)
  );
}

/** What an Undo brought back, for the caller to put on screen again. */
export type Restored = { counts: TrashCounts; transactionIds: string[] };

type Failure = { ok: false; error: string; code?: string; details?: unknown };

/**
 * Restore a selection, a chunk at a time, and say what really happened: the
 * toast says "Restored" only for what came back, and names what didn't (an
 * item deleted for good, or restored elsewhere, meanwhile). A refusal — a plan
 * limit, say — goes to `onFailure` when the caller passes one (to open the
 * upgrade dialog), else to an error toast.
 */
export async function undoTrash(
  selection: TrashSelection,
  opts: { onRestored?: (restored: Restored) => void; onFailure?: (res: Failure) => void } = {},
): Promise<void> {
  const total: Restored = {
    counts: { transactions: 0, files: 0, folders: 0, profiles: 0 },
    transactionIds: [],
  };
  let skipped = 0;
  for (const part of chunks(selection)) {
    const res = await restoreFromTrash(part);
    if (!res.ok) {
      if (opts.onFailure) opts.onFailure(res);
      else toast.error(res.error);
      break;
    }
    total.counts.transactions += res.counts.transactions;
    total.counts.files += res.counts.files;
    total.counts.folders += res.counts.folders;
    total.counts.profiles += res.counts.profiles;
    total.transactionIds.push(...res.transactionIds);
    skipped += res.skipped;
  }
  const what = describeTrashCounts(total.counts);
  if (what) {
    toast.success(
      `Restored ${what}`,
      skipped > 0
        ? { description: `${skipped} couldn't be restored — they may have been deleted for good.` }
        : undefined,
    );
    opts.onRestored?.(total);
  } else if (skipped > 0) {
    toast.error("Couldn't restore that — it may have been deleted for good.");
  }
}

/**
 * The toast every delete that goes to the trash shows: what happened, how long
 * it can be undone, and an **Undo** that restores exactly what was deleted.
 * When nothing moved there's nothing to undo, so no Undo is offered.
 * `onRestored` puts it back on screen (the optimistic removal took it off).
 */
export function toastMovedToTrash(
  message: string,
  selection: TrashSelection,
  opts: {
    description?: string;
    onRestored?: (restored: Restored) => void;
    onFailure?: (res: Failure) => void;
  } = {},
): void {
  if (count(selection) === 0) {
    toast.info(message, opts.description ? { description: opts.description } : undefined);
    return;
  }
  toast.success(message, {
    description: opts.description ?? `You can restore it from the trash for ${TRASH_DAYS} days.`,
    action: {
      label: "Undo",
      onClick: () => void undoTrash(selection, opts),
    },
  });
}
