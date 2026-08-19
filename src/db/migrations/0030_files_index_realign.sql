-- Realign the `files` indexes with how the table is actually read.
--
-- The same two mistakes migration 0028 corrected on `transactions`, in the same
-- place, for the same reason.
--
-- 1. `files_workspace_created_idx` led with `workspace_id`, but the vault
--    listing (`listVaultFiles`) filters on `profile_id` — `workspace_id` is the
--    quota scope, not the read scope. Of every query on this table, only the
--    storage-quota sum filters on `workspace_id`, and it aggregates rather than
--    ordering, so nothing anywhere pairs `workspace_id` with a date. The
--    trailing `created_at` could never be used.
--
-- 2. It was `DESC NULLS LAST`, which is what Drizzle's `.desc()` emits, while
--    `ORDER BY x DESC` means `DESC NULLS FIRST`. The planner compares the null
--    ordering exactly, so even against the right leading column that index
--    could not have satisfied the listing's sort. Measured on 60,000 files in
--    one profile, a page of 500: the profile-led index sorted `NULLS FIRST`
--    plans as an index scan with no sort node at 22 buffer reads; sorted
--    `NULLS LAST` it falls back to a sequential scan and a top-N sort at 1,336,
--    which is also what the old workspace-led index did.
--
-- `files_profile_idx` goes because the new composite's leading column serves
-- everything it did — the profile-delete sweep, the tag detach, the file count,
-- and the `profile_id` FK cascade.
--
-- Create before drop, for the reason 0028 gives: `drizzle-kit migrate` runs the
-- whole file in one transaction, so nobody observes an intermediate state, but
-- lock duration is observable. `CREATE INDEX` holds SHARE (writes queue, reads
-- pass); `DROP INDEX` holds ACCESS EXCLUSIVE (reads block too) until commit.
-- Dropping first would hold that stronger lock across both builds, so every
-- vault read would block for the duration. The new names collide with neither
-- old one, so nothing forces the drops earlier. `IF EXISTS` keeps them
-- replayable on a database whose schema arrived via `db:push`.
CREATE INDEX "files_profile_created_idx" ON "files" USING btree ("profile_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "files_workspace_idx" ON "files" USING btree ("workspace_id");--> statement-breakpoint
DROP INDEX IF EXISTS "files_workspace_created_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "files_profile_idx";
