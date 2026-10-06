import type { Metadata } from "next";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { getTrashBytes } from "@/lib/queries";
import { encodeTrashCursor } from "@/lib/trash";
import { getWorkspaceRole } from "@/lib/workspaces";
import {
  countTrash,
  listTrashProfiles,
  listTrashTransactions,
  listTrashVault,
} from "@/services/trash";
import { TrashPageClient } from "@/components/app/trash/trash-page";

export const dynamic = "force-dynamic";

// Private app page (robots-disallowed under /app) — a title is all it needs.
export const metadata: Metadata = { title: "Trash" };

/**
 * The trash: deleted transactions, files and folders (Plus/Pro) and — for
 * workspace admins — whole profiles, each restorable until the daily purge
 * removes it 30 days after it was deleted. Everything the page acts on goes
 * through `services/trash.ts`, the same rules as `/api/v1/trash/*`.
 */
export default async function TrashPage() {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  const [page, vault, profiles, counts, trashBytes, role] = await Promise.all([
    listTrashTransactions(user.id, workspace.id),
    listTrashVault(user.id, workspace.id),
    listTrashProfiles(user.id, workspace.id),
    countTrash(user.id, workspace.id),
    getTrashBytes(workspace.id),
    getWorkspaceRole(user.id, workspace.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <TrashPageClient
        rows={page.rows}
        nextCursor={page.nextCursor ? encodeTrashCursor(page.nextCursor) : null}
        now={new Date().toISOString()}
        folders={vault.folders}
        files={vault.files}
        filesCapped={vault.filesCapped}
        profiles={profiles}
        counts={counts}
        trashBytes={trashBytes}
        isAdmin={role === "admin"}
        currency={workspace.currency}
        locale={workspace.locale}
      />
    </div>
  );
}
