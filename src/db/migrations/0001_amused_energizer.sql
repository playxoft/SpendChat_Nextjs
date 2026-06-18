ALTER TABLE "categories" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "id" SET DEFAULT uuidv7();