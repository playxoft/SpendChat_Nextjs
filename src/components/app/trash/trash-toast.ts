"use client";

import { toast } from "sonner";
import { restoreFromTrash } from "@/actions/trash";
import { TRASH_DAYS, type TrashSelection } from "@/lib/trash";
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

/**
 * The toast every delete that goes to the trash shows: what happened, how long
 * it can be undone, and an **Undo** that restores exactly what was deleted.
 * `onRestored` puts it back on screen (usually `router.refresh()` — the
 * optimistic removal already took it off).
 */
export function toastMovedToTrash(
  message: string,
  selection: TrashSelection,
  opts: { description?: string; onRestored?: () => void } = {},
): void {
  toast.success(message, {
    description: opts.description ?? `You can restore it from the trash for ${TRASH_DAYS} days.`,
    action: {
      label: "Undo",
      onClick: async () => {
        for (const part of chunks(selection)) {
          const res = await restoreFromTrash(part);
          if (!res.ok) {
            toast.error(res.error);
            opts.onRestored?.();
            return;
          }
        }
        toast.success("Restored");
        opts.onRestored?.();
      },
    },
  });
}
