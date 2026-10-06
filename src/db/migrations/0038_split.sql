CREATE TYPE "public"."split_member_status" AS ENUM('invited', 'joined', 'left');--> statement-breakpoint
CREATE TYPE "public"."split_type" AS ENUM('equal', 'exact', 'percent');--> statement-breakpoint
CREATE TABLE "split_expenses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"group_id" uuid NOT NULL,
	"title" varchar(40) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"paid_by_member_id" uuid NOT NULL,
	"split_type" "split_type" NOT NULL,
	"occurred_on" date NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "split_expenses_amount_positive" CHECK ("split_expenses"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "split_groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" varchar(40) NOT NULL,
	"icon" varchar(16),
	"currency" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_members" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text,
	"display_name" varchar(40),
	"status" "split_member_status" DEFAULT 'invited' NOT NULL,
	"invited_by" uuid,
	"invite_token" text,
	"invite_emailed_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_settlements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"group_id" uuid NOT NULL,
	"from_member_id" uuid NOT NULL,
	"to_member_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"settled_on" date NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "split_settlements_amount_positive" CHECK ("split_settlements"."amount_minor" > 0),
	CONSTRAINT "split_settlements_distinct_members" CHECK ("split_settlements"."from_member_id" <> "split_settlements"."to_member_id")
);
--> statement-breakpoint
CREATE TABLE "split_shares" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"percent_bp" integer,
	"transaction_id" uuid,
	"added_at" timestamp with time zone,
	CONSTRAINT "split_shares_amount_not_negative" CHECK ("split_shares"."amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_group_id_split_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."split_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_paid_by_member_id_split_members_id_fk" FOREIGN KEY ("paid_by_member_id") REFERENCES "public"."split_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_members" ADD CONSTRAINT "split_members_group_id_split_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."split_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_settlements" ADD CONSTRAINT "split_settlements_group_id_split_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."split_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_settlements" ADD CONSTRAINT "split_settlements_from_member_id_split_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."split_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_settlements" ADD CONSTRAINT "split_settlements_to_member_id_split_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."split_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_shares" ADD CONSTRAINT "split_shares_expense_id_split_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."split_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_shares" ADD CONSTRAINT "split_shares_member_id_split_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."split_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_shares" ADD CONSTRAINT "split_shares_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "split_expenses_group_date_idx" ON "split_expenses" USING btree ("group_id","occurred_on" DESC NULLS FIRST,"created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "split_expenses_paid_by_idx" ON "split_expenses" USING btree ("paid_by_member_id");--> statement-breakpoint
CREATE INDEX "split_groups_created_by_idx" ON "split_groups" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "split_members_group_email_uq" ON "split_members" USING btree ("group_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "split_members_group_user_uq" ON "split_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "split_members_invite_token_uq" ON "split_members" USING btree ("invite_token");--> statement-breakpoint
CREATE INDEX "split_members_user_status_idx" ON "split_members" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "split_members_pending_email_idx" ON "split_members" USING btree ("email") WHERE "split_members"."user_id" is null;--> statement-breakpoint
CREATE INDEX "split_settlements_group_date_idx" ON "split_settlements" USING btree ("group_id","settled_on" DESC NULLS FIRST,"created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "split_settlements_from_idx" ON "split_settlements" USING btree ("from_member_id");--> statement-breakpoint
CREATE INDEX "split_settlements_to_idx" ON "split_settlements" USING btree ("to_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "split_shares_expense_member_uq" ON "split_shares" USING btree ("expense_id","member_id");--> statement-breakpoint
CREATE INDEX "split_shares_member_idx" ON "split_shares" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "split_shares_transaction_uq" ON "split_shares" USING btree ("transaction_id") WHERE "split_shares"."transaction_id" is not null;