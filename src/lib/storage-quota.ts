import "server-only";
import { formatFileSize } from "@/lib/attachments";
import { getWorkspaceEntitlements, storageFullMessage, upgradeForLimit } from "@/lib/entitlements";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getTrashBytes, getWorkspaceStorageUsage } from "@/lib/queries";

/**
 * Reject an upload batch that would push the workspace past its plan's storage
 * (`PLAN_LIMITS[plan].storageBytes` — 1 / 5 / 20 GB, covering vault files +
 * transaction attachments). Called from the upload services after per-file
 * validation, so a too-big single file still gets its more specific 5 MB
 * message first.
 *
 * A workspace already over its limit (after a downgrade)
 * keeps every file — this only refuses *new* bytes (abuse rule C7).
 *
 * The used total includes the trash — trashed files and the receipts of
 * trashed transactions count until they're purged (abuse rule C6), or the
 * trash would be free storage. The refusal says how much emptying it frees.
 *
 * The check is read-then-insert without a lock: two concurrent uploads can
 * both pass and briefly overshoot the quota. Accepted for a product cap
 * (same stance as the attachment count cap) — the next upload is rejected.
 *
 * The error keeps its own `storage_quota_exceeded` code and 413 status (what
 * clients already handle); `details` carries the plan fields a `plan_limit`
 * error has, so a client can offer the upgrade.
 */
export async function assertStorageQuota(
  workspaceId: string,
  incomingBytes: number,
): Promise<void> {
  const [ent, usedBytes] = await Promise.all([
    getWorkspaceEntitlements(workspaceId),
    getWorkspaceStorageUsage(workspaceId),
  ]);
  const limitBytes = ent.limits.storageBytes;
  if (usedBytes + incomingBytes <= limitBytes) return;

  const remaining = Math.max(0, limitBytes - usedBytes);
  logger.warn(
    `Upload of ${formatFileSize(incomingBytes)} rejected — the workspace has ${formatFileSize(remaining)} of its ${formatFileSize(limitBytes)} storage left`,
    {
      event: "storage.quota_exceeded",
      usedBytes,
      incomingBytes,
      limitBytes,
      plan: ent.plan,
    },
  );
  // Only on the reject path: how much of the used storage is sitting in the
  // trash (it counts until purged — abuse rule C6), for the message.
  const trashBytes = await getTrashBytes(workspaceId);
  throw new ApiError(413, "storage_quota_exceeded", storageFullMessage(ent, usedBytes, incomingBytes, trashBytes), {
    limit: "storage",
    plan: ent.plan,
    max: limitBytes,
    used: usedBytes,
    upgradeTo: upgradeForLimit(ent.plan, "storageBytes"),
    trashBytes,
  });
}
