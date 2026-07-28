ALTER TABLE "workspaces" ADD COLUMN "icon" text;--> statement-breakpoint
-- Backfill existing workspaces with the default emoji so every workspace shows
-- one (new workspaces are seeded with it in `createWorkspaceWithDefaults`).
UPDATE "workspaces" SET "icon" = '🏢' WHERE "icon" IS NULL;
