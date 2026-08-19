-- Realign the vault's two tables with how they are actually read.
--
-- The `/files` page builds its working set from `files` and
-- `transaction_attachments` in one `Promise.all`, so it is only as fast as the
-- slower of the two. Both carried the same pair of mistakes migration 0028
-- corrected on `transactions`.
--
-- 1. **Wrong leading column.** `files_workspace_created_idx` and
--    `txn_attachments_workspace_idx` both led with `workspace_id`, but both
--    listings filter on `profile_id` — `workspace_id` is the quota scope, not
--    the read scope. Of every query on either table, only the storage-quota sum
--    filters on `workspace_id`, and it aggregates rather than ordering, so
--    nothing anywhere pairs `workspace_id` with a date. Those trailing
--    `created_at` columns could never be used, and the "per-workspace listing"
--    the attachments one named does not exist.
--
-- 2. **Wrong null ordering.** `DESC NULLS LAST` is what Drizzle's `.desc()`
--    emits; `ORDER BY x DESC` means `DESC NULLS FIRST`, and the planner compares
--    the two exactly. Measured on 60,000 files in one profile, a page of 500:
--    the profile-led index sorted `NULLS FIRST` plans as an index scan with no
--    sort node at 22 buffer reads; sorted `NULLS LAST` it falls back to a
--    sequential scan and a top-N sort at 1,336 — the same as the workspace-led
--    index it replaces. That is the trap: it looks built and used either way.
--
-- `files_profile_idx` and `txn_attachments_profile_idx` go because the new
-- composites' leading column serves everything they did.
--
-- **Ordering.** `drizzle-kit migrate` runs the whole file in one transaction, so
-- nobody observes an intermediate state — but lock duration is observable.
-- `CREATE INDEX` holds SHARE (writes queue, reads pass); `DROP INDEX` holds
-- ACCESS EXCLUSIVE (reads block too) until commit. The leading drops are
-- therefore kept to what has to be dropped: `txn_attachments_workspace_idx` is
-- rebuilt under its own name and cannot be created around, and the three new
-- names are dropped first only so a database whose schema arrived via
-- `db:push` — which already holds them, possibly with the wrong null ordering —
-- rebuilds rather than colliding. On such a database those are real drops and
-- do take the stronger lock; everywhere else they are no-ops that take nothing.
-- The retired indexes are dropped last, after the builds.
--
-- On a large table the build is long enough to matter: prefer
-- `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY` by hand and then
-- record this migration, rather than letting the transaction hold locks.
DROP INDEX IF EXISTS "files_profile_created_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "files_workspace_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "txn_attachments_profile_created_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "txn_attachments_workspace_idx";--> statement-breakpoint
CREATE INDEX "files_profile_created_idx" ON "files" USING btree ("profile_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "files_workspace_idx" ON "files" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "txn_attachments_profile_created_idx" ON "transaction_attachments" USING btree ("profile_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "txn_attachments_workspace_idx" ON "transaction_attachments" USING btree ("workspace_id");--> statement-breakpoint
DROP INDEX IF EXISTS "files_workspace_created_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "files_profile_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "txn_attachments_profile_idx";
