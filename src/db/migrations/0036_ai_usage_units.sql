ALTER TABLE "ai_usage_log" ADD COLUMN "units" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD COLUMN "plan" "workspace_plan";--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD COLUMN "audio_ms" integer;--> statement-breakpoint
CREATE INDEX "ai_usage_log_workspace_created_idx" ON "ai_usage_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_log_owner_created_idx" ON "ai_usage_log" USING btree ("owner_id","created_at");--> statement-breakpoint
-- Backfill (hand-written): stamp existing rows with their workspace's owner and
-- plan, so this month's usage counts the same way new rows will. Rows of a
-- workspace that no longer exists keep nulls (nothing left to read them from).
UPDATE "ai_usage_log" l
SET "owner_id" = w."owner_id", "plan" = w."plan"
FROM "workspaces" w
WHERE w."id" = l."workspace_id";
