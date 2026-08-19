-- Realign the transactions indexes with how the table is actually read.
--
-- Every read scopes to `profile_id` (workspace access), never to `user_id` —
-- which is attribution. The five indexes dropped here all lead with `user_id`
-- and four of them had never been scanned in production; they could not serve
-- the list/feed path at all, so it fell back to a sequential scan plus a sort.
--
-- Create before drop, so there is never a moment without a usable profile
-- index. `transactions_profile_idx` is redundant once the composite exists —
-- a leading-column prefix serves every lookup the single-column index did,
-- including the profile FK restrict check.
CREATE INDEX "transactions_profile_date_idx" ON "transactions" USING btree ("profile_id","occurred_on" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
DROP INDEX "transactions_profile_idx";--> statement-breakpoint
DROP INDEX "transactions_user_date_idx";--> statement-breakpoint
DROP INDEX "transactions_user_category_idx";--> statement-breakpoint
DROP INDEX "transactions_user_type_idx";--> statement-breakpoint
DROP INDEX "transactions_user_created_idx";
