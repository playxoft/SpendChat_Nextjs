import { StorageRing } from "spendchat";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

// The ring changes tone as the workspace approaches its 1 GB quota.
export function Tones() {
  return (
    <div className="flex items-center gap-6">
      <StorageRing usedBytes={120 * MB} limitBytes={GB} />
      <StorageRing usedBytes={640 * MB} limitBytes={GB} />
      <StorageRing usedBytes={910 * MB} limitBytes={GB} />
      <StorageRing usedBytes={GB} limitBytes={GB} />
    </div>
  );
}

export function InToolbar() {
  return (
    <div className="flex w-72 items-center justify-between rounded-lg border px-3 py-2">
      <span className="text-sm font-medium">Vault</span>
      <StorageRing usedBytes={612 * MB} limitBytes={GB} />
    </div>
  );
}
