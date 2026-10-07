CREATE TYPE "public"."ai_chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "ai_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"chat_id" uuid NOT NULL,
	"role" "ai_chat_role" NOT NULL,
	"content" text NOT NULL,
	"units" integer,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_chats" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_chat_id_ai_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."ai_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_chat_messages_chat_created_idx" ON "ai_chat_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_chats_user_workspace_updated_idx" ON "ai_chats" USING btree ("user_id","workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_chats_workspace_idx" ON "ai_chats" USING btree ("workspace_id");