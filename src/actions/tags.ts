"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as tagService from "@/services/tags";
import { setTransactionTags as setTags } from "@/services/transactions";
import { serializeTxnTag, type TxnTagDTO } from "@/lib/tags";
import type { CreateTxnTagInput, UpdateTxnTagInput } from "@/lib/validation";

/**
 * Server actions for transaction tags — the web half of `services/tags.ts`
 * (the REST API is the other). Mirrors `actions/categories.ts`, because tags
 * are the same kind of workspace-scoped shared entity.
 */

function revalidateApp() {
  // Transactions resolve their tags by id at read time, so a rename or a
  // recolor changes what every route that lists one renders — not just the
  // settings page. "/app/settings" is a layout revalidation to reach the
  // nested tag manager at "/app/settings/tags".
  revalidatePath("/app");
  revalidatePath("/app/transactions");
  revalidatePath("/app/settings", "layout");
}

/**
 * Create a tag and hand the row back.
 *
 * Unlike the category actions, this one returns the created tag rather than
 * `{}`: it is called from inside the composer's picker, which has to apply the
 * tag it just created to the transaction being typed. Without the id it would
 * have to re-fetch the list and match on name — a round-trip, and a guess if
 * two people create the same name at once.
 */
export async function addTag(input: CreateTxnTagInput): Promise<ActionResult<{ tag: TxnTagDTO }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "addTag",
    async () => {
      const row = await tagService.createTxnTag(user.id, workspace.id, input);
      revalidateApp();
      return { tag: serializeTxnTag(row) };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

export async function updateTag(input: UpdateTxnTagInput): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "updateTag",
    async () => {
      await tagService.updateTxnTag(user.id, workspace.id, input.id, input);
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id, tagId: input.id },
  );
}

export async function deleteTag(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteTag",
    async () => {
      await tagService.deleteTxnTag(user.id, workspace.id, id);
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id, tagId: id },
  );
}

/**
 * How many transactions carry a tag — read before offering to delete it, so
 * "this will untag 34 transactions" is a fact rather than a warning.
 */
export async function countTransactionsForTag(
  id: string,
): Promise<ActionResult<{ count: number }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "countTransactionsForTag",
    async () => ({ count: await tagService.countTransactionsForTxnTag(workspace.id, id) }),
    { userId: user.id, workspaceId: workspace.id, tagId: id },
  );
}

/**
 * Set one transaction's tags, touching nothing else.
 *
 * Narrow on purpose: the composer's chips and the table cell's picker both hold
 * the tags and nothing else, and routing them through the full update action
 * would make them re-send an amount and a date they never touched — writing any
 * staleness in those back over a concurrent edit.
 */
export async function setTransactionTags(
  id: string,
  tagIds: string[],
): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "setTransactionTags",
    async () => {
      await setTags(user.id, workspace.id, id, { id, tagIds });
      revalidatePath("/app");
      revalidatePath("/app/transactions");
      return {};
    },
    { userId: user.id, workspaceId: workspace.id, transactionId: id },
  );
}
