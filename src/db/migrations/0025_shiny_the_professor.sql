-- Pre-truncate any values longer than the new caps so the type change can't
-- fail on existing rows (labels, so a hard cut is acceptable).
UPDATE "file_tags" SET "name" = left("name", 20) WHERE char_length("name") > 20;--> statement-breakpoint
UPDATE "folders" SET "name" = left("name", 40) WHERE char_length("name") > 40;--> statement-breakpoint
ALTER TABLE "file_tags" ALTER COLUMN "name" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "folders" ALTER COLUMN "name" SET DATA TYPE varchar(40);
