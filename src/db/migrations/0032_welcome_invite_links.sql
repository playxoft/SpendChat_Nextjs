ALTER TABLE "users" ADD COLUMN "welcomed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD COLUMN "token" text;--> statement-breakpoint
CREATE INDEX "workspace_invites_token_idx" ON "workspace_invites" USING btree ("token");