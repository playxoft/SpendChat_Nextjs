"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import { notFound } from "@/lib/errors";
import * as tagService from "@/services/tags";
import { serializeTxnTag, type TxnTagDTO } from "@/lib/tags";
import type { CreateTxnTagInput, UpdateTxnTagInput } from "@/lib/validation";

/**
 * Server actions for transaction tags — the web half of `services/tags.ts`
 * (the REST API is the other). Mirrors `actions/categories.ts`, because tags
 * are the same kind of workspace-scoped shared entity.
 */

function revalidateApp() {
  // Transactions resolve their tags by id at read time, so a rename or a
  // recolor changes what every route that lists one renders. "/app/settings" is
  // a layout revalidation so the settings tree picks it up too — the tag
  // manager that lives there arrives with the next change.
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

/**
 * Rename or recolor a tag.
 *
 * The service returns null when nothing matched in this workspace, and that
 * has to become an error rather than a shrug: the tag manager toasts on `ok`,
 * so swallowing it means two people with the settings page open both see "Tag
 * updated" while one of them wrote nothing. `/api/v1/tags/{id}` 404s on the
 * same condition — the two paths answer for the same service and should not
 * disagree about whether the write happened.
 */
export async function updateTag(input: UpdateTxnTagInput): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "updateTag",
    async () => {
      const updated = await tagService.updateTxnTag(user.id, workspace.id, input.id, input);
      if (!updated) throw notFound("Tag not found");
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id, tagId: input.id },
  );
}

/** Delete a tag and detach it everywhere. Same reasoning as `updateTag` for
 *  the "nothing matched" case: a stale page must not report a delete it
 *  didn't do. */
export async function deleteTag(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteTag",
    async () => {
      const deleted = await tagService.deleteTxnTag(user.id, workspace.id, id);
      if (!deleted) throw notFound("Tag not found");
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
