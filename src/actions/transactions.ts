"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { parseOrThrow } from "@/lib/api-response";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as txns from "@/services/transactions";
import {
  listTransactions,
  TRANSACTIONS_PAGE_SIZE,
  type TransactionRow,
} from "@/lib/queries";
import { updateTransactionSchema, type TransactionInput } from "@/lib/validation";
import type { BulkDraft } from "@/lib/bulk-parser";

/** Filters + offset for a load-more request. Access is still enforced server
 * side by `listTransactions` (scoped to the caller's accessible profiles), so a
 * tampered profile/category id simply returns nothing. */
const loadMoreSchema = z.object({
  filters: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    type: z.enum(["income", "expense"]).optional(),
    categoryId: z.string().optional(),
    profileId: z.string().optional(),
    search: z.string().optional(),
    sort: z.enum(["date", "category", "title", "description", "amount"]).optional(),
    dir: z.enum(["asc", "desc"]).optional(),
  }),
  offset: z.number().int().min(0).max(1_000_000),
});

function revalidateApp() {
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
}

export async function addTransaction(input: TransactionInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "addTransaction",
    async () => {
      // The optimistic UI keys off the created id to retire its ghost bubble
      // once the revalidated feed shows the real row.
      const created = await txns.createTransaction(user.id, workspace.id, input);
      revalidateApp();
      return { id: created.id };
    },
    { userId: user.id, workspaceId: workspace.id, profileId: input.profileId ?? null },
  );
}

export async function updateTransaction(
  input: z.input<typeof updateTransactionSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "updateTransaction",
    async () => {
      // Null = no such transaction in the current workspace (or no access) —
      // surface it rather than reporting a save that didn't happen.
      const updated = await txns.updateTransaction(user.id, workspace.id, input.id, input);
      if (!updated) throw notFound("Transaction not found");
      revalidateApp();
      return {};
    },
    { userId: user.id, transactionId: input.id, profileId: input.profileId ?? null },
  );
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteTransaction",
    async () => {
      await txns.deleteTransaction(user.id, workspace.id, id);
      revalidateApp();
      return {};
    },
    { userId: user.id, transactionId: id },
  );
}

/**
 * The next page of transactions for the infinite-scroll list. A read (not a
 * mutation), but a server action so the client can fetch more without an API
 * route — it re-derives the user/workspace from the session and never trusts
 * the client for access.
 */
export async function loadMoreTransactions(
  input: z.input<typeof loadMoreSchema>,
): Promise<ActionResult<{ rows: TransactionRow[] }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "loadMoreTransactions",
    async () => {
      const { filters, offset } = parseOrThrow(loadMoreSchema, input);
      const rows = await listTransactions(user.id, workspace.id, {
        ...filters,
        limit: TRANSACTIONS_PAGE_SIZE,
        offset,
      });
      return { rows };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

export async function addBulkTransactions(drafts: BulkDraft[]): Promise<ActionResult<{ count: number }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "addBulkTransactions",
    async () => {
      const { count } = await txns.createBulkFromDrafts(user.id, workspace.id, drafts);
      revalidateApp();
      return { count };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}
