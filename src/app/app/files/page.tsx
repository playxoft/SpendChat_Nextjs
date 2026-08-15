import type { Metadata } from "next";
import { getCurrentWorkspace, requireUser } from "@/lib/auth";
import { resolveWebProfile } from "@/lib/filters";
import { getProfiles } from "@/lib/queries";
import { STORAGE_QUOTA_BYTES } from "@/lib/validation";
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
  const activeProfileId = resolveWebProfile(sp.profile ?? null, profiles[0]?.id);

  // Exactly what `GET /api/v1/files` serves the Flutter app — one function, so
  // the two working sets can't drift.
  const { folders, files, transactionFiles, tags, storageUsedBytes, filesCapped } =
    await getVaultWorkingSet(user.id, workspace.id, activeProfileId, {
      dedupeStorageRead: true,
    });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <FilesPageClient
        folders={folders}
        files={files}
        txnFiles={transactionFiles}
        tags={tags}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))}
        activeProfileId={activeProfileId ?? null}
        currency={workspace.currency}
        locale={workspace.locale}
        filesCapped={filesCapped}
        storageUsedBytes={storageUsedBytes}
        storageLimitBytes={STORAGE_QUOTA_BYTES}
      />
    </div>
  );
}
