/**
 * Putting rows restored from the trash back into a list already on screen —
 * the bulk Undo. Pure and client-safe; the rows come from
 * `loadRestoredTransactions`, which already applied the view's filters.
 *
 * Only rows that fall **inside the loaded stretch** go back in: one that sorts
 * past the last loaded row isn't placed (there may be unloaded rows between),
 * it simply turns up when that part loads — same as any other row. When the
 * list is complete (nothing more to load), every restored row has its place.
 */

type Row = {
  id: string;
  type: "income" | "expense";
  amountMinor: number;
  occurredOn: string;
  createdAt: Date | string;
  title: string | null;
  description: string | null;
  categoryName: string | null;
};

export type ListSort = {
  sort?: "date" | "category" | "title" | "description" | "amount";
  dir?: "asc" | "desc";
};

const time = (d: Date | string) => (d instanceof Date ? d.getTime() : Date.parse(d));

/** The feed's order, oldest first: (occurredOn, createdAt, id) ascending. */
export function feedCompare(a: Row, b: Row): number {
  return (
    a.occurredOn.localeCompare(b.occurredOn) ||
    time(a.createdAt) - time(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/** Nulls last, then a plain comparison — strings case-insensitively. */
function compareValues(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

/**
 * The table's order for a sort — mirroring `orderByFor` in `queries.ts`: the
 * column in its direction, then `createdAt` and `id` newest first. No sort is
 * newest first by date.
 */
export function listCompare({ sort, dir }: ListSort): (a: Row, b: Row) => number {
  const tiebreak = (a: Row, b: Row) => time(b.createdAt) - time(a.createdAt) || b.id.localeCompare(a.id);
  if (!sort) {
    return (a, b) => b.occurredOn.localeCompare(a.occurredOn) || tiebreak(a, b);
  }
  const value = (r: Row): string | number | null =>
    sort === "date"
      ? r.occurredOn
      : sort === "category"
        ? r.categoryName
        : sort === "title"
          ? r.title
          : sort === "description"
            ? r.description
            : r.type === "income"
              ? r.amountMinor
              : -r.amountMinor;
  const sign = dir === "asc" ? 1 : -1;
  return (a, b) => sign * compareValues(value(a), value(b)) || tiebreak(a, b);
}

/**
 * `rows` with `restored` merged in by `compare`, skipping any already there,
 * and — unless `complete` — any that would sort after the last loaded row.
 */
export function mergeRestored<T extends Row>(
  rows: T[],
  restored: T[],
  compare: (a: Row, b: Row) => number,
  complete: boolean,
): T[] {
  const have = new Set(rows.map((r) => r.id));
  const last = rows.at(-1);
  const fits = restored.filter(
    (r) => !have.has(r.id) && (complete || !last || compare(r, last) <= 0),
  );
  if (fits.length === 0) return rows;
  return [...rows, ...fits].sort(compare);
}

/**
 * The feed holds the newest stretch of history, oldest first; older rows load
 * as you scroll up. So the boundary is at the *start*: a restored row older
 * than the oldest loaded one is left for that scroll, unless the feed has
 * reached the beginning (`complete`).
 */
export function mergeRestoredIntoFeed<T extends Row>(rows: T[], restored: T[], complete: boolean): T[] {
  const have = new Set(rows.map((r) => r.id));
  const first = rows[0];
  const fits = restored.filter(
    (r) => !have.has(r.id) && (complete || !first || feedCompare(r, first) >= 0),
  );
  if (fits.length === 0) return rows;
  return [...rows, ...fits].sort(feedCompare);
}
