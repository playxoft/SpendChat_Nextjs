CREATE TYPE "public"."budget_period" AS ENUM('monthly');--> statement-breakpoint
CREATE TYPE "public"."budget_scope" AS ENUM('workspace', 'profile', 'category');--> statement-breakpoint
CREATE TABLE "budget_alerts" (
	"budget_id" uuid NOT NULL,
	"month" date NOT NULL,
	"threshold" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_alerts_budget_id_month_threshold_pk" PRIMARY KEY("budget_id","month","threshold"),
	CONSTRAINT "budget_alerts_threshold_ck" CHECK ("budget_alerts"."threshold" in (80, 100)),
	CONSTRAINT "budget_alerts_month_ck" CHECK (extract(day from "budget_alerts"."month") = 1)
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scope" "budget_scope" NOT NULL,
	"profile_id" uuid,
	"category_id" uuid,
	"amount_minor" bigint NOT NULL,
	"period" "budget_period" DEFAULT 'monthly' NOT NULL,
	"email_alerts" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_workspace_scope_uq" UNIQUE NULLS NOT DISTINCT("workspace_id","scope","period","profile_id","category_id"),
	CONSTRAINT "budgets_scope_target_ck" CHECK (("budgets"."scope" = 'workspace' and "budgets"."profile_id" is null and "budgets"."category_id" is null)
        or ("budgets"."scope" = 'profile' and "budgets"."profile_id" is not null and "budgets"."category_id" is null)
        or ("budgets"."scope" = 'category' and "budgets"."category_id" is not null and "budgets"."profile_id" is null)),
	CONSTRAINT "budgets_amount_positive_ck" CHECK ("budgets"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budgets_profile_idx" ON "budgets" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "budgets_category_idx" ON "budgets" USING btree ("category_id");