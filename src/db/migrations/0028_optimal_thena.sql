-- Realign the transactions indexes with how the table is actually read.
--
-- Every read scopes to `profile_id` (workspace access), never to `user_id` —
-- which is attribution. Four of the five indexes dropped here lead with
-- `user_id`: enumerating every query against the table finds exactly one that
-- filters on `user_id` alone (the account-deletion sweep), and it is served by
-- the kept `transactions_user_profile_idx`. Nothing filters on `user_id` plus
-- date, category, type or created_at, so those four could never serve the
-- list/feed path — it fell back to a sequential scan plus a sort. The fifth,
-- `transactions_profile_idx`, is simply redundant once the composite exists: a
-- leading-column prefix serves every lookup it did, the FK check included.
--
-- `NULLS FIRST` on the new index is load-bearing. `ORDER BY x DESC` means
-- `DESC NULLS FIRST` in SQL, and the planner matches an index to a sort on
-- pathkeys that compare the null ordering exactly, regardless of the column
-- being NOT NULL. A `DESC NULLS LAST` index here still gets used for the
-- `profile_id` lookup and still shows a `Merge Append`, but sorts underneath it.
--
-- The first drop is a no-op on any database that never saw the earlier,
-- wrong-null-ordering version of this migration; it is here so a branch that did
-- gets rebuilt rather than silently keeping an index the planner won't sort on.
--
-- Create before drop: `drizzle-kit migrate` runs the whole file in one
-- transaction, so nobody observes an intermediate state — but lock duration is
-- observable. `CREATE INDEX` holds SHARE (writes queue, reads pass), while
-- `DROP INDEX` holds ACCESS EXCLUSIVE (reads block too). Dropping first would
-- hold that stronger lock across the entire index build. `IF EXISTS` keeps the
-- drops replayable on a database whose schema arrived via `db:push`.
--
-- On a large `transactions` table the build is long enough to matter: prefer
-- `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY` by hand and then
-- record this migration, rather than letting the transaction hold locks.
DROP INDEX IF EXISTS "transactions_profile_date_idx";--> statement-breakpoint
CREATE INDEX "transactions_profile_date_idx" ON "transactions" USING btree ("profile_id","occurred_on" DESC NULLS FIRST,"created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
DROP INDEX IF EXISTS "transactions_profile_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "transactions_user_date_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "transactions_user_category_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "transactions_user_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "transactions_user_created_idx";
