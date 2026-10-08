import "server-only";
import { isNotNull, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * The row half of "live" — the one condition every read of a trashable table
 * (`transactions`, `files`, `folders`, `profiles`) carries.
 *
 * Live means two things, enforced in two places:
 *  - **the row itself** is not in the trash — this helper. `buildConditions` in
 *    `lib/queries.ts` applies it first, so every transaction read built from it
 *    (list, feed, counts, totals, breakdown, search, export) has it already;
 *  - **its profile** is not in the trash — the access layer
 *    (`accessibleProfileIds` / `getEffectiveProfileRole` in `lib/workspaces.ts`)
 *    skips trashed profiles, so a trashed profile's rows vanish from every read
 *    and write that scopes through it, with no per-query change.
 *
 * Built fresh on every call rather than shared as a constant: Drizzle rewrites
 * some SQL chunks in place when it renders a set operation (see `cursorOrder`
 * in `queries.ts`), and a shared object would come back mutated.
 *
 * It renders as the literal `"t"."deleted_at" is null`, which is what lets the
 * planner prove the partial `transactions_profile_date_idx` applies. Never
 * replace it with a parameter or a `coalesce` — the index would silently stop
 * being used.
 *
 * **Stable export**: budgets (phase 8) and anything else that reads
 * transactions imports `notTrashed(transactions)` by this name.
 */
export function notTrashed(table: { deletedAt: AnyPgColumn }): SQL {
  return isNull(table.deletedAt);
}

/** The opposite: rows that are in the trash (the trash list, restore, purge). */
export function trashedOnly(table: { deletedAt: AnyPgColumn }): SQL {
  return isNotNull(table.deletedAt);
}
