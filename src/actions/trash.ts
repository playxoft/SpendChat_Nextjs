"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { parseOrThrow } from "@/lib/api-response";
import { runAction, type ActionResult } from "@/lib/action-result";
import { encodeTrashCursor, type TrashCounts, type TrashSelection } from "@/lib/trash";
import { trashCursorSchema } from "@/lib/validation";
import * as trash from "@/services/trash";
import type { TrashedTransactionRow } from "@/lib/queries";

/**
 * The trash page's server actions. Reads (`listTrashPage`, `getTrashCounts`)
 * and writes (restore, delete for good, empty) — the rules live in
 * `services/trash.ts`, shared with `/api/v1/trash/*`.
 */

/** Restoring or destroying anything can change every page under /app. */
function revalidateApp() {
  revalidatePath("/app", "layout");
}

export type TrashPage = {
  rows: (TrashedTransactionRow & { canRestore: boolean })[];
  nextCursor: string | null;
};

/** Read-only: the next page of trashed transactions (infinite scroll). */
export async function listTrashPage(cursor?: string | null): Promise<ActionResult<TrashPage>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "listTrashPage",
    async () => {
      const before = cursor ? parseOrThrow(trashCursorSchema, cursor) : undefined;
      const page = await trash.listTrashTransactions(user.id, workspace.id, { before });
      return {
        rows: page.rows,
        nextCursor: page.nextCursor ? encodeTrashCursor(page.nextCursor) : null,
      };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Read-only: what "Empty trash" would delete, counted (the confirm step). */
export async function getTrashCounts(): Promise<ActionResult<{ counts: TrashCounts }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "getTrashCounts",
    async () => ({ counts: await trash.countTrash(user.id, workspace.id) }),
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Restore a selection (also the "Undo" on a delete toast). */
export async function restoreFromTrash(
  selection: TrashSelection,
): Promise<ActionResult<{ counts: TrashCounts; skipped: number }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "restoreFromTrash",
    async () => {
      const result = await trash.restoreFromTrash(user.id, workspace.id, selection);
      revalidateApp();
      return result;
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Delete a selection from the trash for good. */
export async function deleteFromTrash(
  selection: TrashSelection,
): Promise<ActionResult<{ counts: TrashCounts; skipped: number }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteFromTrash",
    async () => {
      const result = await trash.deleteFromTrash(user.id, workspace.id, selection);
      revalidateApp();
      return result;
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Empty the trash, a bounded batch at a time — call again while `remaining > 0`. */
export async function emptyTrash(): Promise<
  ActionResult<{ counts: TrashCounts; remaining: number }>
> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "emptyTrash",
    async () => {
      const result = await trash.emptyTrash(user.id, workspace.id);
      revalidateApp();
      return result;
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}
