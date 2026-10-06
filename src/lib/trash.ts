/**
 * Trash rules that both the server and the UI need — pure and client-safe.
 *
 * Deleted transactions (every plan), files and folders (Plus/Pro) and whole
 * profiles go to the trash for `TRASH_DAYS`, then a daily purge removes them
 * for good (`lib/trash-purge.ts`). Because the purge runs once a day, an item
 * can outlive its 30 days by up to a day; until it is actually purged it can
 * still be restored.
 */
import { TRASH_DAYS } from "@/lib/plans";

export { TRASH_DAYS };

const DAY_MS = 86_400_000;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** When an item deleted at `deletedAt` becomes eligible for the purge. */
export function purgeAt(deletedAt: Date | string): Date {
  return new Date(toDate(deletedAt).getTime() + TRASH_DAYS * DAY_MS);
}

/** Items deleted before this instant are due for the purge at `now`. */
export function trashCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - TRASH_DAYS * DAY_MS);
}

/**
 * The countdown a trash row shows: whole days until it is purged, rounded up
 * (an item with 26.2 days left says 27), and the label for it.
 */
export function trashCountdown(
  deletedAt: Date | string,
  now: Date = new Date(),
): { days: number; label: string } {
  const left = purgeAt(deletedAt).getTime() - now.getTime();
  const days = Math.max(0, Math.ceil(left / DAY_MS));
  if (days === 0) return { days, label: "Deletes today" };
  if (days === 1) return { days, label: "Deletes tomorrow" };
  return { days, label: `Deletes in ${days} days` };
}

const RESTORED = " (restored)";

/**
 * A name for something restored into a place where its old name is now taken
 * (profiles are unique per workspace, folders per parent). Tries "Name
 * (restored)", then "Name (restored 2)", … — each trimmed so the whole thing
 * fits in `max` characters. `isTaken` decides what "taken" means (exact for
 * profiles, case-insensitive for folders). Returns `name` itself when it's free.
 */
export function restoredName(
  name: string,
  max: number,
  isTaken: (candidate: string) => boolean,
): string {
  if (!isTaken(name)) return name;
  for (let n = 1; n < 1000; n++) {
    const suffix = n === 1 ? RESTORED : ` (restored ${n})`;
    const base = name.slice(0, Math.max(1, max - suffix.length)).trimEnd();
    const candidate = `${base}${suffix}`.slice(0, max);
    if (!isTaken(candidate)) return candidate;
  }
  // A thousand collisions isn't a real workspace; fall back to something unique.
  return `${name.slice(0, Math.max(1, max - 9))} ${Date.now().toString(36).slice(-8)}`.slice(0, max);
}

/** What the trash holds, by kind — the shape restore/delete/empty report back. */
export type TrashCounts = {
  transactions: number;
  files: number;
  folders: number;
  profiles: number;
};

export const EMPTY_TRASH_COUNTS: TrashCounts = {
  transactions: 0,
  files: 0,
  folders: 0,
  profiles: 0,
};

/** "3 transactions, 1 file" — the parts that aren't zero, for toasts and dialogs. */
export function describeTrashCounts(c: TrashCounts): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n.toLocaleString("en-US")} ${n === 1 ? one : many}`);
  };
  add(c.transactions, "transaction", "transactions");
  add(c.files, "file", "files");
  add(c.folders, "folder", "folders");
  add(c.profiles, "profile", "profiles");
  return parts.join(", ");
}

/** A trashed vault folder, as the trash lists it: the folder that was deleted,
 * with the size of everything that went to the trash with it. */
export type TrashedFolderDTO = {
  id: string;
  profileId: string;
  profileName: string | null;
  profileIcon: string | null;
  name: string;
  color: string | null;
  /** Subfolders and files that went to the trash with it (restored with it). */
  folders: number;
  files: number;
  sizeBytes: number;
  deletedAt: string;
  deletedByName: string | null;
  purgeAt: string;
  /** Whether the caller may restore or delete it (editor on its profile). */
  canRestore: boolean;
};

/** A trashed vault file that was deleted on its own (not inside a trashed folder). */
export type TrashedFileDTO = {
  id: string;
  profileId: string;
  profileName: string | null;
  profileIcon: string | null;
  folderId: string | null;
  name: string;
  contentType: string;
  sizeBytes: number;
  deletedAt: string;
  deletedByName: string | null;
  purgeAt: string;
  canRestore: boolean;
};

/** A trashed profile (workspace admins): everything in it comes back with it. */
export type TrashedProfileDTO = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  spaceId: string;
  spaceName: string | null;
  /** Live transactions and files inside it — what a restore brings back. */
  transactions: number;
  files: number;
  sizeBytes: number;
  deletedAt: string;
  deletedByName: string | null;
  purgeAt: string;
};

/** What to restore or delete for good, by kind. */
export type TrashSelection = {
  transactionIds?: string[];
  fileIds?: string[];
  folderIds?: string[];
  profileIds?: string[];
};

/** `<deletedAt ISO>_<id>` — the trash list's keyset cursor (parsed back by
 * `trashCursorSchema` in `validation.ts`). ISO keeps the millisecond, which is
 * all `deleted_at` holds. */
export function encodeTrashCursor(cursor: { deletedAt: Date; id: string }): string {
  return `${cursor.deletedAt.toISOString()}_${cursor.id}`;
}
