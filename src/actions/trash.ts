"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { parseOrThrow } from "@/lib/api-response";
import { runAction, type ActionResult } from "@/lib/action-result";
import { encodeTrashCursor, type TrashCounts, type TrashSelection } from "@/lib/trash";
import { trashCursorSchema } from "@/lib/validation";
import { SCOPE_MAX_PROFILE_IDS } from "@/lib/profile-scope";
import * as trash from "@/services/trash";
import { listTransactions, type TransactionRow, type TrashedTransactionRow } from "@/lib/queries";
import type { TxnFilters } from "@/lib/queries";
import { z } from "zod";

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
    { userId: user.id, rateLimit: "read", workspaceId: workspace.id },
  );
}

/** Read-only: what "Empty trash" would delete, counted (the confirm step). */
export async function getTrashCounts(): Promise<ActionResult<{ counts: TrashCounts }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "getTrashCounts",
    async () => ({ counts: await trash.countTrash(user.id, workspace.id) }),
    { userId: user.id, rateLimit: "read", workspaceId: workspace.id },
  );
}

/** Restore a selection (also the "Undo" on a delete toast). `transactionIds`
 * are the transactions that came back, for the caller to put back on screen. */
export async function restoreFromTrash(
  selection: TrashSelection,
): Promise<ActionResult<{ counts: TrashCounts; skipped: number; transactionIds: string[] }>> {
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

const restoreAllSchema = z.object({
  profileIds: z.array(z.string().uuid()).max(500).optional(),
  /** One deletion's instant (ISO, millisecond — what `deleted_at` stores). */
  deletedAt: z.string().datetime({ offset: true }).optional(),
});

/**
 * Restore trashed transactions by filter — every one the caller can edit,
 * optionally only some profiles' or one deletion's ("Delete all
 * transactions"' Undo) — a bounded batch at a time: call again while
 * `remaining > 0`.
 */
export async function restoreAllFromTrash(
  filter: { profileIds?: string[]; deletedAt?: string } = {},
): Promise<ActionResult<{ restored: number; remaining: number }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "restoreAllFromTrash",
    async () => {
      const f = parseOrThrow(restoreAllSchema, filter);
      const res = await trash.restoreAllTransactions(user.id, workspace.id, {
        profileIds: f.profileIds,
        deletedAt: f.deletedAt ? new Date(f.deletedAt) : undefined,
      });
      revalidateApp();
      return { restored: res.restored, remaining: res.remaining };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

const restoredRowsSchema = z.object({
  ids: z.array(z.string().uuid()).max(500),
  filters: z
    .object({
      profileId: z.string().uuid().optional(),
      profileIds: z.array(z.string().uuid()).max(SCOPE_MAX_PROFILE_IDS).optional(),
      type: z.enum(["income", "expense"]).optional(),
      categoryId: z.string().uuid().optional(),
      tagIds: z.array(z.string().uuid()).max(50).optional(),
      search: z.string().max(200).optional(),
      from: z.string().max(10).optional(),
      to: z.string().max(10).optional(),
      sort: z.enum(["date", "category", "title", "description", "amount"]).optional(),
      dir: z.enum(["asc", "desc"]).optional(),
    })
    .optional(),
});

/**
 * Read-only: rows just restored from the trash, as the caller's current view
 * would show them — the same filters, so a restored row the view filters out
 * stays out. Access is the list's own (`listTransactions`).
 */
export async function loadRestoredTransactions(input: {
  ids: string[];
  filters?: Omit<TxnFilters, "ids" | "limit" | "offset">;
}): Promise<ActionResult<{ rows: TransactionRow[] }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "loadRestoredTransactions",
    async () => {
      const { ids, filters } = parseOrThrow(restoredRowsSchema, input);
      if (ids.length === 0) return { rows: [] };
      const rows = await listTransactions(user.id, workspace.id, {
        ...filters,
        ids,
        limit: ids.length,
      });
      return { rows };
    },
    { userId: user.id, rateLimit: "read", workspaceId: workspace.id },
  );
}
