ALTER TYPE "public"."budget_scope" ADD VALUE 'space';--> statement-breakpoint
ALTER TABLE "budgets" DROP CONSTRAINT "budgets_workspace_scope_uq";--> statement-breakpoint
ALTER TABLE "budgets" DROP CONSTRAINT "budgets_scope_target_ck";--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "space_id" uuid;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "title" varchar(60) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "description" varchar(140);--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budgets_space_idx" ON "budgets" USING btree ("space_id");--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_workspace_scope_uq" UNIQUE NULLS NOT DISTINCT("workspace_id","scope","period","profile_id","category_id","space_id");--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_scope_target_ck" CHECK (("budgets"."scope"::text = 'workspace' and "budgets"."profile_id" is null and "budgets"."category_id" is null and "budgets"."space_id" is null)
        or ("budgets"."scope"::text = 'profile' and "budgets"."profile_id" is not null and "budgets"."category_id" is null and "budgets"."space_id" is null)
        or ("budgets"."scope"::text = 'category' and "budgets"."category_id" is not null and "budgets"."profile_id" is null and "budgets"."space_id" is null)
        or ("budgets"."scope"::text = 'space' and "budgets"."space_id" is not null and "budgets"."profile_id" is null and "budgets"."category_id" is null));--> statement-breakpoint
-- ── Hand-written: back-fill budget titles ─────────────────────────────────
-- Budgets made before titles existed get the title a new one would be offered
-- (`suggestedBudgetTitle` in src/lib/budgets.ts): "All spending this month",
-- "<profile> this month", "<category> this month". Only rows still on the
-- column's empty default are touched, so re-running it changes nothing.
-- `scope::text`, not the enum: this migration also adds a value to it.
UPDATE "budgets" AS b
SET "title" = left(
  CASE b."scope"::text
    WHEN 'workspace' THEN 'All spending this month'
    WHEN 'profile' THEN coalesce((SELECT p."name" FROM "profiles" p WHERE p."id" = b."profile_id"), 'Profile') || ' this month'
    WHEN 'category' THEN coalesce((SELECT c."name" FROM "categories" c WHERE c."id" = b."category_id"), 'Category') || ' this month'
    ELSE 'Budget'
  END,
  60
)
WHERE b."title" = '';
