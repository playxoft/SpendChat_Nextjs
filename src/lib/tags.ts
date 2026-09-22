import type { Tag } from "@/db/schema";

/**
 * Transaction tags: the shared palette, the wire/UI shape, and the pure helpers
 * both the server and the client need.
 *
 * Deliberately free of `server-only` and of any DB import beyond the row type —
 * the composer, the table cell and the settings manager are all client
 * components and import from here.
 *
 * That `import type` on the line above is load-bearing: drop the `type` keyword
 * and the whole Drizzle schema (and `drizzle-orm` with it) follows this module
 * into the client bundle.
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
 * Two producers, and they don't agree on the spelling: `serializeTxnTag` below
 * emits `…Z`, while the embed in `queries.ts` comes straight out of
 * `jsonb_build_object` and renders `…+00:00`. Both are valid ISO 8601 and both
 * parse in Dart and JS. The attachments embed beside it has the same split, so
 * this is the house behaviour rather than a new one — but don't write a client
 * that compares these strings byte-for-byte.
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

/**
 * Order a resolved tag list the way a read will return it.
 *
 * `tag_ids` stores the order the user picked, and `workspaceTagIds` preserves
 * it — but every read re-sorts by `lower(name)` (see the embed in
 * `queries.ts`), so pick order is written and never read back. An optimistic
 * row patch built in pick order therefore paints one order and then silently
 * rearranges when the revalidation lands; with more than three tags the table
 * clips to `3 + "+N"`, so the *set of visible chips* changes too.
 *
 * `lower()`, not `localeCompare`, to match the SQL rather than the browser.
 */
export function sortTagsByName<T extends { name: string }>(tags: T[]): T[] {
  return [...tags].sort((a, b) => {
    const x = a.name.toLowerCase();
    const y = b.name.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/**
 * Do two id lists hold the same tags, in any order?
 *
 * Order-insensitive on purpose. The array's order is real in the column and
 * unobservable everywhere else, so treating a reorder as a change made "Save
 * changes" light up for an edit nobody could see: untick a tag and tick it
 * again, and the form was dirty while the saved row would be identical.
 */
export function sameTagSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(a);
  return b.every((id) => seen.has(id));
}

/**
 * The tag picker's option model, as a pure function of what the user has typed
 * and what already exists.
 *
 * Extracted from the composer because it is the part that was wrong twice, and
 * the part nothing could test: the composer runs in a React tree and this repo's
 * vitest projects are both `environment: "node"` with no DOM harness, so the
 * component itself is only exercised by review and by running the app. This much
 * is arithmetic, and arithmetic can be pinned.
 *
 * The two mistakes it now encodes, both of which shipped and were caught in
 * review:
 *
 *  - **`activeIndex` is clamped, and stepping must start from the clamped
 *    value.** The raw index survives the list shrinking as the query narrows —
 *    highlight the third of three options, type another character until only two
 *    remain, and the raw index still says 2. Reading it directly highlights the
 *    wrong row (Enter then fires "Create" instead of the single visible match);
 *    stepping from it makes the first arrow press in either direction a no-op,
 *    because `(2+1) % 2` and `(2-1+2) % 2` are both 1.
 *  - **The create row is the last option**, so arrowing past the matches lands
 *    on it — which means it has to be counted in `optionCount`, not bolted on.
 *
 * `creatable` is false for an empty query (a bare "#" means "show me the list")
 * and for a name that already exists, case-insensitively, matching the database's
 * `lower(name)` unique index — offering "Create travel" next to an existing
 * "Travel" would promise something the server rejects.
 */
export type TagPickerModel<T extends { id: string; name: string }> = {
  results: T[];
  creatable: boolean;
  optionCount: number;
  /** The highlighted option, always within `[0, optionCount)` (0 when empty). */
  activeIndex: number;
  /** Whether `activeIndex` is the trailing "Create" row. */
  onCreateRow: boolean;
};

export function tagPickerModel<T extends { id: string; name: string }>({
  tags,
  query,
  applied,
  rawIndex,
}: {
  tags: T[];
  query: string;
  /** Ids already on the transaction — offering them again is a no-op. */
  applied: Iterable<string>;
  rawIndex: number;
}): TagPickerModel<T> {
  const appliedSet = applied instanceof Set ? applied : new Set(applied);
  const needle = query.toLowerCase();
  const trimmed = query.trim();
  const results = tags.filter(
    (t) => !appliedSet.has(t.id) && t.name.toLowerCase().includes(needle),
  );
  const creatable =
    trimmed.length > 0 && !tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  const optionCount = results.length + (creatable ? 1 : 0);
  const activeIndex = optionCount ? Math.min(Math.max(rawIndex, 0), optionCount - 1) : 0;
  return { results, creatable, optionCount, activeIndex, onCreateRow: creatable && activeIndex === results.length };
}

/** Step the picker's highlight, wrapping. Always called with the *clamped*
 *  index, which is what makes the first press after a shrinking list move. */
export function stepPickerIndex(activeIndex: number, optionCount: number, delta: 1 | -1): number {
  if (optionCount <= 0) return 0;
  return (activeIndex + delta + optionCount) % optionCount;
}
