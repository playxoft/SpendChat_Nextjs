ALTER TABLE "ai_usage_log" ADD COLUMN "units" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD COLUMN "plan" "workspace_plan";--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD COLUMN "audio_ms" integer;--> statement-breakpoint
CREATE INDEX "ai_usage_log_workspace_created_idx" ON "ai_usage_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_log_owner_created_idx" ON "ai_usage_log" USING btree ("owner_id","created_at");--> statement-breakpoint
-- Backfill (hand-written): stamp existing rows with their workspace's owner and
-- plan for the audit trail, and charge them 0 actions. They were made before
-- the monthly allowance existed — under the old hourly cap only — so they
-- must not spend the allowance on the day it starts: everyone begins the
-- month with their plan's full allowance. (The hourly cap counts rows, not
-- units, so it still sees them.) Rows of a workspace that no longer exists
-- keep null owner/plan.
UPDATE "ai_usage_log" SET "units" = 0;
--> statement-breakpoint
UPDATE "ai_usage_log" l
SET "owner_id" = w."owner_id", "plan" = w."plan"
FROM "workspaces" w
WHERE w."id" = l."workspace_id";
