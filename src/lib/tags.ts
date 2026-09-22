import type { Tag } from "@/db/schema";

/**
 * Transaction tags: the shared palette, the wire/UI shape, and the pure helpers
 * both the server and the client need.
 *
 * Deliberately free of `server-only` and of any DB import beyond the row type —
 * the composer, the table cell and the settings manager are all client
 * components and import from here.
 */

/**
 * The 20-swatch palette for tag colors.
 *
 * This is the app's one accent palette, shared with the files vault (which
 * re-exports it as `VAULT_COLORS` and also uses it for folder tints). It lives
 * here rather than in `lib/files.ts` because a transaction tag has nothing to do
 * with the vault, and a shared constant should not be owned by whichever feature
 * happened to need it first.
 *
 * Values are plain hex so the DB accepts any color — a future custom picker just
 * mints another hex and needs no migration (see `accentColorSchema`).
 */
export const TAG_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  "#64748b", // slate
  "#78716c", // stone
  "#737373", // neutral
] as const;

/**
 * The wire/UI shape for a transaction tag. Dates are ISO strings, because this
 * crosses the server/client boundary and a `Date` does not survive it.
 *
 * Named `TxnTagDTO`, not `TagDTO`, because the files vault already exports a
 * `TagDTO` for its own per-profile tags. The two are different entities in
 * different tables, and a file that touches both — `lib/queries.ts` does — would
 * otherwise have to alias one at every import.
 */
export type TxnTagDTO = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

const toISO = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export function serializeTxnTag(row: Tag): TxnTagDTO {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: toISO(row.createdAt),
    updatedAt: toISO(row.updatedAt),
  };
}

/**
 * The swatch a new tag opens on: derived from the name so the create popup is
 * pre-filled with something that already looks deliberate, and so two people
 * creating "Travel" in different workspaces land on the same color.
 *
 * Case- and space-insensitive, so "Travel", "travel" and " Travel " agree. It is
 * only a starting point — the user can pick any of the 20 before saving, and the
 * stored value is whatever they chose.
 */
export function defaultTagColor(name: string): string {
  const key = name.trim().toLowerCase();
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[hash % TAG_COLORS.length]!;
}
