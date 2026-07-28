/**
 * Author identity presentation for shared workspaces — used by the tracker chat
 * bubbles and the transactions table's "User" column to show who entered a row.
 *
 * Plain module (no `server-only`): imported by client components.
 */

/**
 * A stable text-color class for a user's name. WhatsApp-group-chat style: each
 * participant keeps a consistent color so authors are distinguishable at a
 * glance. Deterministic on the user id, so the same person is always the same
 * color across pages and reloads without threading a member→color map. The
 * palette deliberately excludes emerald (reserved for income amounts, see
 * `amountToneClass`) and plain foreground, and every entry is tuned for both
 * light and dark bubble/table backgrounds.
 */
const AUTHOR_COLORS = [
  "text-rose-600 dark:text-rose-400",
  "text-sky-600 dark:text-sky-400",
  "text-violet-600 dark:text-violet-400",
  "text-amber-600 dark:text-amber-400",
  "text-teal-600 dark:text-teal-400",
  "text-fuchsia-600 dark:text-fuchsia-400",
  "text-indigo-600 dark:text-indigo-400",
  "text-cyan-600 dark:text-cyan-400",
  "text-orange-600 dark:text-orange-400",
  "text-blue-600 dark:text-blue-400",
] as const;

export function authorColorClass(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    // djb2-ish; `| 0` keeps it a 32-bit int so the value stays stable.
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return AUTHOR_COLORS[Math.abs(hash) % AUTHOR_COLORS.length]!;
}

/**
 * The label to show for an author: their name, else the local-part of their
 * email, else a neutral fallback. Both `name` and `email` can be null (a user
 * synced from Firebase without those claims).
 */
export function authorDisplayName(name: string | null, email: string | null): string {
  return name?.trim() || email?.split("@")[0]?.trim() || "Unknown";
}
