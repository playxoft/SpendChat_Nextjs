CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "description" text;--> statement-breakpoint
CREATE INDEX "profiles_user_sort_idx" ON "profiles" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_user_name_uq" ON "profiles" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_user_profile_idx" ON "transactions" USING btree ("user_id","profile_id");