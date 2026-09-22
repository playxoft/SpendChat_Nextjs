CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(20) NOT NULL,
	"color" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "tag_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_name_uq" ON "tags" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "tags_workspace_name_idx" ON "tags" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "transactions_tag_ids_idx" ON "transactions" USING gin ("tag_ids");