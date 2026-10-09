CREATE TYPE "public"."billing_hold" AS ENUM('payment_failed', 'dispute');--> statement-breakpoint
CREATE TYPE "public"."billing_item" AS ENUM('plan', 'topup');--> statement-breakpoint
CREATE TYPE "public"."billing_period" AS ENUM('monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TABLE "ai_topups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"payment_id" text NOT NULL,
	"checkout_session_id" text,
	"buyer_user_id" uuid NOT NULL,
	"actions" integer NOT NULL,
	"remaining" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_topups_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "ai_topups_remaining_ck" CHECK ("ai_topups"."remaining" >= 0 and "ai_topups"."remaining" <= "ai_topups"."actions")
);
--> statement-breakpoint
CREATE TABLE "billing_checkout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"session_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"item" "billing_item" NOT NULL,
	"plan" "workspace_plan",
	"period" "billing_period",
	"product_id" text NOT NULL,
	"expected_amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"subscription_id" text,
	"payment_id" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_checkout_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "billing_payments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"payment_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"buyer_user_id" uuid,
	"kind" "billing_item" NOT NULL,
	"subscription_id" text,
	"checkout_session_id" text,
	"status" text NOT NULL,
	"total_amount_minor" bigint NOT NULL,
	"tax_minor" bigint,
	"currency" text NOT NULL,
	"invoice_url" text,
	"refunded_minor" bigint DEFAULT 0 NOT NULL,
	"disputed_at" timestamp with time zone,
	"dispute_status" text,
	"paid_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_payments_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"provider" text DEFAULT 'dodo' NOT NULL,
	"customer_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"checkout_session_id" text,
	"product_id" text NOT NULL,
	"plan" "workspace_plan" NOT NULL,
	"period" "billing_period" NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"next_billing_date" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"scheduled_plan" "workspace_plan",
	"scheduled_period" "billing_period",
	"scheduled_at" timestamp with time zone,
	"payment_failed_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_subscriptions_subscription_id_unique" UNIQUE("subscription_id")
);
--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD COLUMN "topup_units" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "purchases_blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "billing_hold" "billing_hold";--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "billing_hold_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "payment_grace_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_topups" ADD CONSTRAINT "ai_topups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_topups_workspace_idx" ON "ai_topups" USING btree ("workspace_id","expires_at");--> statement-breakpoint
CREATE INDEX "billing_checkout_sessions_workspace_idx" ON "billing_checkout_sessions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_checkout_sessions_buyer_idx" ON "billing_checkout_sessions" USING btree ("buyer_user_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_payments_workspace_idx" ON "billing_payments" USING btree ("workspace_id","paid_at");--> statement-breakpoint
CREATE INDEX "billing_payments_buyer_idx" ON "billing_payments" USING btree ("buyer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_subscriptions_live_uq" ON "workspace_subscriptions" USING btree ("workspace_id") WHERE "workspace_subscriptions"."status" in ('pending', 'active', 'on_hold', 'paused', 'past_due') and "workspace_subscriptions"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "workspace_subscriptions_workspace_idx" ON "workspace_subscriptions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "workspace_subscriptions_buyer_idx" ON "workspace_subscriptions" USING btree ("buyer_user_id","activated_at");