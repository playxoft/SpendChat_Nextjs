CREATE TABLE "file_tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(30) NOT NULL,
	"color" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "thumbnail_key" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "tag_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "color" varchar(16);--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "system_key" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "tag_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "file_tags_profile_name_uq" ON "file_tags" USING btree ("profile_id",lower("name"));--> statement-breakpoint
CREATE INDEX "file_tags_workspace_idx" ON "file_tags" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "folders_profile_system_uq" ON "folders" USING btree ("profile_id","system_key") WHERE "folders"."system_key" is not null;