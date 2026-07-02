-- Backfill: give every existing user a default workspace ("<name>'s Workspace"),
-- an admin membership in it, and attach their profiles to it. Display names come
-- from neon_auth."user" when that schema exists (it doesn't on the PGlite test
-- database, where this migration runs against empty tables anyway).

-- 1. Users that predate workspaces: anyone with settings or profiles but no membership.
CREATE TEMP TABLE "ws_users" AS
SELECT DISTINCT u."user_id", NULL::text AS "display"
FROM (
  SELECT "user_id" FROM "user_settings"
  UNION
  SELECT "user_id" FROM "profiles"
) u
WHERE NOT EXISTS (
  SELECT 1 FROM "workspace_members" m WHERE m."user_id" = u."user_id"
);
--> statement-breakpoint

-- 2. Resolve display names from Neon Auth (guarded: the schema is Neon-managed
--    and absent in tests).
DO $$
BEGIN
  IF to_regclass('neon_auth.user') IS NOT NULL THEN
    EXECUTE 'UPDATE pg_temp."ws_users" w
             SET "display" = coalesce(nullif(trim(au."name"), ''''), split_part(au."email", ''@'', 1))
             FROM neon_auth."user" au
             WHERE au."id" = w."user_id"';
  END IF;
END $$;
--> statement-breakpoint

-- 3. Mint one workspace per user (uuidv7 ids).
CREATE TEMP TABLE "ws_map" AS
SELECT
  "user_id",
  uuidv7() AS "workspace_id",
  CASE
    WHEN "display" IS NULL OR "display" = '' THEN 'My Workspace'
    ELSE "display" || '''s Workspace'
  END AS "name"
FROM "ws_users";
--> statement-breakpoint
INSERT INTO "workspaces" ("id", "name", "owner_id")
SELECT "workspace_id", "name", "user_id" FROM "ws_map";
--> statement-breakpoint
INSERT INTO "workspace_members" ("workspace_id", "user_id", "role")
SELECT "workspace_id", "user_id", 'admin' FROM "ws_map";
--> statement-breakpoint

-- 4. Attach each user's existing profiles to their new workspace.
UPDATE "profiles" p
SET "workspace_id" = m."workspace_id"
FROM "ws_map" m
WHERE p."user_id" = m."user_id" AND p."workspace_id" IS NULL;
--> statement-breakpoint

-- 5. Open the new workspace by default.
UPDATE "user_settings" s
SET "last_workspace_id" = m."workspace_id"
FROM "ws_map" m
WHERE s."user_id" = m."user_id" AND s."last_workspace_id" IS NULL;
--> statement-breakpoint
DROP TABLE "ws_users";
--> statement-breakpoint
DROP TABLE "ws_map";
--> statement-breakpoint

-- 6. Every profile now belongs to a workspace; lock it in.
ALTER TABLE "profiles" ALTER COLUMN "workspace_id" SET NOT NULL;
