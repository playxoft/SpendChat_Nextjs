"use server";

import { revalidatePath } from "next/cache";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { runAction, type ActionResult } from "@/lib/action-result";
import * as attachments from "@/services/attachments";
import type { AttachmentDTO } from "@/lib/attachments";
import type { AttachmentMetaInput } from "@/lib/validation";

/**
 * Web server actions for transaction attachments. Upload (multipart) and
 * download (redirect) go through route handlers; these cover the JSON-shaped
 * operations the edit UI needs — list on open, rename/tag, and delete. All the
 * RBAC + validation lives in `src/services/attachments.ts`.
 */

function revalidateApp() {
  // Attachment counts (the 📎 badge) are server-rendered in the feed + table.
  revalidatePath("/app");
  revalidatePath("/transactions");
}

/** Attachments for a transaction (viewer-or-better). Loaded when a detail/edit
 * dialog opens, so the feed/table don't pay for them per row. */
export async function listAttachments(
  transactionId: string,
): Promise<ActionResult<{ attachments: AttachmentDTO[] }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "listAttachments",
    async () => {
      const items = await attachments.listAttachments(user.id, workspace.id, transactionId);
      return { attachments: items };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Rename an attachment or set/clear its preset tag (editor). */
export async function updateAttachment(
  input: { id: string } & AttachmentMetaInput,
): Promise<ActionResult<{ attachment: AttachmentDTO }>> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  const { id, ...meta } = input;
  return runAction(
    "updateAttachment",
    async () => {
      const attachment = await attachments.updateAttachment(user.id, workspace.id, id, meta);
      return { attachment };
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}

/** Delete an attachment and its stored file (editor). */
export async function deleteAttachment(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  return runAction(
    "deleteAttachment",
    async () => {
      const removed = await attachments.deleteAttachment(user.id, workspace.id, id);
      if (!removed) throw notFound("Attachment not found");
      revalidateApp();
      return {};
    },
    { userId: user.id, workspaceId: workspace.id },
  );
}
