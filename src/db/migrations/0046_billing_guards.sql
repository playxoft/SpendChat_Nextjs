ALTER TABLE "billing_checkout_sessions" ADD COLUMN "email_key" text;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD COLUMN "status_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD COLUMN "dispute_event_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "billing_checkout_sessions_email_idx" ON "billing_checkout_sessions" USING btree ("email_key","created_at");