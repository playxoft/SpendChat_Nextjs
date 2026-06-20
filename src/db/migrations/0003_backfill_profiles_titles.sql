-- Backfill: give every user a default "Personal" profile, attach existing
-- transactions to it, and migrate the legacy `note` into the new `title`.

-- 1. Create a "Personal" profile for each user that has settings but no profile yet.
INSERT INTO "profiles" ("user_id", "name", "icon", "sort_order")
SELECT us."user_id", 'Personal', '👤', 0
FROM "user_settings" us
WHERE NOT EXISTS (
  SELECT 1 FROM "profiles" p WHERE p."user_id" = us."user_id"
);
--> statement-breakpoint

-- 2. Also cover any user that has transactions but no settings row.
INSERT INTO "profiles" ("user_id", "name", "icon", "sort_order")
SELECT DISTINCT t."user_id", 'Personal', '👤', 0
FROM "transactions" t
WHERE NOT EXISTS (
  SELECT 1 FROM "profiles" p WHERE p."user_id" = t."user_id"
);
--> statement-breakpoint

-- 3. Attach all profile-less transactions to that user's "Personal" profile.
UPDATE "transactions" t
SET "profile_id" = p."id"
FROM "profiles" p
WHERE p."user_id" = t."user_id"
  AND p."name" = 'Personal'
  AND t."profile_id" IS NULL;
--> statement-breakpoint

-- 4. Carry the legacy single-line note over into the new title field.
UPDATE "transactions"
SET "title" = "note"
WHERE "title" IS NULL AND "note" IS NOT NULL;
