DROP INDEX "profiles_workspace_name_uq";--> statement-breakpoint
DROP INDEX "transactions_profile_date_idx";--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "deleted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "deleted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "deleted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "deleted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
CREATE INDEX "files_trash_idx" ON "files" USING btree ("profile_id","deleted_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "files"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "transactions_profile_idx" ON "transactions" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "transactions_trash_idx" ON "transactions" USING btree ("profile_id","deleted_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "transactions"."deleted_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_workspace_name_uq" ON "profiles" USING btree ("workspace_id","name") WHERE "profiles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "transactions_profile_date_idx" ON "transactions" USING btree ("profile_id","occurred_on" DESC NULLS FIRST,"created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "transactions"."deleted_at" is null;