ALTER TABLE "transactions" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "note";