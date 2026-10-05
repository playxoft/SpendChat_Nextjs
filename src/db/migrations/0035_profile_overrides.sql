CREATE TYPE "public"."profile_access_level" AS ENUM('none', 'read', 'write');--> statement-breakpoint
CREATE TABLE "profile_overrides" (
	"profile_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"access" "profile_access_level" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_overrides_profile_id_user_id_pk" PRIMARY KEY("profile_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "profile_overrides" ADD CONSTRAINT "profile_overrides_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_overrides_user_idx" ON "profile_overrides" USING btree ("user_id");