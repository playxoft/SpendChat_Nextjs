ALTER TABLE "categories" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;
