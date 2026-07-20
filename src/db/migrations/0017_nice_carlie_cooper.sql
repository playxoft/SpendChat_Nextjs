-- Narrow title/description to the app's shared caps (TRANSACTION_TITLE_MAX /
-- TRANSACTION_DESCRIPTION_MAX). `USING left(...)` truncates any legacy value
-- that predates the 3.0.0 limit tightening so the type change can't fail on
-- existing data (NULLs pass through unchanged). left() keeps the first N chars.
ALTER TABLE "transactions" ALTER COLUMN "title" SET DATA TYPE varchar(40) USING left("title", 40);--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "description" SET DATA TYPE varchar(150) USING left("description", 150);