CREATE TYPE "public"."invoice_discount_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."invoice_kind" AS ENUM('invoice', 'quote');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'void');--> statement-breakpoint
CREATE TABLE "invoice_clients" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(160),
	"address" varchar(400),
	"tax_id" varchar(60),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"workspace_id" uuid NOT NULL,
	"kind" "invoice_kind" NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_counters_workspace_id_kind_pk" PRIMARY KEY("workspace_id","kind"),
	CONSTRAINT "invoice_counters_last_number_ck" CHECK ("invoice_counters"."last_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"description" varchar(300) DEFAULT '' NOT NULL,
	"quantity" numeric(14, 4) NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "invoice_items_amounts_ck" CHECK ("invoice_items"."quantity" >= 0 and "invoice_items"."unit_price_minor" >= 0 and "invoice_items"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_sellers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"address" varchar(400),
	"contact" varchar(160),
	"tax_id" varchar(60),
	"upi_id" varchar(100),
	"logo_key" text,
	"logo_content_type" text,
	"logo_size_bytes" bigint,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_shares" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" "invoice_kind" NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"number" varchar(40),
	"number_seq" integer,
	"quote_title" varchar(16) DEFAULT 'quotation' NOT NULL,
	"client_id" uuid,
	"client_name" varchar(120) DEFAULT '' NOT NULL,
	"client_email" varchar(160),
	"client_address" varchar(400),
	"client_tax_id" varchar(60),
	"seller_id" uuid,
	"seller_name" varchar(120) DEFAULT '' NOT NULL,
	"seller_address" varchar(400),
	"seller_contact" varchar(160),
	"seller_tax_id" varchar(60),
	"upi_id" varchar(100),
	"issue_date" date NOT NULL,
	"due_date" date,
	"currency" text NOT NULL,
	"discount_type" "invoice_discount_type" DEFAULT 'percent' NOT NULL,
	"discount_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"discount_fixed_minor" bigint DEFAULT 0 NOT NULL,
	"tax_label" varchar(24),
	"tax_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint DEFAULT 0 NOT NULL,
	"notes" varchar(2000),
	"terms" varchar(2000),
	"template" varchar(24) DEFAULT 'classic' NOT NULL,
	"show_credit" boolean DEFAULT true NOT NULL,
	"pdf_key" text,
	"pdf_size_bytes" bigint,
	"source_quote_id" uuid,
	"import_key" varchar(64),
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"paid_on" date,
	"paid_transaction_id" uuid,
	"paid_amount_minor" bigint,
	"voided_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_ck" CHECK (("invoices"."status" = 'draft') = ("invoices"."number_seq" is null) and ("invoices"."number_seq" is null) = ("invoices"."number" is null)),
	CONSTRAINT "invoices_quote_not_paid_ck" CHECK (not ("invoices"."kind" = 'quote' and "invoices"."status" = 'paid')),
	CONSTRAINT "invoices_amounts_ck" CHECK ("invoices"."subtotal_minor" >= 0 and "invoices"."discount_minor" >= 0 and "invoices"."tax_minor" >= 0 and "invoices"."total_minor" >= 0 and "invoices"."discount_fixed_minor" >= 0),
	CONSTRAINT "invoices_quote_title_ck" CHECK ("invoices"."quote_title" in ('quotation', 'estimate'))
);
--> statement-breakpoint
ALTER TABLE "invoice_clients" ADD CONSTRAINT "invoice_clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_clients" ADD CONSTRAINT "invoice_clients_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sellers" ADD CONSTRAINT "invoice_sellers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sellers" ADD CONSTRAINT "invoice_sellers_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_shares" ADD CONSTRAINT "invoice_shares_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_shares" ADD CONSTRAINT "invoice_shares_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_shares" ADD CONSTRAINT "invoice_shares_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_invoice_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."invoice_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_seller_id_invoice_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."invoice_sellers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_source_quote_id_invoices_id_fk" FOREIGN KEY ("source_quote_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paid_transaction_id_transactions_id_fk" FOREIGN KEY ("paid_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_clients_profile_name_idx" ON "invoice_clients" USING btree ("profile_id","name");--> statement-breakpoint
CREATE INDEX "invoice_clients_workspace_idx" ON "invoice_clients" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_items_invoice_position_uq" ON "invoice_items" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX "invoice_items_profile_idx" ON "invoice_items" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "invoice_items_workspace_idx" ON "invoice_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "invoice_sellers_profile_idx" ON "invoice_sellers" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "invoice_sellers_workspace_idx" ON "invoice_sellers" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_shares_token_uq" ON "invoice_shares" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invoice_shares_invoice_idx" ON "invoice_shares" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_shares_profile_idx" ON "invoice_shares" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "invoice_shares_workspace_idx" ON "invoice_shares" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "invoices_profile_created_idx" ON "invoices" USING btree ("profile_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "invoices_workspace_created_idx" ON "invoices" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" USING btree ("workspace_id","kind","number_seq") WHERE "invoices"."number_seq" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_import_key_uq" ON "invoices" USING btree ("profile_id","import_key") WHERE "invoices"."import_key" is not null;--> statement-breakpoint
CREATE INDEX "invoices_client_idx" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "invoices_seller_idx" ON "invoices" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "invoices_source_quote_idx" ON "invoices" USING btree ("source_quote_id");--> statement-breakpoint
CREATE INDEX "invoices_paid_transaction_idx" ON "invoices" USING btree ("paid_transaction_id");