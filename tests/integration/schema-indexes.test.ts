import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "./helpers/test-db";

/**
 * Guards a class of bug rather than one instance of it.
 *
 * Drizzle's `.desc()` on an index column emits `DESC NULLS LAST`. SQL's
 * `ORDER BY x DESC` means `DESC NULLS FIRST`, and Postgres matches an index to a
 * sort on pathkeys that compare the null ordering **exactly** — it does not
 * reason "the column is NOT NULL, so this can't matter". So a `NULLS LAST`
 * index silently fails to satisfy the sort it was built for: it is still
 * created, still used for the leading-column lookup, and `EXPLAIN` still shows
 * the shape you expected, with the `Sort` hiding one level down. It cost
 * `transactions` 31,793 buffer reads a page instead of 164 before anyone
 * noticed, and `files` carried the same mistake for months after.
 *
 * Anything that wants `NULLS LAST` deliberately — an `ORDER BY x DESC NULLS
 * LAST` somewhere — should add itself to the allowlist with the query it serves.
 */
const DELIBERATE_NULLS_LAST: string[] = [];

describe("schema indexes", () => {
  it("has no DESC NULLS LAST index, which no ORDER BY of ours can use", async () => {
    const { rows } = await getTestDb().execute(sql`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public' and indexdef like '%DESC NULLS LAST%'
      order by indexname`);
    const offenders = rows
      .map((r) => String(r.indexname))
      .filter((name) => !DELIBERATE_NULLS_LAST.includes(name));
    expect(offenders).toEqual([]);
  });

  // Asserts the definitions, not just the names: an index called
  // `files_profile_created_idx` that happens to be keyed on `workspace_id`, or
  // sorted ascending, would satisfy a name check while serving nothing.
  // Postgres omits `NULLS FIRST` from `indexdef` because it is the default for
  // `DESC`, so the expected text below is what a correct one prints.
  it("indexes files by the column its reads actually scope to", async () => {
    const { rows } = await getTestDb().execute(sql`
      select indexname,
             regexp_replace(indexdef, '^.* USING ', '') as shape
      from pg_indexes
      where schemaname = 'public' and tablename = 'files'
      order by indexname`);
    expect(rows.map((r) => `${r.indexname}: ${r.shape}`)).toEqual([
      "files_folder_idx: btree (folder_id)",
      "files_pkey: btree (id)",
      "files_profile_created_idx: btree (profile_id, created_at DESC, id DESC)",
      "files_workspace_idx: btree (workspace_id)",
    ]);
  });
});
