CREATE TABLE "billing_request_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_trial_ledger" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email_key" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subscription_id" text NOT NULL,
	"customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_trial_ledger_subscription_id_unique" UNIQUE("subscription_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ALTER COLUMN "buyer_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD COLUMN "refunds" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD COLUMN "cancel_wanted" text;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD COLUMN "change_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD COLUMN "recurring_amount_minor" bigint;--> statement-breakpoint
CREATE INDEX "billing_request_log_user_created_idx" ON "billing_request_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_trial_ledger_email_idx" ON "billing_trial_ledger" USING btree ("email_key","created_at");