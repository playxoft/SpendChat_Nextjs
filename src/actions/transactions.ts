"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as txns from "@/services/transactions";
import { updateTransactionSchema, type TransactionInput } from "@/lib/validation";
import type { z } from "zod";
import type { BulkDraft } from "@/lib/bulk-parser";

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
