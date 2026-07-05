-- Backfill: canonicalize existing emails to lowercase before enforcing uniqueness.
UPDATE "users" SET "email" = lower("email") WHERE "email" IS NOT NULL AND "email" <> lower("email");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));