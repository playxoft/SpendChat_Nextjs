import type { Metadata } from "next";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { parseProfileScope, resolveProfileScope } from "@/lib/profile-scope";
import { getProfiles, getTrashBytes } from "@/lib/queries";
import { getStorageLimitBytes } from "@/lib/entitlements";
import { getVaultWorkingSet } from "@/services/files";
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
  // One profile, "all", or the sidebar's selection — expanded against the
  // profiles this viewer can see, and intersected with them again by every read.
  const scope = resolveProfileScope(parseProfileScope(sp.profile), profiles);
  const activeProfileId = scope.single;
  // A selection shows like "All profiles", over just the profiles in it; one
  // profile and "all" hand the vault every profile, as they always have.
  const inView = scope.multi ? new Set(scope.profileIds) : null;
  const shownProfiles = inView ? profiles.filter((p) => inView.has(p.id)) : profiles;

  // Exactly what `GET /api/v1/files` serves the Flutter app — one function, so
  // the two working sets can't drift.
  const [{ folders, files, transactionFiles, tags, storageUsedBytes, filesCapped }, trashBytes] =
    await Promise.all([
      getVaultWorkingSet(user.id, workspace.id, activeProfileId ?? scope.profileIds, {
        dedupeStorageRead: true,
      }),
      getTrashBytes(workspace.id),
    ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <FilesPageClient
        folders={folders}
        files={files}
        txnFiles={transactionFiles}
        tags={tags}
        profiles={shownProfiles.map((p) => ({ id: p.id, name: p.name, icon: p.icon, color: p.color }))}
        activeProfileId={activeProfileId ?? null}
        currency={workspace.currency}
        locale={workspace.locale}
        filesCapped={filesCapped}
        storageUsedBytes={storageUsedBytes}
        storageTrashBytes={trashBytes}
        storageLimitBytes={await getStorageLimitBytes(workspace.id)}
      />
    </div>
  );
}
