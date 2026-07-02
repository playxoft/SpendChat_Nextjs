"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as txns from "@/services/transactions";
import { updateTransactionSchema, type TransactionInput } from "@/lib/validation";
import type { z } from "zod";
import type { BulkDraft } from "@/lib/bulk-parser";

export type { ActionResult };

function revalidateApp() {
  revalidatePath("/app");
  revalidatePath("/transactions");
  revalidatePath("/analytics");
}

export async function addTransaction(input: TransactionInput): Promise<ActionResult<{ count: number }>> {
  const user = await requireUser();
  return runAction(async () => {
    await txns.createTransaction(user.id, input);
    revalidateApp();
    return { count: 1 };
  });
}

export async function updateTransaction(
  input: z.input<typeof updateTransactionSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await txns.updateTransaction(user.id, input.id, input);
    revalidateApp();
    return {};
  });
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await txns.deleteTransaction(user.id, id);
    revalidateApp();
    return {};
  });
}

export async function addBulkTransactions(drafts: BulkDraft[]): Promise<ActionResult<{ count: number }>> {
  const user = await requireUser();
  return runAction(async () => {
    const { count } = await txns.createBulkFromDrafts(user.id, drafts);
    revalidateApp();
    return { count };
  });
}
