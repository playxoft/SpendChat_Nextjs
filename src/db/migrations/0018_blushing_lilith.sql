CREATE TYPE "public"."attachment_kind" AS ENUM('receipt', 'bill', 'invoice', 'other');--> statement-breakpoint
CREATE TABLE "transaction_attachments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"file_name" varchar(200) NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"kind" "attachment_kind",
	"label" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction_attachments" ADD CONSTRAINT "transaction_attachments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_attachments" ADD CONSTRAINT "transaction_attachments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_attachments" ADD CONSTRAINT "transaction_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "txn_attachments_txn_idx" ON "transaction_attachments" USING btree ("transaction_id","created_at");--> statement-breakpoint
CREATE INDEX "txn_attachments_profile_idx" ON "transaction_attachments" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "txn_attachments_workspace_idx" ON "transaction_attachments" USING btree ("workspace_id","created_at");