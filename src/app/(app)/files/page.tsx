import type { Metadata } from "next";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { resolveWebProfile } from "@/lib/filters";
import {
  VAULT_FILES_LIMIT,
  getProfiles,
  listTransactionFilesForVault,
  listVaultFiles,
  listVaultFolders,
  listVaultTags,
} from "@/lib/queries";
import { ensureSystemFolders } from "@/services/files";
import { FilesPageClient } from "@/components/app/files/files-page";

export const dynamic = "force-dynamic";

// Private app page (robots-disallowed) — no SEO metadata needed beyond a title.
export const metadata: Metadata = { title: "Files" };

/**
 * The files vault: folders + documents per profile, plus every transaction
 * attachment with its transaction info. All data for the active profile scope
 * ships at once (bounded by `VAULT_FILES_LIMIT`) and the client filters,
 * searches, and navigates folders instantly without further round-trips.
 */
export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; folder?: string }>;
}) {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id);
  const sp = await searchParams;
  const profiles = await getProfiles(user.id, workspace.id);
  const activeProfileId = resolveWebProfile(sp.profile ?? null, profiles[0]?.id);

  // Lazily materialize each profile's "Transaction attachments" system folder
  // (idempotent; the ids here already passed access scoping via getProfiles).
  await ensureSystemFolders(
    user.id,
    workspace.id,
    (activeProfileId ? profiles.filter((p) => p.id === activeProfileId) : profiles).map(
      (p) => p.id,
    ),
  );

  const [folders, files, txnFiles, tags] = await Promise.all([
    listVaultFolders(user.id, workspace.id, activeProfileId),
    listVaultFiles(user.id, workspace.id, activeProfileId),
    listTransactionFilesForVault(user.id, workspace.id, activeProfileId),
    listVaultTags(user.id, workspace.id, activeProfileId),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <FilesPageClient
        folders={folders}
        files={files}
        txnFiles={txnFiles}
        tags={tags}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))}
        activeProfileId={activeProfileId ?? null}
        currency={workspace.currency}
        locale={workspace.locale}
        filesCapped={files.length >= VAULT_FILES_LIMIT}
      />
    </div>
  );
}
