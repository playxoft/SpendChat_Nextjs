import "server-only";
import { formatFileSize } from "@/lib/attachments";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getWorkspaceStorageUsage } from "@/lib/queries";
import { STORAGE_QUOTA_BYTES } from "@/lib/validation";

/**
 * Reject an upload batch that would push the workspace past its storage quota
 * (`STORAGE_QUOTA_BYTES`, covering vault files + transaction attachments).
 * Called from the upload services after per-file validation, so a too-big
 * single file still gets its more specific 5 MB message first.
 *
 * The check is read-then-insert without a lock: two concurrent uploads can
 * both pass and briefly overshoot the quota. Accepted for a product cap
 * (same stance as the attachment count cap) — the next upload is rejected.
 */
export async function assertStorageQuota(
  workspaceId: string,
  incomingBytes: number,
): Promise<void> {
  const usedBytes = await getWorkspaceStorageUsage(workspaceId);
  if (usedBytes + incomingBytes <= STORAGE_QUOTA_BYTES) return;

  const remaining = Math.max(0, STORAGE_QUOTA_BYTES - usedBytes);
  logger.warn(
    `Upload of ${formatFileSize(incomingBytes)} rejected — the workspace has ${formatFileSize(remaining)} of its ${formatFileSize(STORAGE_QUOTA_BYTES)} storage left`,
    {
      event: "storage.quota_exceeded",
      usedBytes,
      incomingBytes,
      limitBytes: STORAGE_QUOTA_BYTES,
    },
  );
  throw new ApiError(
    413,
    "storage_quota_exceeded",
    remaining <= 0
      ? `The workspace's ${formatFileSize(STORAGE_QUOTA_BYTES)} storage is full — delete some files to free up space`
      : `Not enough storage left — this upload needs ${formatFileSize(incomingBytes)} but only ${formatFileSize(remaining)} of the ${formatFileSize(STORAGE_QUOTA_BYTES)} quota remains`,
  );
}
