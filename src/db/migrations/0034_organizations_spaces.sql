CREATE TYPE "public"."organization_kind" AS ENUM('personal', 'business');--> statement-breakpoint
CREATE TYPE "public"."space_role" AS ENUM('viewer', 'editor');--> statement-breakpoint
CREATE TYPE "public"."workspace_plan" AS ENUM('free', 'plus', 'pro');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" varchar(40) NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "organization_kind" DEFAULT 'personal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_members" (
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "space_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_members_space_id_user_id_pk" PRIMARY KEY("space_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(30) NOT NULL,
	"icon" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_id_workspace_uq" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "space_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD COLUMN "space_ids" uuid[];--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan" "workspace_plan" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "grandfathered" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- ── Backfill (hand-written) ────────────────────────────────────────────────
-- The app must behave exactly as before this migration: every existing profile
-- moves into one "Main" space per workspace, and every non-admin member joins
-- that space at the role they hold today, so nobody's access changes.

-- 1. One personal organisation per account that owns a workspace, named after
--    the owner ("<name>'s organisation", kept within varchar(40)).
INSERT INTO "organizations" ("name", "owner_id", "kind")
SELECT
  CASE
    WHEN d."display" IS NULL OR d."display" = '' THEN 'My organisation'
    ELSE rtrim(left(d."display", 25)) || '''s organisation'
  END,
  d."owner_id",
  'personal'
FROM (
  SELECT DISTINCT w."owner_id",
    coalesce(nullif(trim(u."name"), ''), split_part(u."email", '@', 1)) AS "display"
  FROM "workspaces" w
  LEFT JOIN "users" u ON u."id" = w."owner_id"
) d;
--> statement-breakpoint

-- 2. Each workspace joins its owner's organisation.
UPDATE "workspaces" w
SET "organization_id" = o."id"
FROM "organizations" o
WHERE o."owner_id" = w."owner_id" AND o."kind" = 'personal';
--> statement-breakpoint

-- 3. Every workspace that exists today keeps what it has until the grace period
--    ends (`PLAN_GRACE_ENDS_AT`); the new limits apply only to what's added later.
UPDATE "workspaces" SET "grandfathered" = true;
--> statement-breakpoint

-- 4. One "Main" space per workspace, holding all of its profiles.
INSERT INTO "spaces" ("workspace_id", "name", "icon", "position")
SELECT "id", 'Main', '🗂️', 0 FROM "workspaces";
--> statement-breakpoint
UPDATE "profiles" p
SET "space_id" = s."id"
FROM "spaces" s
WHERE s."workspace_id" = p."workspace_id";
--> statement-breakpoint

-- 5. Non-admin members join Main at their current role (admins see every space
--    without a row). Their access is unchanged: Main holds every profile.
INSERT INTO "space_members" ("space_id", "user_id", "role")
SELECT s."id", m."user_id", m."role"::text::"space_role"
FROM "workspace_members" m
JOIN "spaces" s ON s."workspace_id" = m."workspace_id"
WHERE m."role" <> 'admin';
--> statement-breakpoint

-- 6. Pending workspace-wide invites below admin join Main on acceptance — the
--    same reach "all profiles" had when they were sent.
UPDATE "workspace_invites" i
SET "space_ids" = ARRAY[s."id"]
FROM "spaces" s
WHERE s."workspace_id" = i."workspace_id" AND i."profile_id" IS NULL AND i."role" <> 'admin';
--> statement-breakpoint

-- 7. Lock the new pointers in.
ALTER TABLE "profiles" ALTER COLUMN "space_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
-- ── End of backfill ─────────────────────────────────────────────────────────

ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_personal_owner_uq" ON "organizations" USING btree ("owner_id") WHERE "organizations"."kind" = 'personal';--> statement-breakpoint
CREATE INDEX "space_members_user_idx" ON "space_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "spaces_workspace_position_idx" ON "spaces" USING btree ("workspace_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_workspace_name_uq" ON "spaces" USING btree ("workspace_id","name");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_space_workspace_fk" FOREIGN KEY ("space_id","workspace_id") REFERENCES "public"."spaces"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_space_sort_idx" ON "profiles" USING btree ("space_id","sort_order");--> statement-breakpoint
CREATE INDEX "workspaces_organization_idx" ON "workspaces" USING btree ("organization_id");