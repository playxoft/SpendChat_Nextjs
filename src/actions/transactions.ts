"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
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

export async function addTransaction(input: TransactionInput): Promise<ActionResult<{ count: number }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "addTransaction",
    async () => {
      await txns.createTransaction(user.id, workspace.id, input);
      revalidateApp();
      return { count: 1 };
    },
    { userId: user.id, workspaceId: workspace.id, profileId: input.profileId ?? null },
  );
}

export async function updateTransaction(
  input: z.input<typeof updateTransactionSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "updateTransaction",
    async () => {
      await txns.updateTransaction(user.id, input.id, input);
      revalidateApp();
      return {};
    },
    { userId: user.id, transactionId: input.id, profileId: input.profileId ?? null },
  );
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(
    "deleteTransaction",
    async () => {
      await txns.deleteTransaction(user.id, id);
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
